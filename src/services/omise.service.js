const crypto = require('crypto');
const https = require('https');
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

function normalizeDocumentPath(documentPath) {
  const value = String(documentPath || '').trim();
  if (!value) {
    throw Object.assign(new Error('documentPath is required'), { statusCode: 400 });
  }

  let path = value;
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (url.hostname !== 'api.omise.co') {
      throw Object.assign(new Error('Invalid Omise document URL'), { statusCode: 400 });
    }
    path = `${url.pathname}${url.search || ''}`;
  }

  if (!/^\/(charges|sources)\/[^/]+\/documents\/[^/?#]+(\/download)?(\?.*)?$/.test(path)) {
    throw Object.assign(new Error('Invalid Omise document path'), { statusCode: 400 });
  }

  return path;
}

function requestBinary(url, { authenticated = false, redirectCount = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { Accept: 'image/*' };
    if (authenticated) {
      const secretKey = process.env.OMISE_SECRET_KEY;
      if (!secretKey) {
        return reject(Object.assign(new Error('OMISE_SECRET_KEY is not configured'), { statusCode: 500 }));
      }
      headers.Authorization = `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;
    }

    const req = https.request(url, { method: 'GET', headers }, (res) => {
      const location = res.headers.location;
      if (location && res.statusCode >= 300 && res.statusCode < 400) {
        res.resume();
        if (redirectCount >= 3) {
          return reject(Object.assign(new Error('Too many Omise document redirects'), { statusCode: 502 }));
        }
        const nextUrl = new URL(location, url);
        return resolve(requestBinary(nextUrl, {
          authenticated: nextUrl.hostname === 'api.omise.co',
          redirectCount: redirectCount + 1,
        }));
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        if (res.statusCode < 200 || res.statusCode >= 300) {
          let message = `Unable to load Omise QR image (${res.statusCode})`;
          try {
            const parsed = JSON.parse(body.toString('utf8'));
            message = parsed.message || message;
          } catch (err) {
            if (body.length) message = body.toString('utf8');
          }
          return reject(Object.assign(new Error(message), { statusCode: 502, provider: 'omise' }));
        }

        const contentType = res.headers['content-type'] || 'image/png';
        if (!contentType.toLowerCase().startsWith('image/')) {
          let downloadUri = null;
          try {
            const parsed = JSON.parse(body.toString('utf8'));
            downloadUri = parsed.download_uri || parsed.downloadUri || null;
          } catch (err) {
            // Keep the response generic below when Omise did not return JSON.
          }

          if (downloadUri) {
            if (redirectCount >= 3) {
              return reject(Object.assign(new Error('Too many Omise document redirects'), {
                statusCode: 502,
                provider: 'omise',
              }));
            }
            const nextUrl = new URL(downloadUri, url);
            return resolve(requestBinary(nextUrl, {
              authenticated: nextUrl.hostname === 'api.omise.co',
              redirectCount: redirectCount + 1,
            }));
          }

          return reject(Object.assign(new Error('Omise document response is not an image'), {
            statusCode: 502,
            provider: 'omise',
          }));
        }

        return resolve({ contentType, body });
      });
    });

    req.on('error', (err) => {
      reject(Object.assign(new Error(err.message || 'Unable to load Omise QR image'), {
        statusCode: 502,
        provider: 'omise',
      }));
    });
    req.end();
  });
}

async function downloadDocument(documentPath) {
  const path = normalizeDocumentPath(documentPath);
  return requestBinary(new URL(path, 'https://api.omise.co'), { authenticated: true });
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
  normalizeDocumentPath,
  downloadDocument,
};
