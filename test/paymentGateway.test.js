const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const omiseService = require('../src/services/omise.service');
const transactionsRepo = require('../src/data/repositories/transactions.repo');
const paymentGatewayRepo = require('../src/data/repositories/paymentGateway.repo');
const {
  createOmiseChargeForAdmin,
  getChargeQrDocumentPath,
  isPaymentSimulationEnabled,
  normalizeGatewayMethod,
  verifyPaymentSimulationToken,
} = require('../src/services/paymentGateway.service');

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

test('validates Omise QR document paths before proxying images', () => {
  assert.equal(
    omiseService.normalizeDocumentPath('/charges/chrg_test_123/documents/docu_test_123'),
    '/charges/chrg_test_123/documents/docu_test_123'
  );
  assert.equal(
    omiseService.normalizeDocumentPath('https://api.omise.co/sources/src_test_123/documents/docu_test_123'),
    '/sources/src_test_123/documents/docu_test_123'
  );
  assert.equal(
    omiseService.normalizeDocumentPath('/charges/chrg_test_123/documents/docu_test_123/download'),
    '/charges/chrg_test_123/documents/docu_test_123/download'
  );
  assert.equal(
    omiseService.normalizeDocumentPath('/charges/chrg_test_123/documents/docu_test_123/downloads/63A9093A19F64CA2'),
    '/charges/chrg_test_123/documents/docu_test_123/downloads/63A9093A19F64CA2'
  );
  assert.throws(
    () => omiseService.normalizeDocumentPath('https://example.com/sources/src_test_123/documents/docu_test_123'),
    /Invalid Omise document URL/
  );
  assert.throws(
    () => omiseService.normalizeDocumentPath('/customers/cust_test_123'),
    /Invalid Omise document path/
  );
});

test('extracts the PromptPay QR document path from an Omise charge', () => {
  const charge = {
    source: {
      scannable_code: {
        image: {
          location: '/charges/chrg_test_123/documents/docu_test_123',
        },
      },
    },
  };

  assert.equal(
    getChargeQrDocumentPath(charge),
    '/charges/chrg_test_123/documents/docu_test_123/download'
  );
});

test('prefers Omise QR download_uri when it is available', () => {
  const charge = {
    source: {
      scannable_code: {
        image: {
          location: '/charges/chrg_test_123/documents/docu_test_123',
          download_uri: '/charges/chrg_test_123/documents/docu_test_123/download',
        },
      },
    },
  };

  assert.equal(
    getChargeQrDocumentPath(charge),
    '/charges/chrg_test_123/documents/docu_test_123/download'
  );
});

test('guards payment simulation with env flag and optional token', () => {
  const originalEnabled = process.env.ENABLE_PAYMENT_SIMULATION;
  const originalToken = process.env.PAYMENT_SIMULATION_TOKEN;

  try {
    delete process.env.ENABLE_PAYMENT_SIMULATION;
    delete process.env.PAYMENT_SIMULATION_TOKEN;
    assert.equal(isPaymentSimulationEnabled(), false);
    assert.equal(verifyPaymentSimulationToken('anything'), true);

    process.env.ENABLE_PAYMENT_SIMULATION = 'true';
    process.env.PAYMENT_SIMULATION_TOKEN = 'uat-secret';
    assert.equal(isPaymentSimulationEnabled(), true);
    assert.equal(verifyPaymentSimulationToken('wrong'), false);
    assert.equal(verifyPaymentSimulationToken('uat-secret'), true);
  } finally {
    if (originalEnabled === undefined) {
      delete process.env.ENABLE_PAYMENT_SIMULATION;
    } else {
      process.env.ENABLE_PAYMENT_SIMULATION = originalEnabled;
    }

    if (originalToken === undefined) {
      delete process.env.PAYMENT_SIMULATION_TOKEN;
    } else {
      process.env.PAYMENT_SIMULATION_TOKEN = originalToken;
    }
  }
});

test('creates Admin Omise PromptPay charges as cashier channel', async () => {
  const originalGetTransactionApiById = transactionsRepo.getTransactionApiById;
  const originalCreateCharge = omiseService.createCharge;
  const originalCreateGatewayCharge = paymentGatewayRepo.createGatewayCharge;

  const createdGatewayCharges = [];
  transactionsRepo.getTransactionApiById = async () => ({
    id: 't_123',
    plateNo: '3ABC1234',
    status: 'pending',
    remainingAmount: 40,
    exitAt: null,
    exitTimeLimit: null,
  });
  omiseService.createCharge = async (payload) => ({
    id: 'chrg_test_admin',
    status: 'pending',
    amount: omiseService.toMinorAmount(payload.amount),
    currency: 'thb',
    source: { scannable_code: { image: { location: '/charges/chrg_test_admin/documents/docu_test_admin' } } },
    metadata: payload.metadata,
  });
  paymentGatewayRepo.createGatewayCharge = async (data) => {
    createdGatewayCharges.push(data);
    return {
      id: 'pgc_123',
      provider: 'omise',
      ...data,
    };
  };

  try {
    const result = await createOmiseChargeForAdmin({
      transactionId: 't_123',
      source: 'src_test_123',
      sourceType: 'promptpay',
      method: 'promptpay',
      channel: 'cashier',
      amount: 4000,
      processedBy: 'u_admin',
    });

    assert.equal(result.channel, 'cashier');
    assert.equal(result.amount, 4000);
    assert.equal(createdGatewayCharges.length, 1);
    assert.equal(createdGatewayCharges[0].channel, 'cashier');
    assert.equal(createdGatewayCharges[0].method, 'promptpay');
    assert.equal(createdGatewayCharges[0].raw.metadata.sourceContext, 'admin');
    assert.equal(createdGatewayCharges[0].raw.metadata.processedBy, 'u_admin');
  } finally {
    transactionsRepo.getTransactionApiById = originalGetTransactionApiById;
    omiseService.createCharge = originalCreateCharge;
    paymentGatewayRepo.createGatewayCharge = originalCreateGatewayCharge;
  }
});

test('rejects Admin Omise charges that are not cashier channel', async () => {
  await assert.rejects(
    createOmiseChargeForAdmin({
      transactionId: 't_123',
      source: 'src_test_123',
      sourceType: 'promptpay',
      method: 'promptpay',
      channel: 'mobile',
    }),
    /Admin Omise payment channel must be cashier/
  );
});
