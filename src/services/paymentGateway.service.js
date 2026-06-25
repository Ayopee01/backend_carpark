const appEvents = require('../utils/events');
const {
  lookupTransactionApiByPlateNo,
  processPayment,
} = require('../data/repositories/transactions.repo');
const paymentGatewayRepo = require('../data/repositories/paymentGateway.repo');
const omiseService = require('./omise.service');

function createHttpError(statusCode, message, extra = {}) {
  const err = new Error(message);
  err.statusCode = statusCode;
  Object.assign(err, extra);
  return err;
}

function normalizeGatewayMethod(method, sourceType, { token = null, source = null } = {}) {
  const explicitMethod = String(method || '').trim().toLowerCase();
  if (explicitMethod) return explicitMethod;

  const sourceMethod = String(sourceType || '').trim().toLowerCase();
  if (sourceMethod) return sourceMethod;
  if (token) return 'card';
  throw createHttpError(400, 'method or sourceType is required');
}

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

function getChargeQrDocumentPath(charge) {
  return charge?.source?.scannable_code?.image?.location
    || charge?.source?.scannable_code?.image?.download_uri
    || charge?.source?.scannable_code?.image?.uri
    || null;
}

async function getPayableTransactionForPlate(plateNo) {
  const lookup = await lookupTransactionApiByPlateNo(plateNo, { payableOnly: true });
  if (lookup.matchType === 'invalid') throw createHttpError(400, lookup.message);
  if (lookup.matchType === 'not_found') throw createHttpError(404, 'Transaction not found');
  if (lookup.matchType === 'multiple') {
    throw createHttpError(409, 'Multiple plate matches require user selection', { candidates: lookup.candidates });
  }
  if (!lookup.transaction) throw createHttpError(404, 'Transaction not found');
  return lookup.transaction;
}

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
  let qrDocumentPath = getChargeQrDocumentPath(charge);
  if (!qrDocumentPath) {
    charge = await omiseService.retrieveCharge(chargeId);
    qrDocumentPath = getChargeQrDocumentPath(charge);
    await paymentGatewayRepo.updateGatewayCharge(chargeId, { raw: charge });
  }
  if (!qrDocumentPath) throw createHttpError(502, 'Omise QR document not found');

  return omiseService.downloadDocument(qrDocumentPath);
}

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

  const paidAmount = existing.amount / 100;
  const transaction = await processPayment(existing.transactionId, {
    method: existing.method,
    channel: existing.channel,
    amount: paidAmount,
    processedBy: `omise_${chargeId}`,
  });
  if (!transaction) throw createHttpError(400, 'Payment processing failed');

  const updated = await paymentGatewayRepo.updateGatewayCharge(chargeId, {
    status,
    raw: charge,
    paidAt: omiseService.getChargePaidAt(charge),
    processedAt: new Date().toISOString(),
  });

  appEvents.emit('payment_updated', {
    type: 'payment_updated',
    provider: 'omise',
    chargeId,
    plateNo: transaction.plateNo,
    transactionId: transaction.id,
    paymentStatus: status,
    transactionStatus: transaction.status,
    remainingAmount: transaction.remainingAmount,
    exitTimeLimit: transaction.exitTimeLimit,
    gatewayCharge: updated,
    emittedAt: new Date().toISOString(),
  });

  return {
    action: 'processed',
    chargeId,
    status,
    transaction,
  };
}

module.exports = {
  createOmiseChargeForClient,
  getOmiseQrImage,
  processOmiseWebhookEvent,
  normalizeGatewayMethod,
  getChargeQrDocumentPath,
};
