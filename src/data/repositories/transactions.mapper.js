// Import Require
const { calculateFee } = require('../../utils/pricing');
const defaults = require('../defaults');

// Function แปลงค่าเป็น number ถ้าแปลงไม่ได้ให้คืน null
function toNumberOrNull(value) {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

// Function แปลงค่าเป็น Date ถ้าไม่มีค่าให้คืน null
function toDateOrNull(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Function แปลง Date เป็น ISO string
function toIsoOrNull(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

// Function บังคับค่า JSON ให้เป็น array
function toJsonArray(value) {
  return Array.isArray(value) ? value : [];
}

// Function normalize ทะเบียนรถก่อนค้นหา/บันทึก
function normalizePlateNo(plateNo) {
  return plateNo ? String(plateNo).trim().replace(/[\s-]/g, '') : null;
}

// Function normalize ประเภทรถให้เป็นค่าที่ระบบรองรับ
function normalizeVehicleType(vehicleType) {
  const normalized = vehicleType ? String(vehicleType).trim().toLowerCase() : 'car';
  return ['car', 'motorcycle'].includes(normalized) ? normalized : 'car';
}

// Function แปลง transaction record เป็น API response
function toTransactionApi(row, context = {}) {
  if (!row) return null;
  const pricingRules = context.pricingConfig?.pricingRules || defaults.pricingConfig.pricingRules;
  const entryAt = toIsoOrNull(row.entryAt);
  const now = new Date();
  let cutoffAt = toIsoOrNull(row.exitAt);
  let isOverstay = false;
  const payments = toJsonArray(row.payments);
  const exitTimeLimit = toIsoOrNull(row.exitTimeLimit);

  if (!cutoffAt && exitTimeLimit && now > new Date(exitTimeLimit)) {
    isOverstay = true;
    cutoffAt = now.toISOString();
  } else if (!cutoffAt) {
    if (['completed', 'paid_waiting_exit'].includes(row.status) && payments.length > 0) {
      const latestPayment = [...payments].sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt))[0];
      cutoffAt = latestPayment.paidAt;
    } else {
      cutoffAt = now.toISOString();
    }
  }

  const feeResult = calculateFee(entryAt, cutoffAt, pricingRules, {
    vehicleType: row.vehicleType,
    serviceType: row.serviceType
  });

  const netAmount = feeResult.totalAmount;
  const totalPaid = Number(row.totalPaid ?? 0);
  const remainingAmount = Math.max(0, netAmount - totalPaid);
  let finalStatus = row.status;
  if (row.status === 'cancelled') {
    finalStatus = 'cancelled';
  } else if (row.exitAt) {
    finalStatus = 'completed';
  } else if (remainingAmount > 0) {
    finalStatus = totalPaid > 0 ? 'partially_paid' : 'pending';
  } else if (totalPaid > 0 || payments.length > 0) {
    finalStatus = 'paid_waiting_exit';
  }

  const entryDate = new Date(entryAt);
  const day = String(entryDate.getDate()).padStart(2, '0');
  const month = String(entryDate.getMonth() + 1).padStart(2, '0');
  const year = entryDate.getFullYear();
  const dateFormatted = `${day}-${month}-${year}`;

  const durationMs = feeResult.durationMs;
  const hrs = Math.floor(durationMs / (1000 * 60 * 60));
  const mins = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
  const durationFormatted = `${hrs} : ${mins}`;

  return {
    id: row.id,
    billNo: row.billNo,
    plateNo: row.plateNo,
    vehicleType: row.vehicleType,
    entryAt,
    exitAt: toIsoOrNull(row.exitAt),
    calculatedAt: cutoffAt,
    exitTimeLimit,
    isOverstay,
    status: finalStatus,
    baseAmount: Number(row.amount ?? feeResult.totalAmount),
    netAmount,
    totalPaid,
    remainingAmount,
    serviceDisplay: `${dateFormatted} | ${durationFormatted}`,
    durationHour: hrs + (mins > 0 ? 1 : 0),
    totalMinutes: Math.floor(durationMs / 60000),
    payments: payments.map((payment) => ({
      ...payment,
      paidAmount: toNumberOrNull(payment.amount ?? payment.paidAmount)
    })),
    qrData: `${context.systemSettings?.general?.frontendUrl || ''}/payment?tx=${row.id}`,
    createdAt: toIsoOrNull(row.createdAt) || entryAt,
    updatedAt: toIsoOrNull(row.updatedAt) || toIsoOrNull(row.exitAt) || entryAt
  };
}

// Export Functions
module.exports = {
  normalizePlateNo,
  normalizeVehicleType,
  toDateOrNull,
  toIsoOrNull,
  toJsonArray,
  toTransactionApi,
};
