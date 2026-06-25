const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const omiseService = require('../src/services/omise.service');
const { normalizeGatewayMethod } = require('../src/services/paymentGateway.service');

test('converts baht amounts to Omise minor currency units', () => {
  assert.equal(omiseService.toMinorAmount(40), 4000);
  assert.equal(omiseService.toMinorAmount(40.25), 4025);
});

test('normalizes Omise source types to configured payment methods', () => {
  assert.equal(normalizeGatewayMethod(null, 'promptpay'), 'promptpay');
  assert.equal(normalizeGatewayMethod(null, null, { token: 'tokn_test_123' }), 'card');
  assert.equal(normalizeGatewayMethod('wallet'), 'wallet');
  assert.throws(
    () => normalizeGatewayMethod(null, null, { source: 'src_test_123' }),
    /method or sourceType is required/
  );
  assert.throws(
    () => normalizeGatewayMethod(),
    /method or sourceType is required/
  );
});

test('verifies Omise webhook signatures with configured secret', () => {
  const originalSecret = process.env.OMISE_WEBHOOK_SECRET;
  const secret = crypto.randomBytes(32);
  const timestamp = '2026-06-24T10:00:00Z';
  const rawBody = '{"key":"charge.complete"}';
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('base64');

  process.env.OMISE_WEBHOOK_SECRET = secret.toString('base64');

  try {
    assert.equal(omiseService.verifyWebhookSignature(rawBody, {
      'omise-signature': `v1=${signature}`,
      'omise-signature-timestamp': timestamp,
    }), true);
    assert.equal(omiseService.verifyWebhookSignature(rawBody, {
      'omise-signature': 'v1=invalid',
      'omise-signature-timestamp': timestamp,
    }), false);
  } finally {
    if (originalSecret === undefined) {
      delete process.env.OMISE_WEBHOOK_SECRET;
    } else {
      process.env.OMISE_WEBHOOK_SECRET = originalSecret;
    }
  }
});

test('wraps Omise API errors with an HTTP status and provider details', () => {
  const error = omiseService.toOmiseHttpError({
    object: 'error',
    code: 'invalid_source',
    message: 'source is invalid',
    location: '/charges',
  });

  assert.equal(error.statusCode, 400);
  assert.equal(error.provider, 'omise');
  assert.equal(error.code, 'invalid_source');
  assert.equal(error.message, 'source is invalid');
});
