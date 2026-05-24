// Import Require
const { createId } = require('../store');
const { prisma } = require('../../db/prisma');
const { normalizePagination, buildMeta } = require('../../utils/pagination');
const { calculateFee } = require('../../utils/pricing');
const { getConfig } = require('./config.repo');
const defaults = require('../defaults');

// Function แปลงค่าให้เป็น number ถ้าแปลงไม่ได้ให้คืนค่า null
function toNumberOrNull(value) {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

// Function แปลงค่าให้เป็น Date ถ้าไม่มีค่าให้คืนค่า null
function toDateOrNull(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Function แปลง Date เป็น ISO string ถ้าไม่มีค่าให้คืนค่า null
function toIsoOrNull(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

// Function ทำให้ค่า JSON เป็น array เสมอ
function toJsonArray(value) {
  return Array.isArray(value) ? value : [];
}

// Function normalize ทะเบียนรถ โดยตัดช่องว่างและขีดออกก่อนค้นหา/บันทึก
function normalizePlateNo(plateNo) {
  return plateNo ? String(plateNo).trim().replace(/[\s-]/g, '') : null;
}

// Function normalize ประเภทรถให้เหลือเฉพาะค่าที่ระบบรองรับ
function normalizeVehicleType(vehicleType) {
  const normalized = vehicleType ? String(vehicleType).trim().toLowerCase() : 'car';
  return ['car', 'motorcycle'].includes(normalized) ? normalized : 'car';
}

// Function เดาว่า keyword น่าจะเป็นเลขทะเบียน เพื่อเลือกวิธีค้นหาให้เหมาะสม
function isLikelyPlateKeyword(value) {
  const normalized = normalizePlateNo(value);
  if (!normalized) return false;
  return /[\p{L}]/u.test(normalized) && /\d/.test(normalized);
}

// Function query config ที่จำเป็นสำหรับคำนวณ transaction
async function getTransactionContext() {
  const [pricingConfig, systemSettings] = await Promise.all([
    getConfig('pricing_config', defaults.pricingConfig),
    getConfig('system_settings', defaults.systemSettings),
  ]);
  return { pricingConfig, systemSettings };
}

// Function แปลง transaction record เป็นรูปแบบ API และคำนวณยอดเงินล่าสุด
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
    if (row.status === 'completed' && payments.length > 0) {
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
  if (remainingAmount > 0) {
    finalStatus = totalPaid > 0 ? 'partially_paid' : 'pending';
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

// Function สร้าง Prisma where สำหรับ filter transaction
function buildWhere({ keyword, plateNo, billNo, status, startDate, endDate } = {}) {
  const AND = [];

  if (keyword) {
    if (isLikelyPlateKeyword(keyword)) {
      AND.push({ plateNo: { contains: normalizePlateNo(keyword), mode: 'insensitive' } });
    } else {
      const contains = String(keyword);
      AND.push({
        OR: [
          { billNo: { contains, mode: 'insensitive' } },
          { plateNo: { contains, mode: 'insensitive' } },
          { serviceType: { contains, mode: 'insensitive' } }
        ]
      });
    }
  }

  if (plateNo) {
    AND.push({ plateNo: { contains: String(plateNo).replace(/[\s-]/g, ''), mode: 'insensitive' } });
  }
  if (billNo) AND.push({ billNo: { contains: String(billNo), mode: 'insensitive' } });
  if (Array.isArray(status) && status.length) {
    AND.push({ status: { in: status } });
  } else if (status) {
    AND.push({ status });
  }

  if (startDate || endDate) {
    AND.push({
      entryAt: {
        ...(startDate ? { gte: new Date(startDate) } : {}),
        ...(endDate ? { lte: new Date(endDate) } : {})
      }
    });
  }

  return AND.length ? { AND } : undefined;
}

// Function query transaction แบบ pagination และ filter เพิ่มตามสถานะการจ่ายเงิน
async function listTransactions(filters = {}) {
  const { paymentStatus, excludeOverstay, all = false, page = 1, perPage = 10 } = filters;
  const { page: safePage, perPage: safePerPage, from } = normalizePagination(page, perPage);
  const context = await getTransactionContext();
  const where = buildWhere(filters);

  const [rowsRaw, count] = all
    ? [
      await prisma.transaction.findMany({
        where,
        orderBy: { updatedAt: 'desc' }
      }),
      null
    ]
    : await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: from,
        take: safePerPage
      }),
      prisma.transaction.count({ where })
    ]);

  let rows = rowsRaw.map((row) => toTransactionApi(row, context));
  if (paymentStatus) rows = rows.filter((item) => item.payments.some((payment) => payment.status === paymentStatus));
  if (excludeOverstay) rows = rows.filter((item) => !item.isOverstay);

  return {
    data: rows,
    meta: all
      ? { all: true, total: rows.length, totalFound: rows.length }
      : buildMeta(safePage, safePerPage, count)
  };
}

// Function query transaction ทั้งหมดตามช่วงวันที่
async function listAllTransactions({ startDate, endDate } = {}) {
  const context = await getTransactionContext();
  const where = buildWhere({ startDate, endDate });
  const rows = await prisma.transaction.findMany({ where });
  return rows.map((row) => toTransactionApi(row, context));
}

// Function query transaction record ด้วย id
async function getTransactionById(id, client = prisma) {
  if (!id) return null;
  return client.transaction.findUnique({ where: { id } });
}

// Function ค้นหา transaction ล่าสุดจากทะเบียนรถ โดยเลือกเฉพาะรายการที่ยังจ่ายได้ถ้ากำหนด payableOnly
async function getLatestTransactionByPlateNo(plateNo, { payableOnly = false } = {}, client = prisma) {
  const normalizedPlateNo = normalizePlateNo(plateNo);
  if (!normalizedPlateNo) return null;

  const rows = await client.transaction.findMany({
    where: {
      plateNo: { contains: normalizedPlateNo, mode: 'insensitive' },
      ...(payableOnly ? { status: { notIn: ['completed', 'cancelled'] } } : {})
    },
    orderBy: { entryAt: 'desc' },
    take: 1
  });

  return rows[0] || null;
}

// Function ค้นหา transaction ด้วย id ก่อน ถ้าไม่พบจึงลองค้นหาด้วยทะเบียนรถ
async function getTransactionByIdOrPlateNo(value, options = {}, client = prisma) {
  if (!value) return null;

  const byId = await getTransactionById(value, client);
  if (byId) return byId;

  return getLatestTransactionByPlateNo(value, options, client);
}

// Function query transaction ด้วย id และแปลงเป็นรูปแบบ API
async function getTransactionApiById(id) {
  const [transaction, context] = await Promise.all([
    getTransactionById(id),
    getTransactionContext(),
  ]);

  return toTransactionApi(transaction, context);
}

// Function query transaction ล่าสุดด้วยทะเบียนรถแล้วแปลงเป็น API response
async function getTransactionApiByPlateNo(plateNo, options = {}) {
  const [transaction, context] = await Promise.all([
    getLatestTransactionByPlateNo(plateNo, options),
    getTransactionContext(),
  ]);

  return toTransactionApi(transaction, context);
}

// Function query transaction ด้วย id หรือทะเบียนรถ แล้วแปลงเป็น API response
async function getTransactionApiByIdOrPlateNo(value, options = {}) {
  const [transaction, context] = await Promise.all([
    getTransactionByIdOrPlateNo(value, options),
    getTransactionContext(),
  ]);

  return toTransactionApi(transaction, context);
}

// Function บันทึกการชำระเงินและอัปเดตสถานะ transaction
async function processPayment(id, { plateNo, method, channel, amount, processedBy, device } = {}) {
  const context = await getTransactionContext();
  const gracePeriodMinutes = context.systemSettings?.receipt?.paymentBill?.expiryDuration ?? context.pricingConfig?.gracePeriod;

  if (!Number.isFinite(Number(gracePeriodMinutes))) {
    throw new Error('Missing grace period config. Set receipt.paymentBill.expiryDuration or pricing_config.gracePeriod in seed data.');
  }

  const saved = await prisma.$transaction(async (tx) => {
    const transaction = id
      ? await getTransactionByIdOrPlateNo(id, { payableOnly: true }, tx)
      : await getLatestTransactionByPlateNo(plateNo, { payableOnly: true }, tx);
    if (!transaction) return null;

    const pricingRules = context.pricingConfig?.pricingRules || [];
    const entryAt = toIsoOrNull(transaction.entryAt);
    const paidAt = new Date().toISOString();

    const feeResult = calculateFee(entryAt, paidAt, pricingRules, {
      vehicleType: transaction.vehicleType,
      serviceType: transaction.serviceType
    });

    const currentNetAmount = feeResult.totalAmount;
    const currentTotalPaid = Number(transaction.totalPaid ?? 0);
    const currentRemaining = Math.max(0, currentNetAmount - currentTotalPaid);
    const expiryAt = new Date(new Date(paidAt).getTime() + gracePeriodMinutes * 60000).toISOString();
    const payAmount = amount !== undefined ? Number(amount) : currentRemaining;
    if (!Number.isFinite(payAmount) || payAmount <= 0) return null;

    const newPayment = {
      id: createId('pay'),
      method: method || 'cash',
      channel: channel || 'cashier',
      paidAmount: payAmount,
      paidAt,
      expiryAt,
      processedBy: processedBy || 'system',
      ...(device ? {
        deviceId: device.deviceId,
        deviceType: device.deviceType,
        deviceName: device.deviceName,
        deviceLocation: device.deviceLocation,
        ...(device.deviceType === 'kiosk' ? {
          kioskDeviceId: device.deviceId,
          kioskName: device.deviceName,
          kioskLocation: device.deviceLocation,
        } : {})
      } : {})
    };

    const payments = [...toJsonArray(transaction.payments), newPayment];
    const totalPaid = currentTotalPaid + newPayment.paidAmount;
    const updates = {
      payments,
      totalPaid,
      updatedAt: new Date(paidAt)
    };

    if (channel === 'gate') {
      updates.exitTimeLimit = new Date(paidAt);
      updates.exitAt = new Date(paidAt);
      updates.status = 'completed';
    } else {
      updates.exitTimeLimit = new Date(expiryAt);
      updates.status = totalPaid >= currentNetAmount ? 'completed' : 'partially_paid';
    }

    return tx.transaction.update({
      where: { id: transaction.id },
      data: updates
    });
  });
  if (!saved) return null;

  return toTransactionApi(saved, context);
}

// Function update transaction บาง field ด้วย id
async function updateTransaction(id, updates) {
  if (!id) return null;

  const transaction = await getTransactionByIdOrPlateNo(id);
  if (!transaction) return null;

  const data = {};
  if (updates.plateNo !== undefined) data.plateNo = normalizePlateNo(updates.plateNo);
  if (updates.vehicleType !== undefined) data.vehicleType = updates.vehicleType;
  if (updates.serviceType !== undefined) data.serviceType = updates.serviceType;
  if (updates.status !== undefined) data.status = updates.status;
  if (updates.totalPaid !== undefined) data.totalPaid = updates.totalPaid;
  if (updates.payments !== undefined) data.payments = updates.payments;
  if (updates.exitTimeLimit !== undefined) data.exitTimeLimit = toDateOrNull(updates.exitTimeLimit);
  if (updates.exitAt !== undefined) data.exitAt = toDateOrNull(updates.exitAt);

  const saved = await prisma.transaction.update({
    where: { id: transaction.id },
    data
  });

  const context = await getTransactionContext();
  return toTransactionApi(saved, context);
}

// Function delete transaction ด้วย id
async function deleteTransaction(id) {
  if (!id) return false;
  const transaction = await getTransactionByIdOrPlateNo(id);
  if (!transaction) return false;
  await prisma.transaction.delete({ where: { id: transaction.id } });
  return true;
}

// Function create transaction ใหม่ตอนรถเข้า
async function createTransaction({ plateNo, vehicleType = 'car', serviceType = 'parking', entryAt }) {
  const normalizedPlateNo = normalizePlateNo(plateNo);
  if (!normalizedPlateNo) throw new Error('plateNo is required');

  const now = new Date();
  const entryTime = entryAt ? new Date(entryAt) : now;

  const saved = await prisma.transaction.create({
    data: {
      id: createId('t'),
      billNo: createBillNo(entryTime),
      plateNo: normalizedPlateNo,
      vehicleType: normalizeVehicleType(vehicleType),
      serviceType,
      entryAt: entryTime,
      status: 'pending',
      totalPaid: 0,
      payments: []
    }
  });

  const context = await getTransactionContext();
  return toTransactionApi(saved, context);
}

// Function สร้างเลขบิลจากวันเวลา พร้อม suffix กันเลขซ้ำจาก event กล้อง
function createBillNo(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const mins = String(date.getMinutes()).padStart(2, '0');
  const secs = String(date.getSeconds()).padStart(2, '0');
  return `PK${year}${month}${day}-${hours}${mins}${secs}-${String(Date.now()).slice(-4)}`;
}

// Function find repeated camera event in a short time window.
async function findDuplicateCameraTransaction({ plateNo, cameraId, direction, capturedAt }, windowMs = 10000) {
  const normalizedPlateNo = normalizePlateNo(plateNo);
  if (!normalizedPlateNo || !cameraId || !direction) return null;

  const capturedTime = capturedAt instanceof Date ? capturedAt : new Date(capturedAt);
  const rows = await prisma.transaction.findMany({
    where: {
      plateNo: normalizedPlateNo,
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return rows.find((row) => {
    const camera = row.receipt?.camera || {};
    const cameraCapturedAt = camera.capturedAt ? new Date(camera.capturedAt) : null;
    const isSameEventTime = cameraCapturedAt
      ? Math.abs(cameraCapturedAt.getTime() - capturedTime.getTime()) <= windowMs
      : false;

    return camera.cameraId === cameraId && camera.direction === direction && isSameEventTime;
  }) || null;
}

// Function create transaction from LPR/camera body payload.
async function createCameraTransaction({
  plateNo,
  vehicleType,
  cameraId,
  gateId,
  direction,
  capturedAt,
  confidence,
  imageUrl,
  status,
}) {
  const normalizedPlateNo = normalizePlateNo(plateNo);
  if (!normalizedPlateNo) throw new Error('plateNo is required');

  const capturedTime = capturedAt instanceof Date ? capturedAt : new Date(capturedAt || Date.now());

  if (direction === 'OUT') {
    const existing = await prisma.transaction.findFirst({
      where: {
        plateNo: normalizedPlateNo,
        status: { notIn: ['completed', 'cancelled'] },
      },
      orderBy: { entryAt: 'desc' },
    });

    if (existing) {
      return prisma.transaction.update({
        where: { id: existing.id },
        data: {
          exitAt: capturedTime,
          receipt: {
            ...(existing.receipt || {}),
            camera: {
              cameraId,
              gateId,
              direction,
              capturedAt: capturedTime.toISOString(),
              ...(confidence !== undefined ? { confidence } : {}),
              ...(imageUrl ? { imageUrl } : {}),
            },
          },
        },
      });
    }
  }

  const saved = await prisma.transaction.create({
    data: {
      id: createId('t'),
      billNo: createBillNo(capturedTime),
      plateNo: normalizedPlateNo,
      vehicleType: normalizeVehicleType(vehicleType),
      serviceType: 'parking',
      entryAt: capturedTime,
      exitAt: direction === 'OUT' ? capturedTime : null,
      status,
      totalPaid: 0,
      payments: [],
      receipt: {
        camera: {
          cameraId,
          gateId,
          direction,
          capturedAt: capturedTime.toISOString(),
          ...(confidence !== undefined ? { confidence } : {}),
          ...(imageUrl ? { imageUrl } : {}),
        },
      },
    },
  });

  return saved;
}

// Export Functions
module.exports = {
  listTransactions,
  listAllTransactions,
  getTransactionById,
  getTransactionApiById,
  getTransactionApiByPlateNo,
  getTransactionApiByIdOrPlateNo,
  updateTransaction,
  deleteTransaction,
  processPayment,
  createTransaction,
  createCameraTransaction,
  findDuplicateCameraTransaction,
  normalizePlateNo,
  normalizeVehicleType,
  toTransactionApi
};
