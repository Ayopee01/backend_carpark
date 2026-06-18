const test = require('node:test');
const assert = require('node:assert/strict');

const repositoryPath = require.resolve('../src/data/repositories/transactions.repo');
const servicePath = require.resolve('../src/services/transactions.service');
const repository = require(repositoryPath);
const { prisma } = require('../src/db/prisma');
const appEvents = require('../src/utils/events');

function loadServiceWithRepository(stubs) {
  const originals = {};
  for (const [name, stub] of Object.entries(stubs)) {
    originals[name] = repository[name];
    repository[name] = stub;
  }

  delete require.cache[servicePath];
  const service = require(servicePath);

  return {
    service,
    restore() {
      for (const [name, original] of Object.entries(originals)) {
        repository[name] = original;
      }
      delete require.cache[servicePath];
    },
  };
}

test('ignores a repeated camera event within the duplicate window', async () => {
  const transaction = {
    id: 't_existing',
    plateNo: '3งจ2021',
    status: 'pending',
    receipt: { camera: { direction: 'IN' } },
  };
  let activeLookupCalled = false;
  let createCalled = false;
  const fixture = loadServiceWithRepository({
    findDuplicateCameraTransaction: async () => transaction,
    findOpenTransactionByPlateNo: async () => {
      activeLookupCalled = true;
      return transaction;
    },
    createCameraTransaction: async () => {
      createCalled = true;
      return transaction;
    },
  });

  try {
    const result = await fixture.service.createTransactionFromCamera({
      plateNo: '3งจ2021',
      direction: 'IN',
    });

    assert.equal(result.statusCode, 200);
    assert.equal(result.body.action, 'IGNORE_DUPLICATE');
    assert.equal(activeLookupCalled, false);
    assert.equal(createCalled, false);
  } finally {
    fixture.restore();
  }
});

test('does not create another IN transaction while the plate has an open transaction', async () => {
  const transaction = {
    id: 't_existing',
    plateNo: '3งจ2021',
    status: 'pending',
    receipt: { camera: { direction: 'OUT' } },
  };
  let createCalled = false;
  const fixture = loadServiceWithRepository({
    findDuplicateCameraTransaction: async () => null,
    findOpenTransactionByPlateNo: async () => transaction,
    createCameraTransaction: async () => {
      createCalled = true;
      return transaction;
    },
  });

  try {
    const result = await fixture.service.createTransactionFromCamera({
      plateNo: '3งจ2021',
      direction: 'IN',
    });

    assert.equal(result.statusCode, 200);
    assert.equal(result.body.action, 'IGNORE_ACTIVE_TRANSACTION');
    assert.equal(result.body.data.transactionId, transaction.id);
    assert.equal(result.body.data.direction, 'IN');
    assert.equal(createCalled, false);
  } finally {
    fixture.restore();
  }
});

test('keeps a fully paid transaction waiting for exit until the exit window expires', () => {
  // Setup: fully paid at 10:00, with a future exit window.
  const transaction = repository.toTransactionApi({
    id: 't_paid',
    billNo: 'PK202605010001',
    plateNo: 'ABC1234',
    vehicleType: 'car',
    serviceType: 'parking',
    entryAt: new Date('2026-05-01T08:00:00.000Z'),
    exitAt: null,
    exitTimeLimit: new Date('2099-05-01T10:15:00.000Z'),
    amount: 40,
    totalPaid: 40,
    status: 'paid_waiting_exit',
    payments: [{ id: 'pay_1', paidAmount: 40, paidAt: '2026-05-01T10:00:00.000Z' }],
    createdAt: new Date('2026-05-01T08:00:00.000Z'),
    updatedAt: new Date('2026-05-01T10:00:00.000Z'),
  }, {
    pricingConfig: {
      pricingRules: [
        { feeType: 'base_hour', vehicleType: 'car', price: 20, status: 'active' },
      ],
    },
    systemSettings: { general: { frontendUrl: '' } },
  });

  // Call/assert: pricing is frozen at the paid time while the car is allowed to exit.
  assert.equal(transaction.status, 'paid_waiting_exit');
  assert.equal(transaction.calculatedAt, '2026-05-01T10:00:00.000Z');
  assert.equal(transaction.remainingAmount, 0);
  assert.equal(transaction.isOverstay, false);
});

test('reports completed when a paid transaction already has exitAt', () => {
  // Setup: stored status is stale, but exitAt means the car already left.
  const transaction = repository.toTransactionApi({
    id: 't_exited',
    billNo: 'PK202605010001',
    plateNo: 'ABC1234',
    vehicleType: 'car',
    serviceType: 'parking',
    entryAt: new Date('2026-05-01T08:00:00.000Z'),
    exitAt: new Date('2026-05-01T10:00:00.000Z'),
    exitTimeLimit: new Date('2026-05-01T10:15:00.000Z'),
    amount: 40,
    totalPaid: 40,
    status: 'partially_paid',
    payments: [{ id: 'pay_1', paidAmount: 40, paidAt: '2026-05-01T10:00:00.000Z' }],
    createdAt: new Date('2026-05-01T08:00:00.000Z'),
    updatedAt: new Date('2026-05-01T10:00:00.000Z'),
  }, {
    pricingConfig: {
      pricingRules: [
        { feeType: 'base_hour', vehicleType: 'car', price: 20, status: 'active' },
      ],
    },
    systemSettings: { general: { frontendUrl: '' } },
  });

  // Call/assert: API status follows the completed exit flow, not the stale stored status.
  assert.equal(transaction.status, 'completed');
  assert.equal(transaction.remainingAmount, 0);
  assert.equal(transaction.isOverstay, false);
});

test('blocks OUT when the paid exit window has expired', async () => {
  const transaction = {
    id: 't_expired',
    plateNo: 'ABC1234',
    status: 'paid_waiting_exit',
    exitTimeLimit: '2026-05-01T10:15:00.000Z',
    receipt: { camera: { direction: 'IN' } },
  };
  let createCalled = false;
  const fixture = loadServiceWithRepository({
    findDuplicateCameraTransaction: async () => null,
    findOpenTransactionByPlateNo: async () => transaction,
    createCameraTransaction: async () => {
      createCalled = true;
      return transaction;
    },
  });

  try {
    const result = await fixture.service.createTransactionFromCamera({
      plateNo: 'ABC1234',
      cameraId: 'CAM-OUT-01',
      gateId: 'GATE-A',
      direction: 'OUT',
      capturedAt: '2026-05-01T10:16:00.000Z',
    });

    assert.equal(result.statusCode, 200);
    assert.equal(result.body.success, false);
    assert.equal(result.body.action, 'PAYMENT_REQUIRED');
    assert.equal(result.body.data.status, 'paid_waiting_exit');
    assert.equal(createCalled, false);
  } finally {
    fixture.restore();
  }
});

test('allows OUT when the transaction is paid and still inside the exit window', async () => {
  const transaction = {
    id: 't_paid',
    plateNo: 'ABC1234',
    status: 'paid_waiting_exit',
    exitTimeLimit: '2026-05-01T10:15:00.000Z',
    receipt: { camera: { direction: 'IN' } },
  };
  let createCalled = false;
  const fixture = loadServiceWithRepository({
    findDuplicateCameraTransaction: async () => null,
    findOpenTransactionByPlateNo: async () => transaction,
    createCameraTransaction: async () => {
      createCalled = true;
      return { ...transaction, status: 'completed', receipt: { camera: { direction: 'OUT' } } };
    },
  });
  let lprEvent = null;
  const onLprDetected = (event) => {
    lprEvent = event;
  };
  appEvents.once('lpr_detected', onLprDetected);

  try {
    const result = await fixture.service.createTransactionFromCamera({
      plateNo: 'ABC1234',
      cameraId: 'CAM-OUT-01',
      gateId: 'GATE-A',
      direction: 'OUT',
      capturedAt: '2026-05-01T10:10:00.000Z',
    });

    assert.equal(result.statusCode, 201);
    assert.equal(result.body.success, true);
    assert.equal(result.body.data.status, 'completed');
    assert.equal(createCalled, true);
    assert.equal(lprEvent.type, 'lpr_detected');
    assert.equal(lprEvent.gateId, 'GATE-A');
    assert.equal(lprEvent.direction, 'OUT');
    assert.equal(lprEvent.action, 'OPEN_GATE');
    assert.equal(lprEvent.transactionId, transaction.id);
  } finally {
    appEvents.off('lpr_detected', onLprDetected);
    fixture.restore();
  }
});

test('marks an open transaction completed when an OUT camera event closes it', async () => {
  const originalFindFirst = prisma.transaction.findFirst;
  const originalUpdate = prisma.transaction.update;
  const existing = {
    id: 't_open',
    plateNo: 'ABC1234',
    status: 'paid_waiting_exit',
    receipt: { camera: { direction: 'IN' } },
  };
  let updateData = null;

  prisma.transaction.findFirst = async () => existing;
  prisma.transaction.update = async ({ data }) => {
    updateData = data;
    return { ...existing, ...data };
  };

  try {
    const transaction = await repository.createCameraTransaction({
      plateNo: 'ABC1234',
      vehicleType: 'car',
      cameraId: 'CAM-OUT-01',
      gateId: 'GATE-A',
      direction: 'OUT',
      capturedAt: '2026-05-01T10:10:00.000Z',
    });

    assert.equal(updateData.status, 'completed');
    assert.equal(transaction.status, 'completed');
  } finally {
    prisma.transaction.findFirst = originalFindFirst;
    prisma.transaction.update = originalUpdate;
  }
});
