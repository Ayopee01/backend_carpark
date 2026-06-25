const crypto = require('crypto');
const omiseFactory = require('omise');

let omiseClient = null;

function getOmiseClient() {
  if (omiseClient) return omiseClient;
  const secretKey = process.env.OMISE_SECRET_KEY;
  if (!secretKey) {
    throw Object.assign(new Error('OMISE_SECRET_KEY is not configured'), { statusCode: 500 });
  }

  omiseClient = omiseFactory({ secretKey });
  return omiseClient;
}

function getCurrency() {
  return String(process.env.OMISE_CURRENCY || 'thb').toLowerCase();
}

function toMinorAmount(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw Object.assign(new Error('Invalid payment amount'), { statusCode: 400 });
  }
  return Math.round(value * 100);
}

function normalizeChargeStatus(charge) {
  if (!charge) return 'unknown';
  if (charge.paid === true || charge.status === 'successful') return 'successful';
  if (charge.status === 'failed' || charge.failure_code) return 'failed';
  if (charge.status === 'expired') return 'expired';
  if (charge.status === 'reversed') return 'reversed';
  return charge.status || 'pending';
}

function getChargePaidAt(charge) {
  return charge?.paid_at || charge?.paidAt || (charge?.paid ? new Date().toISOString() : null);
}

function toOmiseHttpError(err) {
  const message = err?.message || err?.toString?.() || 'Omise request failed';
  const statusCode = err?.object === 'error' || err?.code ? 400 : 502;
  const wrapped = new Error(message);
  wrapped.statusCode = statusCode;
  wrapped.provider = 'omise';
  if (err?.code) wrapped.code = err.code;
  if (err?.location) wrapped.location = err.location;
  if (err?.object) wrapped.providerObject = err.object;
  return wrapped;
}

async function createCharge({ amount, source, token, description, metadata, returnUri }) {
  if (!source && !token) {
    throw Object.assign(new Error('source or token is required'), { statusCode: 400 });
  }

  const payload = {
    amount: toMinorAmount(amount),
    currency: getCurrency(),
    description,
    metadata,
    ...(source ? { source } : {}),
    ...(token ? { card: token } : {}),
    ...(returnUri ? { return_uri: returnUri } : {}),
  };

  try {
    return await getOmiseClient().charges.create(payload);
  } catch (err) {
    throw toOmiseHttpError(err);
  }
}

async function retrieveCharge(chargeId) {
  if (!chargeId) {
    throw Object.assign(new Error('chargeId is required'), { statusCode: 400 });
  }
  try {
    return await getOmiseClient().charges.retrieve(chargeId);
  } catch (err) {
    throw toOmiseHttpError(err);
  }
}

function parseSignatureHeader(signatureHeader) {
  if (!signatureHeader) return [];
  return String(signatureHeader)
    .split(',')
    .map((part) => part.trim())
    .flatMap((part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex === -1) return [{ key: 'signature', value: part }];
      const key = part.slice(0, separatorIndex);
      const value = part.slice(separatorIndex + 1);
      return value ? [{ key, value }] : [];
    })
    .filter((item) => item.value);
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifyWebhookSignature(rawBody, headers) {
  const secret = process.env.OMISE_WEBHOOK_SECRET;
  if (!secret) return true;

  const signatureHeader = headers['omise-signature'];
  const timestamp = headers['omise-signature-timestamp'];
  if (!signatureHeader || !timestamp || !rawBody) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const key = Buffer.from(secret, 'base64');
  const expectedHex = crypto.createHmac('sha256', key).update(signedPayload).digest('hex');
  const expectedBase64 = crypto.createHmac('sha256', key).update(signedPayload).digest('base64');

  return parseSignatureHeader(signatureHeader).some(({ value }) => {
    return timingSafeEqual(value, expectedHex) || timingSafeEqual(value, expectedBase64);
  });
}

function extractChargeIdFromEvent(event) {
  const charge = event?.data?.object === 'charge' ? event.data : event?.data;
  return charge?.id || event?.charge || event?.chargeId || null;
}

module.exports = {
  createCharge,
  retrieveCharge,
  normalizeChargeStatus,
  getChargePaidAt,
  verifyWebhookSignature,
  extractChargeIdFromEvent,
  toMinorAmount,
  toOmiseHttpError,
};
