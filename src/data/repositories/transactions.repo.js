const { store } = require('../store');
const { supabase, isSupabaseEnabled } = require('../../db/supabase');
const { paginate } = require('../../utils/helpers');
const { normalizePagination, buildMeta } = require('../../utils/pagination');
const { calculateFee } = require('../../utils/pricing');
const { getConfig } = require('./config.repo');


function toNumberOrNull(value) {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toTransactionApi(row) {
  if (!row) return null;
  const pricingRules = store.pricingConfig?.pricingRules || [];
  const entryAt = row.entry_at ?? row.entryAt;
  const now = new Date();
  let cutoffAt = row.exit_at ?? row.exitAt;
  let isOverstay = false;

  // Overstay Logic:
  // If car is still inside and it's already past the exitTimeLimit
  if (!cutoffAt && row.exitTimeLimit && now > new Date(row.exitTimeLimit)) {
    isOverstay = true;
    cutoffAt = now.toISOString(); // Use current time to calculate the extra fees
  } 
  // Standard Cutoff: If car is inside but not overstayed, use payment time or now
  else if (!cutoffAt) {
    if (row.status === 'completed' && row.payments?.length > 0) {
      const latestPayment = [...row.payments].sort((a,b) => new Date(b.paidAt) - new Date(a.paidAt))[0];
      cutoffAt = latestPayment.paidAt;
    } else {
      cutoffAt = now.toISOString();
    }
  }

  const exitAt = cutoffAt;
  
  const feeResult = calculateFee(entryAt, exitAt, pricingRules, {
    vehicleType: row.vehicle_type || row.vehicleType,
    serviceType: row.service_type || row.serviceType
  });

  const netAmount = feeResult.totalAmount;
  const totalPaid = row.totalPaid || 0;
  const remainingAmount = Math.max(0, netAmount - totalPaid);
  
  // Final status determination for API
  let finalStatus = row.status;
  if (remainingAmount > 0) {
    finalStatus = totalPaid > 0 ? 'partially_paid' : 'pending';
  }

  // 1. Format Date: DD-MM-YYYY
  const entryDate = new Date(entryAt);
  const day = String(entryDate.getDate()).padStart(2, '0');
  const month = String(entryDate.getMonth() + 1).padStart(2, '0');
  const year = entryDate.getFullYear();
  const dateFormatted = `${day}-${month}-${year}`;

  // 2. Format Duration: H : m
  const durationMs = feeResult.durationMs;
  const hrs = Math.floor(durationMs / (1000 * 60 * 60));
  const mins = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
  const durationFormatted = `${hrs} : ${mins}`;

  return {
    id: row.id,
    billNo: row.bill_no ?? row.billNo,
    plateNo: row.plate_no ?? row.plateNo,
    vehicleType: row.vehicle_type ?? row.vehicleType,
    serviceType: row.service_type ?? row.serviceType,
    entryAt,
    exitAt: row.exit_at ?? row.exitAt,
    calculatedAt: exitAt,
    exitTimeLimit: row.exitTimeLimit || null,
    isOverstay,
    status: finalStatus,
    baseAmount: row.amount ?? feeResult.totalAmount,
    netAmount,
    totalPaid,
    remainingAmount,
    serviceDisplay: `${dateFormatted} | ${durationFormatted}`,
    durationHour: hrs + (mins > 0 ? 1 : 0), // ปัดเศษนาทีขึ้นเป็น 1 ชม. ตามหลักจอดรถ
    totalMinutes: Math.floor(durationMs / 60000),
    payments: (row.payments || []).map(p => ({
      ...p,
      paidAmount: toNumberOrNull(p.amount ?? p.paidAmount)
    })),
    qrData: `${store.systemSettings?.general?.frontendUrl || 'http://localhost:3000'}/payment?tx=${row.id}`,
    createdAt: row.createdAt || row.entry_at || entryAt,
    updatedAt: row.updatedAt || row.exit_at || entryAt
  };
}


async function listTransactions({ keyword, plateNo, billNo, status, paymentStatus, startDate, endDate, excludeOverstay, page = 1, perPage = 10 } = {}) {
  if (!isSupabaseEnabled) {
    let rows = [...store.transactions].map(toTransactionApi);

    if (keyword) {
      const kw = String(keyword).toLowerCase();
      rows = rows.filter((item) => [item.billNo, item.plateNo, item.serviceType].some((field) => String(field).toLowerCase().includes(kw)));
    }

    if (plateNo) {
      const normalizedQuery = plateNo.replace(/[\s-]/g, '').toLowerCase();
      rows = rows.filter((item) => {
        const normalizedItem = String(item.plateNo || '').replace(/[\s-]/g, '').toLowerCase();
        return normalizedItem.includes(normalizedQuery);
      });
    }
    if (billNo) rows = rows.filter((item) => item.billNo.includes(billNo));
    if (status) rows = rows.filter((item) => item.status === status);
    if (paymentStatus) rows = rows.filter((item) => item.payments.some(p => p.status === paymentStatus));
    if (excludeOverstay) rows = rows.filter((item) => !item.isOverstay);

    if (startDate) {
      rows = rows.filter((item) => new Date(item.entryAt) >= new Date(startDate));
    }
    if (endDate) {
      rows = rows.filter((item) => new Date(item.entryAt) <= new Date(endDate));
    }

    return paginate(rows, page, perPage);
  }

  const { page: safePage, perPage: safePerPage, from, to } = normalizePagination(page, perPage);

  let query = supabase.from('transactions').select('*', { count: 'exact' });

  if (keyword) {
    const kw = String(keyword).replace(/%/g, '\\%').replace(/_/g, '\\_');
    query = query.or(`bill_no.ilike.%${kw}%,plate_no.ilike.%${kw}%,service_type.ilike.%${kw}%`);
  }

  if (plateNo) {
    // ลบขีดและช่องว่างออก แล้วเอาตัวอักษรมาคั่นด้วย % (Fuzzy Match) เพื่อให้ค้นหา "กข12" แล้วเจอ "กข-12"
    const fuzzyPlate = plateNo.replace(/[\s-]/g, '').split('').join('%');
    query = query.ilike('plate_no', `%${fuzzyPlate}%`);
  }
  if (billNo) query = query.ilike('bill_no', `%${billNo}%`);
  if (status) query = query.eq('status', status);

  if (startDate) query = query.gte('entry_at', startDate);
  if (endDate) query = query.lte('entry_at', endDate);

  const { data, error, count } = await query.order('updated_at', { ascending: false }).range(from, to);
  if (error) throw error;

  return {
    data: (data || []).map(toTransactionApi),
    meta: buildMeta(safePage, safePerPage, count)
  };
}

async function listAllTransactions({ startDate, endDate } = {}) {
  if (!isSupabaseEnabled) {
    let rows = [...store.transactions];

    if (startDate) {
      rows = rows.filter((item) => new Date(item.entryAt) >= new Date(startDate));
    }

    if (endDate) {
      rows = rows.filter((item) => new Date(item.entryAt) <= new Date(endDate));
    }

    return rows.map(toTransactionApi);
  }

  let query = supabase.from('transactions').select('*');

  if (startDate) query = query.gte('entry_at', startDate);
  if (endDate) query = query.lte('entry_at', endDate);

  const { data, error } = await query;

  if (error) throw error;

  return (data || []).map(toTransactionApi);
}

async function getTransactionById(id) {
  if (!id) return null;

  if (!isSupabaseEnabled) {
    return store.transactions.find((item) => item.id === id) || null;
  }

  const { data, error } = await supabase.from('transactions').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

async function processPayment(id, { method, channel, amount, processedBy }) {
  try {
    const transaction = await getTransactionById(id);
    if (!transaction) return null;

    // 1. Calculate current fee again to get fresh netAmount
    const pricingRules = store.pricingConfig?.pricingRules || [];
    const entryAt = transaction.entry_at || transaction.entryAt;
    const now = new Date().toISOString();
    
    const feeResult = calculateFee(entryAt, now, pricingRules, {
      vehicleType: transaction.vehicleType || transaction.vehicle_type,
      serviceType: transaction.serviceType || transaction.service_type
    });

    const currentNetAmount = feeResult.totalAmount;
    const currentTotalPaid = transaction.totalPaid || 0;
    const currentRemaining = Math.max(0, currentNetAmount - currentTotalPaid);

    // 2. Setup Expiry
    const gracePeriodMinutes = store.systemSettings?.receipt?.paymentBill?.expiryDuration || store.pricingConfig?.gracePeriod || 15;
    const paidAt = now;
    const expiryAt = new Date(new Date(paidAt).getTime() + gracePeriodMinutes * 60000).toISOString();

    const payAmount = amount !== undefined ? Number(amount) : currentRemaining;

    const newPayment = {
      id: `pay_${Date.now()}`,
      method: method || 'cash',
      channel: channel || 'cashier',
      paidAmount: payAmount,
      paidAt,
      expiryAt,
      processedBy: processedBy || 'u1'
    };

    transaction.payments = transaction.payments || [];
    transaction.payments.push(newPayment);
    transaction.totalPaid = (transaction.totalPaid || 0) + newPayment.paidAmount;
    transaction.updatedAt = paidAt;

    // 3. Update Exit Limit and Status
    if (channel === 'gate') {
      transaction.exitTimeLimit = paidAt;
      transaction.exitAt = paidAt;
      transaction.status = 'completed';
    } else {
      transaction.exitTimeLimit = expiryAt;
      if (transaction.totalPaid >= currentNetAmount) {
        transaction.status = 'completed';
      } else {
        transaction.status = 'partially_paid';
      }
    }

    return toTransactionApi(transaction);
  } catch (err) {
    throw err;
  }
}

async function saveTransaction(transaction) {
  if (!transaction) return null;

  if (!isSupabaseEnabled) {
    return transaction;
  }

  const { data, error } = await supabase
    .from('transactions')
    .update({
      bill_no: transaction.billNo,
      plate_no: transaction.plateNo,
      vehicle_type: transaction.vehicleType,
      service_type: transaction.serviceType,
      entry_at: transaction.entryAt,
      exit_at: transaction.exitAt,
      duration_minute: transaction.durationMinute,
      amount: transaction.amount,
      vat: transaction.vat,
      discount: transaction.discount,
      net_amount: transaction.netAmount,
      status: transaction.status,
      payments: transaction.payments,
      total_paid: transaction.totalPaid,
      receipt: transaction.receipt
    })
    .eq('id', transaction.id)
    .select('*')
    .single();

  if (error) throw error;
  return toTransactionApi(data);
}

async function updateTransaction(id, updates) {
  if (!id) return null;

  if (!isSupabaseEnabled) {
    const index = store.transactions.findIndex(t => t.id === id);
    if (index === -1) return null;
    
    // Support both plateNo and plate_no for updates
    const current = store.transactions[index];
    const updated = { 
      ...current, 
      ...updates,
      plateNo: updates.plateNo ?? current.plateNo ?? current.plate_no,
      plate_no: updates.plateNo ?? current.plateNo ?? current.plate_no,
      updatedAt: new Date().toISOString()
    };
    
    store.transactions[index] = updated;
    return toTransactionApi(updated);
  }

  // Handle Supabase mapping for updates
  const dbUpdates = {};
  if (updates.plateNo !== undefined) dbUpdates.plate_no = updates.plateNo;
  if (updates.vehicleType !== undefined) dbUpdates.vehicle_type = updates.vehicleType;
  if (updates.serviceType !== undefined) dbUpdates.service_type = updates.serviceType;
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.totalPaid !== undefined) dbUpdates.total_paid = updates.totalPaid;
  if (updates.payments !== undefined) dbUpdates.payments = updates.payments;
  
  dbUpdates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('transactions')
    .update(dbUpdates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return toTransactionApi(data);
}

async function deleteTransaction(id) {
  if (!id) return false;

  if (!isSupabaseEnabled) {
    const index = store.transactions.findIndex(t => t.id === id);
    if (index === -1) return false;
    store.transactions.splice(index, 1);
    return true;
  }

  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw error;
  return true;
}

async function createTransaction({ plateNo, vehicleType = 'car', serviceType = 'parking', entryAt }) {
  if (!plateNo) throw new Error('plateNo is required');

  const now = new Date();
  const entryTime = entryAt || now.toISOString();
  
  // Format billNo as PKYYYYMMDD-HHMMSS
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const mins = String(now.getMinutes()).padStart(2, '0');
  const secs = String(now.getSeconds()).padStart(2, '0');
  const billNo = `PK${year}${month}${day}-${hours}${mins}${secs}`;

  const newTransaction = {
    id: `t_${Date.now()}_${Math.floor(Math.random()*1000)}`, // Simple unique ID since createId is not available
    billNo: billNo,
    plateNo: plateNo,
    vehicleType: vehicleType,
    serviceType: serviceType,
    entryAt: entryTime,
    status: 'pending',
    totalPaid: 0,
    payments: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };

  if (!isSupabaseEnabled) {
    store.transactions.push(newTransaction);
    return toTransactionApi(newTransaction);
  }

  const { data, error } = await supabase
    .from('transactions')
    .insert([{
      id: newTransaction.id,
      bill_no: newTransaction.billNo,
      plate_no: newTransaction.plateNo,
      vehicle_type: newTransaction.vehicleType,
      service_type: newTransaction.serviceType,
      entry_at: newTransaction.entryAt,
      status: newTransaction.status,
      total_paid: newTransaction.totalPaid,
      payments: newTransaction.payments
    }])
    .select('*')
    .single();

  if (error) throw error;
  return toTransactionApi(data);
}

module.exports = {
  listTransactions,
  listAllTransactions,
  getTransactionById,
  saveTransaction,
  updateTransaction,
  deleteTransaction,
  processPayment,
  createTransaction,
  toTransactionApi // Exported for route usage
};
