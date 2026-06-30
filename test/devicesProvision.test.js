const test = require('node:test');
const assert = require('node:assert/strict');

const configRepoPath = require.resolve('../src/data/repositories/config.repo');
const devicesRepoPath = require.resolve('../src/data/repositories/devices.repo');
const configRepo = require(configRepoPath);
const { hashToken } = require('../src/utils/auth');

// Function โหลด devices repo พร้อม mock config repo
function loadDevicesRepo(initialConfig = { devices: [] }) {
  let config = structuredClone(initialConfig);
  const originals = {
    getConfig: configRepo.getConfig,
    getConfigWithMeta: configRepo.getConfigWithMeta,
    setConfig: configRepo.setConfig,
    updateConfig: configRepo.updateConfig,
  };

  configRepo.getConfig = async () => structuredClone(config);
  configRepo.getConfigWithMeta = async () => ({
    ...structuredClone(config),
    configUpdatedAt: 'test-updated-at',
  });
  configRepo.setConfig = async (key, value) => {
    config = structuredClone(value);
    return {
      ...structuredClone(config),
      configUpdatedAt: 'test-updated-at',
    };
  };
  configRepo.updateConfig = async (key, updater) => {
    const next = await updater(structuredClone(config), { updatedAt: new Date('2026-06-26T00:00:00Z') });
    if (next !== undefined) config = structuredClone(next);
    return {
      ...structuredClone(config),
      configUpdatedAt: 'test-updated-at',
    };
  };

  delete require.cache[devicesRepoPath];
  const repo = require(devicesRepoPath);

  return {
    repo,
    getConfig: () => structuredClone(config),
    restore() {
      configRepo.getConfig = originals.getConfig;
      configRepo.getConfigWithMeta = originals.getConfigWithMeta;
      configRepo.setConfig = originals.setConfig;
      configRepo.updateConfig = originals.updateConfig;
      delete require.cache[devicesRepoPath];
    },
  };
}

test('provisions a credentialed camera with a one-time device token', async () => {
  const fixture = loadDevicesRepo();

  try {
    const result = await fixture.repo.provisionCameraDevice({
      deviceName: 'Camera OUT A',
      deviceCode: 'CAM-OUT-A',
      location: 'Gate A',
      gateId: 'GATE-A',
      direction: 'OUT',
      cameraRole: 'lpr',
    });

    assert.equal(result.ok, true);
    assert.equal(result.device.deviceId, 'CAM-OUT-A');
    assert.equal(result.device.deviceType, 'camera');
    assert.equal(result.device.gateId, 'GATE-A');
    assert.equal(result.device.direction, 'OUT');
    assert.equal(result.device.cameraRole, 'lpr');
    assert.equal(typeof result.deviceToken, 'string');
    assert.ok(result.deviceToken.length > 20);
    assert.equal(result.device.deviceTokenHash, undefined);

    const verified = await fixture.repo.verifyRegisteredDeviceToken('CAM-OUT-A', result.deviceToken, ['camera']);
    assert.equal(verified.ok, true);
    assert.equal(verified.device.deviceTokenHash, undefined);

    const saved = fixture.getConfig().devices[0];
    assert.equal(typeof saved.deviceTokenHash, 'string');
  } finally {
    fixture.restore();
  }
});

test('rejects duplicate provisioned camera ids', async () => {
  const fixture = loadDevicesRepo({
    devices: [
      {
        id: 'CAM-OUT-A',
        deviceId: 'CAM-OUT-A',
        deviceCode: 'CAM-OUT-A',
        deviceName: 'Camera OUT A',
        deviceType: 'camera',
        status: 'active',
      },
    ],
  });

  try {
    const result = await fixture.repo.provisionCameraDevice({
      deviceName: 'Camera OUT A',
      deviceCode: 'CAM-OUT-A',
    });

    assert.deepEqual(result, { ok: false, reason: 'duplicate' });
  } finally {
    fixture.restore();
  }
});

test('provisions a credentialed printer with a one-time device token', async () => {
  const fixture = loadDevicesRepo();

  try {
    const result = await fixture.repo.provisionPrinterDevice({
      deviceName: 'Printer Gate A',
      deviceCode: 'PRN-GATE-A',
      location: 'Gate A',
      printerRole: 'receipt',
      ipAddress: '192.168.1.80',
    });

    assert.equal(result.ok, true);
    assert.equal(result.device.deviceId, 'PRN-GATE-A');
    assert.equal(result.device.deviceType, 'printer');
    assert.equal(result.device.printerRole, 'receipt');
    assert.equal(result.device.ipAddress, '192.168.1.80');
    assert.equal(typeof result.deviceToken, 'string');
    assert.ok(result.deviceToken.length > 20);
    assert.equal(result.device.deviceTokenHash, undefined);

    const verified = await fixture.repo.verifyRegisteredDeviceToken('PRN-GATE-A', result.deviceToken, ['printer']);
    assert.equal(verified.ok, true);
    assert.equal(verified.device.deviceTokenHash, undefined);

    const saved = fixture.getConfig().devices[0];
    assert.equal(typeof saved.deviceTokenHash, 'string');
  } finally {
    fixture.restore();
  }
});

test('rejects duplicate provisioned printer ids', async () => {
  const fixture = loadDevicesRepo({
    devices: [
      {
        id: 'PRN-GATE-A',
        deviceId: 'PRN-GATE-A',
        deviceCode: 'PRN-GATE-A',
        deviceName: 'Printer Gate A',
        deviceType: 'printer',
        status: 'active',
      },
    ],
  });

  try {
    const result = await fixture.repo.provisionPrinterDevice({
      deviceName: 'Printer Gate A',
      deviceCode: 'PRN-GATE-A',
    });

    assert.deepEqual(result, { ok: false, reason: 'duplicate' });
  } finally {
    fixture.restore();
  }
});

test('reissues activation code for an existing barrier gate without losing mappings', async () => {
  const fixture = loadDevicesRepo({
    devices: [
      {
        id: 'BG-OUT-A',
        deviceId: 'BG-OUT-A',
        deviceCode: 'BG-OUT-A',
        deviceName: 'Barrier Gate OUT A',
        deviceType: 'barrier_gate',
        status: 'active',
        isOnline: true,
        gateId: 'GATE-A',
        direction: 'OUT',
        cameraIds: ['CAM-OUT-A'],
        printerIds: ['PRN-GATE-A'],
        deviceTokenHash: hashToken('old-token'),
      },
    ],
  });

  try {
    const result = await fixture.repo.reissueActivationCode('BG-OUT-A');

    assert.equal(result.ok, true);
    assert.equal(result.device.deviceId, 'BG-OUT-A');
    assert.equal(result.device.isOnline, false);
    assert.equal(result.device.deviceTokenHash, undefined);
    assert.equal(result.device.gateId, 'GATE-A');
    assert.deepEqual(result.device.cameraIds, ['CAM-OUT-A']);
    assert.deepEqual(result.device.printerIds, ['PRN-GATE-A']);
    assert.match(result.activationCode, /^\d{6}$/);

    const savedAfterReissue = fixture.getConfig().devices[0];
    assert.equal(savedAfterReissue.deviceTokenHash, null);
    assert.equal(savedAfterReissue.activationCode, result.activationCode);

    const pending = await fixture.repo.getPendingActivationDeviceByCode(result.activationCode, 'barrier_gate');
    assert.equal(pending.deviceId, 'BG-OUT-A');

    const activated = await fixture.repo.activateRegisteredDevice('BG-OUT-A');
    assert.equal(activated.device.deviceId, 'BG-OUT-A');
    assert.equal(activated.device.status, 'active');
    assert.equal(activated.device.isOnline, true);
    assert.deepEqual(activated.device.cameraIds, ['CAM-OUT-A']);
    assert.deepEqual(activated.device.printerIds, ['PRN-GATE-A']);
    assert.equal(typeof activated.deviceToken, 'string');
    assert.ok(activated.deviceToken.length > 20);
  } finally {
    fixture.restore();
  }
});

test('does not reissue activation code for camera or printer devices', async () => {
  const fixture = loadDevicesRepo({
    devices: [
      {
        id: 'CAM-OUT-A',
        deviceId: 'CAM-OUT-A',
        deviceCode: 'CAM-OUT-A',
        deviceName: 'Camera OUT A',
        deviceType: 'camera',
        status: 'active',
        isOnline: false,
      },
    ],
  });

  try {
    const result = await fixture.repo.reissueActivationCode('CAM-OUT-A');

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'invalid_type');
  } finally {
    fixture.restore();
  }
});

test('credentialed printer heartbeat marks the device online', async () => {
  const fixture = loadDevicesRepo();

  try {
    const provisioned = await fixture.repo.provisionPrinterDevice({
      deviceName: 'Printer Gate A',
      deviceCode: 'PRN-GATE-A',
    });

    const verified = await fixture.repo.verifyRegisteredDeviceToken('PRN-GATE-A', provisioned.deviceToken, ['printer']);
    assert.equal(verified.ok, true);

    const heartbeat = await fixture.repo.updateRegisteredDeviceHeartbeat('PRN-GATE-A', {
      name: 'Printer Gate A',
      location: 'Gate A',
      ip: '192.168.1.80',
    });

    assert.equal(heartbeat.device.deviceId, 'PRN-GATE-A');
    assert.equal(heartbeat.device.isOnline, true);
    assert.equal(heartbeat.device.status, 'active');
    assert.equal(heartbeat.device.location, 'Gate A');
    assert.equal(heartbeat.device.ipAddress, '192.168.1.80');
  } finally {
    fixture.restore();
  }
});
