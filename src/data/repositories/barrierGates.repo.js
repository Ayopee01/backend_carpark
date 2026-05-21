// Import Require
const { getConfig, setConfig } = require('./config.repo');
const { activateRegisteredDevice, updateRegisteredDeviceHeartbeat } = require('./devices.repo');

const CONFIG_KEY = 'barrier_gates';
const OFFLINE_AFTER_MINUTES = 5;
const activationCodes = new Map();

function cleanupExpiredActivationCodes() {
  const now = new Date();
  activationCodes.forEach((data, code) => {
    if (data.expiresAt < now) activationCodes.delete(code);
  });
}

async function getBarrierGatesConfig() {
  const config = await getConfig(CONFIG_KEY, { barrierGates: [] });
  return {
    ...config,
    barrierGates: Array.isArray(config.barrierGates) ? config.barrierGates : [],
  };
}

async function saveBarrierGates(barrierGates) {
  return setConfig(CONFIG_KEY, { barrierGates });
}

function getBarrierGateRuntimeStatus(barrierGate) {
  if (!barrierGate) return null;
  if (barrierGate.status === 'maintenance') return 'maintenance';

  const lastSeen = new Date(barrierGate.lastSeen);
  if (Number.isNaN(lastSeen.getTime())) return 'offline';

  const diffMinutes = Math.floor((new Date() - lastSeen) / 60000);
  return diffMinutes > OFFLINE_AFTER_MINUTES ? 'offline' : 'online';
}

function withRuntimeStatus(barrierGate) {
  if (!barrierGate) return null;
  return {
    ...barrierGate,
    status: getBarrierGateRuntimeStatus(barrierGate),
  };
}

async function searchBarrierGate(deviceId) {
  if (!deviceId) return null;
  const { barrierGates } = await getBarrierGatesConfig();
  return withRuntimeStatus(barrierGates.find((barrierGate) => barrierGate.deviceId === deviceId) || null);
}

async function generateBarrierGateActivationCode(details = {}) {
  cleanupExpiredActivationCodes();
  const { barrierGates } = await getBarrierGatesConfig();
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const count = (barrierGates.length + activationCodes.size + 1).toString().padStart(3, '0');
  const generatedId = `BG-${dateStr}-${count}`;
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  activationCodes.set(code, {
    ...details,
    deviceId: generatedId,
    expiresAt,
  });

  return { code, deviceId: generatedId, deviceType: 'barrier_gate', expiresAt: expiresAt.toISOString() };
}

async function activateBarrierGate(code) {
  cleanupExpiredActivationCodes();
  const data = activationCodes.get(code);

  if (!data) return { success: false, message: 'Invalid or expired code' };
  if (data.expiresAt < new Date()) {
    activationCodes.delete(code);
    return { success: false, message: 'Code expired' };
  }

  const barrierGate = await updateBarrierGateStatus(data.deviceId, {
    name: data.name,
    location: data.location,
    version: data.version || '1.0.0',
  });
  await activateRegisteredDevice(data.deviceId, {
    name: barrierGate.name,
    location: barrierGate.location,
    ip: barrierGate.ip,
    version: barrierGate.version,
    activatedAt: barrierGate.firstSeen,
    lastSeen: barrierGate.lastSeen,
  });

  activationCodes.delete(code);
  return {
    success: true,
    message: 'Barrier Gate activation successful',
    deviceId: data.deviceId,
    deviceType: 'barrier_gate',
    barrierGate,
  };
}

async function editBarrierGate(deviceId, details = {}) {
  const { barrierGates } = await getBarrierGatesConfig();
  const index = barrierGates.findIndex((barrierGate) => barrierGate.deviceId === deviceId);
  if (index === -1) return { success: false, message: 'Barrier Gate not found' };

  barrierGates[index] = {
    ...barrierGates[index],
    ...details,
    deviceId,
  };
  await saveBarrierGates(barrierGates);

  return { success: true, barrierGate: withRuntimeStatus(barrierGates[index]) };
}

async function deleteBarrierGate(deviceId) {
  const { barrierGates } = await getBarrierGatesConfig();
  const index = barrierGates.findIndex((barrierGate) => barrierGate.deviceId === deviceId);
  if (index === -1) return { success: false, message: 'Barrier Gate not found' };

  const [deleted] = barrierGates.splice(index, 1);
  await saveBarrierGates(barrierGates);
  return { success: true, message: 'Barrier Gate deleted', barrierGate: deleted };
}

async function updateBarrierGateStatus(deviceId, details = {}) {
  const { barrierGates } = await getBarrierGatesConfig();
  const now = new Date().toISOString();
  const index = barrierGates.findIndex((barrierGate) => barrierGate.deviceId === deviceId);

  let barrierGate;
  if (index === -1) {
    barrierGate = {
      deviceId,
      deviceType: 'barrier_gate',
      name: details.name || `Barrier Gate ${deviceId}`,
      location: details.location || 'Unknown',
      ip: details.ip || '0.0.0.0',
      version: details.version || '1.0.0',
      status: 'online',
      firstSeen: now,
      lastSeen: now,
    };
    barrierGates.push(barrierGate);
  } else {
    const previous = barrierGates[index];
    barrierGate = {
      ...previous,
      deviceType: 'barrier_gate',
      lastSeen: now,
      status: details.status || (previous.status === 'maintenance' ? 'maintenance' : 'online'),
      ...(details.name ? { name: details.name } : {}),
      ...(details.location ? { location: details.location } : {}),
      ...(details.ip ? { ip: details.ip } : {}),
      ...(details.version ? { version: details.version } : {}),
    };
    barrierGates[index] = barrierGate;
  }

  await saveBarrierGates(barrierGates);
  await updateRegisteredDeviceHeartbeat(deviceId, {
    name: barrierGate.name,
    location: barrierGate.location,
    ip: barrierGate.ip,
    version: barrierGate.version,
  });
  return barrierGate;
}

async function listAllBarrierGates() {
  const { barrierGates } = await getBarrierGatesConfig();
  return barrierGates.map(withRuntimeStatus);
}

module.exports = {
  activateBarrierGate,
  deleteBarrierGate,
  editBarrierGate,
  generateBarrierGateActivationCode,
  getBarrierGateRuntimeStatus,
  listAllBarrierGates,
  searchBarrierGate,
  updateBarrierGateStatus,
};
