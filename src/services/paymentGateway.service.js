// Import Require
const appEvents = require('../utils/events');
const transactionsRepo = require('../data/repositories/transactions.repo');
const paymentGatewayRepo = require('../data/repositories/paymentGateway.repo');
const omiseService = require('./omise.service');

// Function สร้าง HTTP error พร้อมข้อมูลเสริม
function createHttpError(statusCode, message, extra = {}) {
  const err = new Error(message);
  err.statusCode = statusCode;
  Object.assign(err, extra);
  return err;
}

// Function normalize method สำหรับ gateway payment
function normalizeGatewayMethod(method, sourceType, { token = null, source = null } = {}) {
  const explicitMethod = String(method || '').trim().toLowerCase();
  if (explicitMethod) return explicitMethod;

  const sourceMethod = String(sourceType || '').trim().toLowerCase();
  if (sourceMethod) return sourceMethod;
  if (token) return 'card';
  throw createHttpError(400, 'method or sourceType is required');
}

// Function แปลง charge และ transaction เป็น response
function toChargeResponse({ charge, gatewayCharge, transaction }) {
  return {
    provider: 'omise',
    chargeId: charge.id,
    status: omiseService.normalizeChargeStatus(charge),
    amount: gatewayCharge.amount,
    currency: gatewayCharge.currency,
    plateNo: gatewayCharge.plateNo,
    method: gatewayCharge.method,
    channel: gatewayCharge.channel,
    authorizeUri: charge.authorize_uri || null,
    transaction: {
      plateNo: transaction.plateNo,
      status: transaction.status,
      remainingAmount: transaction.remainingAmount,
      exitTimeLimit: transaction.exitTimeLimit,
    },
    qr: charge.source?.scannable_code || null,
  };
}

// Function เติม /download ให้ document path ของ Omise
function withDownloadPath(documentPath) {
  const value = String(documentPath || '').trim();
  if (!value || /\/download(\?.*)?$/.test(value)) return value;

  const queryIndex = value.indexOf('?');
  if (queryIndex === -1) return `${value}/download`;
  return `${value.slice(0, queryIndex)}/download${value.slice(queryIndex)}`;
}

// Function ดึง path รูป QR จาก Omise charge
function getChargeQrDocumentPaths(charge) {
  const image = charge?.source?.scannable_code?.image;
  const paths = [
    image?.download_uri,
    withDownloadPath(image?.location),
    image?.location,
    image?.uri,
  ].filter(Boolean);

  return [...new Set(paths)];
}

// Function ดึง path รูป QR path แรกที่ใช้ได้
function getChargeQrDocumentPath(charge) {
  return getChargeQrDocumentPaths(charge)[0] || null;
}

// Function ดาวน์โหลด QR document จาก path ที่ใช้ได้ตัวแรก
async function downloadFirstQrDocument(paths) {
  let lastError = null;
  for (const path of paths) {
    try {
      return await omiseService.downloadDocument(path);
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError) throw lastError;
  throw createHttpError(502, 'Omise QR document not found');
}

// Function หา payable transaction จากทะเบียนรถ
async function getPayableTransactionForPlate(plateNo) {
  const lookup = await transactionsRepo.lookupTransactionApiByPlateNo(plateNo, { payableOnly: true });
  if (lookup.matchType === 'invalid') throw createHttpError(400, lookup.message);
  if (lookup.matchType === 'not_found') throw createHttpError(404, 'Transaction not found');
  if (lookup.matchType === 'multiple') {
    throw createHttpError(409, 'Multiple plate matches require user selection', { candidates: lookup.candidates });
  }
  if (!lookup.transaction) throw createHttpError(404, 'Transaction not found');
  return lookup.transaction;
}

// Function หา payable transaction จาก transactionId หรือ plateNo
async function getPayableTransaction({ transactionId, plateNo } = {}) {
  if (transactionId) {
    const transaction = await transactionsRepo.getTransactionApiById(transactionId);
    if (!transaction) throw createHttpError(404, 'Transaction not found');
    if (['completed', 'cancelled'].includes(transaction.status) || transaction.exitAt) {
      throw createHttpError(400, 'Transaction is not payable');
    }
    return transaction;
  }

  if (plateNo) return getPayableTransactionForPlate(plateNo);
  throw createHttpError(400, 'transactionId or plateNo is required');
}

// Function ตรวจ amount ที่ frontend ส่งมาต้องตรงกับยอดค้างชำระ
function validateRequestedMinorAmount(amount, remainingAmount) {
  if (amount === undefined || amount === null || amount === '') return;

  const requestedAmount = Number(amount);
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    throw createHttpError(400, 'amount is invalid');
  }

  const expectedAmount = omiseService.toMinorAmount(remainingAmount);
  if (requestedAmount !== expectedAmount) {
    throw createHttpError(400, 'amount does not match current remaining amount');
  }
}

// Function สร้าง Omise charge สำหรับ client flow
async function createOmiseChargeForClient({
  plateNo,
  source,
  token,
  sourceType,
  method,
  channel,
  processedBy,
  returnUri,
} = {}) {
  if (!plateNo) throw createHttpError(400, 'plateNo is required');
  if (!source && !token) throw createHttpError(400, 'source or token is required');
  if (!channel) throw createHttpError(400, 'payment channel is required');

  const transaction = await getPayableTransactionForPlate(plateNo);
  const remainingAmount = Number(transaction.remainingAmount);
  if (!Number.isFinite(remainingAmount) || remainingAmount <= 0) {
    throw createHttpError(400, 'No payable amount remaining');
  }

  const paymentMethod = normalizeGatewayMethod(method, sourceType, { token, source });
  const charge = await omiseService.createCharge({
    amount: remainingAmount,
    source,
    token,
    returnUri,
    description: `Parking payment ${transaction.plateNo}`,
    metadata: {
      transactionId: transaction.id,
      plateNo: transaction.plateNo,
      channel,
      method: paymentMethod,
      processedBy: processedBy || 'omise',
    },
  });

  const gatewayCharge = await paymentGatewayRepo.createGatewayCharge({
    chargeId: charge.id,
    transactionId: transaction.id,
    plateNo: transaction.plateNo,
    amount: charge.amount,
    currency: charge.currency,
    method: paymentMethod,
    channel,
    status: omiseService.normalizeChargeStatus(charge),
    raw: charge,
  });

  return toChargeResponse({ charge, gatewayCharge, transaction });
}

// Function สร้าง Omise charge สำหรับ admin flow
async function createOmiseChargeForAdmin({
  transactionId,
  plateNo,
  source,
  token,
  sourceType,
  method,
  channel = 'cashier',
  amount,
  processedBy,
  returnUri,
} = {}) {
  if (!source && !token) throw createHttpError(400, 'source or token is required');
  if (channel !== 'cashier') throw createHttpError(400, 'Admin Omise payment channel must be cashier');

  const transaction = await getPayableTransaction({ transactionId, plateNo });
  const remainingAmount = Number(transaction.remainingAmount);
  if (!Number.isFinite(remainingAmount) || remainingAmount <= 0) {
    throw createHttpError(400, 'No payable amount remaining');
  }
  validateRequestedMinorAmount(amount, remainingAmount);

  const paymentMethod = normalizeGatewayMethod(method, sourceType, { token, source });
  const metadata = {
    transactionId: transaction.id,
    plateNo: transaction.plateNo,
    channel: 'cashier',
    method: paymentMethod,
    sourceContext: 'admin',
    processedBy: processedBy || 'admin',
  };
  const charge = await omiseService.createCharge({
    amount: remainingAmount,
    source,
    token,
    returnUri,
    description: `Admin parking payment ${transaction.plateNo}`,
    metadata,
  });
  const raw = {
    ...charge,
    metadata: {
      ...(charge.metadata || {}),
      ...metadata,
    },
  };

  const gatewayCharge = await paymentGatewayRepo.createGatewayCharge({
    chargeId: charge.id,
    transactionId: transaction.id,
    plateNo: transaction.plateNo,
    amount: charge.amount,
    currency: charge.currency,
    method: paymentMethod,
    channel: 'cashier',
    status: omiseService.normalizeChargeStatus(charge),
    raw,
  });

  return toChargeResponse({ charge: raw, gatewayCharge, transaction });
}

// Function ดึงรูป QR จาก Omise charge หรือ document path
async function getOmiseQrImage({ chargeId, documentPath } = {}) {
  if (documentPath) {
    return omiseService.downloadDocument(documentPath);
  }

  if (!chargeId) throw createHttpError(400, 'chargeId or documentPath is required');
  const gatewayCharge = await paymentGatewayRepo.getGatewayChargeByChargeId(chargeId);
  if (!gatewayCharge) throw createHttpError(404, 'Gateway charge not found');
  if (gatewayCharge.provider !== 'omise') throw createHttpError(400, 'Gateway charge is not an Omise charge');
  if (gatewayCharge.method !== 'promptpay') {
    throw createHttpError(400, 'QR image is only available for PromptPay charges');
  }

  let charge = gatewayCharge.raw;
  let qrDocumentPaths = getChargeQrDocumentPaths(charge);
  if (qrDocumentPaths.length === 0) {
    charge = await omiseService.retrieveCharge(chargeId);
    qrDocumentPaths = getChargeQrDocumentPaths(charge);
    await paymentGatewayRepo.updateGatewayCharge(chargeId, { raw: charge });
  }
  if (qrDocumentPaths.length === 0) throw createHttpError(502, 'Omise QR document not found');

  return downloadFirstQrDocument(qrDocumentPaths);
}

// Function ปิด gateway charge ที่สำเร็จและบันทึก payment
async function completeSuccessfulGatewayCharge(existing, charge, { processedByPrefix = 'omise' } = {}) {
  if (existing.processedAt) {
    const updated = await paymentGatewayRepo.updateGatewayCharge(existing.chargeId, {
      status: 'successful',
      raw: charge,
    });
    return {
      action: 'already_processed',
      chargeId: existing.chargeId,
      status: 'successful',
      gatewayCharge: updated,
    };
  }

  const paidAmount = existing.amount / 100;
  const metadata = {
    ...(existing.raw?.metadata || {}),
    ...(charge?.metadata || {}),
  };
  const transaction = await transactionsRepo.processPayment(existing.transactionId, {
    method: existing.method,
    channel: existing.channel,
    amount: paidAmount,
    processedBy: metadata.processedBy || `${processedByPrefix}_${existing.chargeId}`,
  });
  if (!transaction) throw createHttpError(400, 'Payment processing failed');

  const updated = await paymentGatewayRepo.updateGatewayCharge(existing.chargeId, {
    status: 'successful',
    raw: charge,
    paidAt: omiseService.getChargePaidAt(charge) || new Date().toISOString(),
    processedAt: new Date().toISOString(),
  });

  appEvents.emit('payment_updated', {
    type: 'payment_updated',
    provider: 'omise',
    chargeId: existing.chargeId,
    plateNo: transaction.plateNo,
    transactionId: transaction.id,
    paymentStatus: 'successful',
    transactionStatus: transaction.status,
    remainingAmount: transaction.remainingAmount,
    exitTimeLimit: transaction.exitTimeLimit,
    gatewayCharge: updated,
    emittedAt: new Date().toISOString(),
  });

  return {
    action: 'processed',
    chargeId: existing.chargeId,
    status: 'successful',
    transaction,
  };
}

// Function ประมวลผล webhook event จาก Omise
async function processOmiseWebhookEvent(event) {
  const chargeId = omiseService.extractChargeIdFromEvent(event);
  if (!chargeId) throw createHttpError(400, 'Omise charge id not found in webhook event');

  const charge = await omiseService.retrieveCharge(chargeId);
  const status = omiseService.normalizeChargeStatus(charge);
  const existing = await paymentGatewayRepo.getGatewayChargeByChargeId(chargeId);
  if (!existing) {
    return {
      action: 'ignored',
      reason: 'gateway charge not found',
      chargeId,
      status,
    };
  }

  if (existing.processedAt) {
    await paymentGatewayRepo.updateGatewayCharge(chargeId, { status, raw: charge });
    return {
      action: 'already_processed',
      chargeId,
      status,
    };
  }

  if (status !== 'successful') {
    const updated = await paymentGatewayRepo.updateGatewayCharge(chargeId, { status, raw: charge });
    appEvents.emit('payment_updated', {
      type: 'payment_updated',
      provider: 'omise',
      chargeId,
      plateNo: existing.plateNo,
      paymentStatus: status,
      gatewayCharge: updated,
      emittedAt: new Date().toISOString(),
    });
    return { action: 'updated', chargeId, status };
  }

  return completeSuccessfulGatewayCharge(existing, charge);
}

// Function จำลอง charge สำเร็จสำหรับ UAT
async function simulateOmiseChargePaid(chargeId) {
  if (!chargeId) throw createHttpError(400, 'chargeId is required');

  const existing = await paymentGatewayRepo.getGatewayChargeByChargeId(chargeId);
  if (!existing) throw createHttpError(404, 'Gateway charge not found');
  if (existing.provider !== 'omise') throw createHttpError(400, 'Gateway charge is not an Omise charge');

  const simulatedCharge = {
    ...(existing.raw || {}),
    id: chargeId,
    object: 'charge',
    status: 'successful',
    paid: true,
    paid_at: new Date().toISOString(),
  };

  return completeSuccessfulGatewayCharge(existing, simulatedCharge, { processedByPrefix: 'omise_simulated' });
}

// Function ตรวจว่าเปิดโหมดจำลอง payment หรือไม่
function isPaymentSimulationEnabled() {
  return process.env.ENABLE_PAYMENT_SIMULATION === 'true';
}

// Function ตรวจ token สำหรับ payment simulation
function verifyPaymentSimulationToken(token) {
  const expected = process.env.PAYMENT_SIMULATION_TOKEN;
  if (!expected) return true;
  return token === expected;
}

// Export Functions
module.exports = {
  createOmiseChargeForClient,
  createOmiseChargeForAdmin,
  getOmiseQrImage,
  processOmiseWebhookEvent,
  simulateOmiseChargePaid,
  isPaymentSimulationEnabled,
  verifyPaymentSimulationToken,
  normalizeGatewayMethod,
  getChargeQrDocumentPath,
  getChargeQrDocumentPaths,
};
