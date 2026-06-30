const test = require('node:test');
const assert = require('node:assert/strict');

const configRepoPath = require.resolve('../src/data/repositories/config.repo');
const paymentSettingsRepoPath = require.resolve('../src/data/repositories/paymentSettings.repo');
const configRepo = require(configRepoPath);

// Function โหลด payment settings repo พร้อม mock config
function loadPaymentSettingsRepo(initialSettings) {
  let settings = structuredClone(initialSettings);
  let revision = 0;
  const originals = {
    getConfig: configRepo.getConfig,
    getConfigWithMeta: configRepo.getConfigWithMeta,
    setConfig: configRepo.setConfig,
  };

  configRepo.getConfig = async () => structuredClone(settings);
  configRepo.getConfigWithMeta = async () => ({
    ...structuredClone(settings),
    configUpdatedAt: `rev-${revision}`,
  });
  configRepo.setConfig = async (key, value) => {
    revision += 1;
    settings = structuredClone(value);
    return {
      ...structuredClone(settings),
      configUpdatedAt: `rev-${revision}`,
    };
  };

  delete require.cache[paymentSettingsRepoPath];
  const repo = require(paymentSettingsRepoPath);

  return {
    repo,
    getSettings: () => structuredClone(settings),
    restore() {
      configRepo.getConfig = originals.getConfig;
      configRepo.getConfigWithMeta = originals.getConfigWithMeta;
      configRepo.setConfig = originals.setConfig;
      delete require.cache[paymentSettingsRepoPath];
    },
  };
}

// Function สร้าง fixture payment settings สำหรับ test
function paymentSettingsFixture() {
  return {
    methods: [
      { id: 'cash', label: 'Cash', isActive: true },
      { id: 'promptpay', label: 'PromptPay', isActive: true },
      { id: 'card', label: 'Card', isActive: true },
    ],
    channels: [
      { id: 'ch_kiosk', name: 'Kiosk', allowedMethods: ['cash', 'promptpay', 'card'] },
      { id: 'ch_mobile', name: 'Mobile', allowedMethods: ['promptpay'] },
      { id: 'ch_gate', name: 'Gate', allowedMethods: ['card'] },
    ],
  };
}

test('deletes a payment method and removes it from every channel allowedMethods', async () => {
  const fixture = loadPaymentSettingsRepo(paymentSettingsFixture());

  try {
    const deleted = await fixture.repo.deleteMethod('promptpay');
    assert.equal(deleted.id, 'promptpay');
    assert.equal(deleted.configUpdatedAt, 'rev-1');

    const settings = fixture.getSettings();
    assert.deepEqual(settings.methods.map((method) => method.id), ['cash', 'card']);
    assert.deepEqual(settings.channels[0].allowedMethods, ['cash', 'card']);
    assert.deepEqual(settings.channels[1].allowedMethods, []);

    const methods = await fixture.repo.listMethodsWithMeta();
    assert.deepEqual(methods.data.map((method) => method.id), ['cash', 'card']);
  } finally {
    fixture.restore();
  }
});

test('deletes a payment channel and excludes it from channel list', async () => {
  const fixture = loadPaymentSettingsRepo(paymentSettingsFixture());

  try {
    const deleted = await fixture.repo.deleteChannel('ch_mobile');
    assert.equal(deleted.id, 'ch_mobile');
    assert.equal(deleted.configUpdatedAt, 'rev-1');

    const channels = await fixture.repo.listChannelsWithMeta();
    assert.deepEqual(channels.data.map((channel) => channel.id), ['ch_kiosk', 'ch_gate']);
  } finally {
    fixture.restore();
  }
});

test('returns null when deleting missing payment settings ids', async () => {
  const fixture = loadPaymentSettingsRepo(paymentSettingsFixture());

  try {
    assert.equal(await fixture.repo.deleteMethod('missing_method'), null);
    assert.equal(await fixture.repo.deleteChannel('missing_channel'), null);
  } finally {
    fixture.restore();
  }
});
