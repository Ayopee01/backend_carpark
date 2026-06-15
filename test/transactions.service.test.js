const test = require('node:test');
const assert = require('node:assert/strict');

const repositoryPath = require.resolve('../src/data/repositories/transactions.repo');
const servicePath = require.resolve('../src/services/transactions.service');
const repository = require(repositoryPath);

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
