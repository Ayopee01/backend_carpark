// Import Require
const { createId } = require('../store');
const { prisma } = require('../../db/prisma');
const { normalizePagination, buildMeta } = require('../../utils/pagination');
const { calculateFee } = require('../../utils/pricing');
const appEvents = require('../../utils/events');
const {
  isGatePaymentSource,
  normalizePaymentSource,
  resolvePaymentSource,
} = require('../../services/paymentSource.service');
const { getConfig } = require('./config.repo');
const { validatePaymentSelection } = require('./paymentSettings.repo');
const defaults = require('../defaults');
const {
  normalizePlateNo,
  normalizeVehicleType,
  toDateOrNull,
  toIsoOrNull,
  toJsonArray,
  toTransactionApi,
} = require('./transactions.mapper');

// Constant fallback เวลาหลังจ่ายเงินแล้วให้ออกจากลาน
const DEFAULT_PAYMENT_EXIT_WINDOW_MINUTES = 30;

// Constant สถานะ transaction ที่จบแล้ว
const TERMINAL_TRANSACTION_STATUSES = new Set(['completed', 'cancelled']);

// Function สร้าง error พร้อม statusCode
function createHttpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

// Function แจ้ง dashboard ว่า transaction มีการเปลี่ยนแปลง
function emitDashboardUpdated(reason, transaction) {
  appEvents.emit('dashboard_updated', {
    reason,
    transactionId: transaction?.id || null,
    plateNo: transaction?.plateNo || null,
    at: new Date().toISOString(),
  });
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

// Function ตรวจว่า transaction ยังสามารถชำระเงินได้หรือไม่
function isPayableTransaction(row) {
  if (!row) return false;
  if (TERMINAL_TRANSACTION_STATUSES.has(row.status)) return false;
  if (row.exitAt) return false;
  return true;
}

// Function ค้นหา transaction ล่าสุดจากทะเบียนรถ โดยเลือกเฉพาะรายการที่ยังจ่ายได้ถ้ากำหนด payableOnly
async function getLatestTransactionByPlateNo(plateNo, { payableOnly = false } = {}, client = prisma) {
  const normalizedPlateNo = normalizePlateNo(plateNo);
  if (!normalizedPlateNo) return null;

  const rows = await client.transaction.findMany({
    where: {
      plateNo: { contains: normalizedPlateNo, mode: 'insensitive' },
      ...(payableOnly ? {
        status: { notIn: [...TERMINAL_TRANSACTION_STATUSES] },
        exitAt: null
      } : {})
    },
    orderBy: { entryAt: 'desc' },
    take: 1
  });

  return rows[0] || null;
}

// Function สร้าง filter สำหรับ lookup เฉพาะรายการที่ยังจ่ายได้
function buildPayableLookupFilter(payableOnly) {
  return payableOnly ? {
    status: { notIn: [...TERMINAL_TRANSACTION_STATUSES] },
    exitAt: null
  } : {};
}

// Function แปลง transaction เป็น candidate สำหรับเลือกทะเบียน
function toPlateCandidate(row) {
  return {
    plateNo: row.plateNo,
    billNo: row.billNo,
    vehicleType: row.vehicleType,
    status: row.status,
    entryAt: toIsoOrNull(row.entryAt),
    exitAt: toIsoOrNull(row.exitAt),
    exitTimeLimit: toIsoOrNull(row.exitTimeLimit),
  };
}

// Function หา candidate transaction จากทะเบียนบางส่วน
async function findPlateTransactionCandidates(plateNo, { payableOnly = false, limit = 10 } = {}, client = prisma) {
  const normalizedPlateNo = normalizePlateNo(plateNo);
  if (!normalizedPlateNo) return [];

  const rows = await client.transaction.findMany({
    where: {
      plateNo: { contains: normalizedPlateNo, mode: 'insensitive' },
      ...buildPayableLookupFilter(payableOnly),
    },
    orderBy: { entryAt: 'desc' },
    take: Math.max(limit * 5, limit),
  });

  const byPlateNo = new Map();
  for (const row of rows) {
    const key = normalizePlateNo(row.plateNo)?.toLowerCase();
    if (key && !byPlateNo.has(key)) byPlateNo.set(key, row);
    if (byPlateNo.size >= limit) break;
  }

  return [...byPlateNo.values()];
}

// Function หา transaction ล่าสุดจากทะเบียนแบบ exact match
async function getLatestExactTransactionByPlateNo(plateNo, { payableOnly = false } = {}, client = prisma) {
  const normalizedPlateNo = normalizePlateNo(plateNo);
  if (!normalizedPlateNo) return null;

  return client.transaction.findFirst({
    where: {
      plateNo: { equals: normalizedPlateNo, mode: 'insensitive' },
      ...buildPayableLookupFilter(payableOnly),
    },
    orderBy: { entryAt: 'desc' },
  });
}

// Function lookup transaction API จาก plateNo พร้อมรองรับหลาย candidate
async function lookupTransactionApiByPlateNo(plateNo, { payableOnly = false, minSearchLength = 4, maxCandidates = 10 } = {}) {
  const normalizedPlateNo = normalizePlateNo(plateNo);
  if (!normalizedPlateNo) {
    return { matchType: 'invalid', message: 'plateNo is required' };
  }
  if (normalizedPlateNo.length < minSearchLength) {
    return { matchType: 'invalid', message: `plateNo must be at least ${minSearchLength} characters` };
  }

  const exact = await getLatestExactTransactionByPlateNo(normalizedPlateNo, { payableOnly });
  if (exact) {
    const context = await getTransactionContext();
    return {
      matchType: 'single',
      transaction: toTransactionApi(exact, context),
    };
  }

  const candidates = await findPlateTransactionCandidates(normalizedPlateNo, { payableOnly, limit: maxCandidates });
  if (!candidates.length) return { matchType: 'not_found' };

  if (candidates.length === 1) {
    const context = await getTransactionContext();
    return {
      matchType: 'single',
      transaction: toTransactionApi(candidates[0], context),
    };
  }

  return {
    matchType: 'multiple',
    requiresSelection: true,
    query: normalizedPlateNo,
    candidates: candidates.map(toPlateCandidate),
  };
}

// Function หา transaction ด้วย id ก่อนแล้ว fallback เป็น plateNo
async function getTransactionByIdOrPlateNo(value, options = {}, client = prisma) {
  if (!value) return null;

  const byId = await getTransactionById(value, client);
  if (byId) return options.payableOnly && !isPayableTransaction(byId) ? null : byId;

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

// Function query transaction ด้วย id หรือทะเบียนรถ แล้วแปลงเป็น API response
async function getTransactionApiByIdOrPlateNo(value, options = {}) {
  const [transaction, context] = await Promise.all([
    getTransactionByIdOrPlateNo(value, options),
    getTransactionContext(),
  ]);

  return toTransactionApi(transaction, context);
}

// Function บันทึกการชำระเงินและอัปเดตสถานะ transaction
async function processPayment(id, {
  plateNo,
  method,
  channel,
  source,
  paymentSource,
  sourceContext,
  routeType,
  amount,
  processedBy,
  device
} = {}) {
  const context = await getTransactionContext();
  const configuredExitWindow = context.systemSettings?.receipt?.paymentBill?.expiryDuration;
  const exitWindowMinutes = Number.isFinite(Number(configuredExitWindow))
    ? Number(configuredExitWindow)
    : DEFAULT_PAYMENT_EXIT_WINDOW_MINUTES;

  const paymentMethod = method || 'cash';

  const resolvedPayment = resolvePaymentSource({
    source,
    paymentSource,
    routeType,
    channel,
    processedBy,
    device,
    sourceContext
  });

  const paymentChannel = resolvedPayment.channel;

  const paymentValidation = await validatePaymentSelection(paymentChannel, paymentMethod);
  if (!paymentValidation.ok) {
    throw createHttpError(400, paymentValidation.message);
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
    const expiryAt = new Date(new Date(paidAt).getTime() + exitWindowMinutes * 60000).toISOString();

    const payAmount = amount !== undefined ? Number(amount) : currentRemaining;
    if (!Number.isFinite(payAmount) || payAmount <= 0) return null;

    const newPayment = {
      id: createId('pay'),
      method: paymentMethod,
      channel: paymentChannel,
      source: resolvedPayment.source,
      sourceContext: resolvedPayment.sourceContext,
      paidAmount: payAmount,
      paidAt,
      expiryAt,
      processedBy: processedBy || (resolvedPayment.source === 'admin' ? 'admin' : 'system'),
      ...(resolvedPayment.device ? {
        deviceId: resolvedPayment.device.deviceId,
        deviceType: resolvedPayment.device.deviceType,
        deviceName: resolvedPayment.device.deviceName,
        deviceLocation: resolvedPayment.device.deviceLocation
      } : {})
    };

    const payments = [...toJsonArray(transaction.payments), newPayment];
    const totalPaid = currentTotalPaid + newPayment.paidAmount;

    const updates = {
      payments,
      totalPaid,
      updatedAt: new Date(paidAt)
    };

    if (isGatePaymentSource(resolvedPayment.source)) {
      updates.exitTimeLimit = new Date(paidAt);
      updates.exitAt = new Date(paidAt);
      updates.status = 'completed';
    } else {
      updates.exitTimeLimit = new Date(expiryAt);
      updates.status = totalPaid >= currentNetAmount ? 'paid_waiting_exit' : 'partially_paid';
    }

    return tx.transaction.update({
      where: { id: transaction.id },
      data: updates
    });
  });

  if (!saved) return null;

  emitDashboardUpdated('payment_processed', saved);
  return toTransactionApi(saved, context);
}

// Function ชำระเงินด้วยทะเบียนรถจาก admin route
async function processPaymentByPlateNo(plateNo, options = {}) {
  return processPayment(null, { ...options, plateNo });
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
  emitDashboardUpdated('transaction_updated', saved);
  return toTransactionApi(saved, context);
}

// Function update transaction ล่าสุดด้วยทะเบียนรถ
async function updateTransactionByPlateNo(plateNo, updates) {
  const transaction = await getLatestTransactionByPlateNo(plateNo);
  if (!transaction) return null;
  return updateTransaction(transaction.id, updates);
}

// Function delete transaction ด้วย id
async function deleteTransaction(id) {
  if (!id) return false;
  const transaction = await getTransactionByIdOrPlateNo(id);
  if (!transaction) return false;
  await prisma.transaction.delete({ where: { id: transaction.id } });
  emitDashboardUpdated('transaction_deleted', transaction);
  return true;
}

// Function delete transaction ล่าสุดด้วยทะเบียนรถ
async function deleteTransactionByPlateNo(plateNo) {
  const transaction = await getLatestTransactionByPlateNo(plateNo);
  if (!transaction) return false;
  return deleteTransaction(transaction.id);
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
  emitDashboardUpdated('transaction_created', saved);
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

// Function หา event กล้องที่ส่งซ้ำในช่วงเวลาสั้น ๆ
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

// Function หา transaction ล่าสุดที่ยังไม่จบของทะเบียนรถ
async function findOpenTransactionByPlateNo(plateNo) {
  const normalizedPlateNo = normalizePlateNo(plateNo);
  if (!normalizedPlateNo) return null;

  return prisma.transaction.findFirst({
    where: {
      plateNo: normalizedPlateNo,
      status: { notIn: ['completed', 'cancelled'] },
    },
    orderBy: { entryAt: 'desc' },
  });
}

// Function สร้างหรือปิด transaction จาก payload กล้อง LPR
async function createCameraTransaction({
  plateNo,
  vehicleType,
  cameraId,
  gateId,
  direction,
  capturedAt,
  imageUrl,
  status,
}) {
  const normalizedPlateNo = normalizePlateNo(plateNo);
  if (!normalizedPlateNo) throw new Error('plateNo is required');

  const capturedTime = capturedAt instanceof Date ? capturedAt : new Date(capturedAt || Date.now());

  if (direction === 'OUT') {
    const existing = await findOpenTransactionByPlateNo(normalizedPlateNo);

    if (existing) {
      const updated = await prisma.transaction.update({
        where: { id: existing.id },
        data: {
          exitAt: capturedTime,
          status: 'completed',
          receipt: {
            ...(existing.receipt || {}),
            camera: {
              cameraId,
              gateId,
              direction,
              capturedAt: capturedTime.toISOString(),
              ...(imageUrl ? { imageUrl } : {}),
            },
          },
        },
      });
      emitDashboardUpdated('camera_transaction_updated', updated);
      return updated;
    }
  }

  if (direction === 'IN') {
    const existing = await findOpenTransactionByPlateNo(normalizedPlateNo);
    if (existing) {
      throw createHttpError(409, 'An active transaction already exists for this plate');
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
          ...(imageUrl ? { imageUrl } : {}),
        },
      },
    },
  });

  emitDashboardUpdated('camera_transaction_created', saved);
  return saved;
}

// Export Functions
module.exports = {
  listTransactions,
  listAllTransactions,
  getTransactionById,
  getTransactionApiById,
  getTransactionApiByIdOrPlateNo,
  lookupTransactionApiByPlateNo,
  updateTransaction,
  updateTransactionByPlateNo,
  deleteTransaction,
  deleteTransactionByPlateNo,
  processPayment,
  processPaymentByPlateNo,
  createTransaction,
  createCameraTransaction,
  findPlateTransactionCandidates,
  findDuplicateCameraTransaction,
  findOpenTransactionByPlateNo,
  normalizePlateNo,
  normalizeVehicleType,
  normalizePaymentSource,
  resolvePaymentSource,
  toTransactionApi
};
