// Import Require
const defaults = require('../defaults');
const { getConfig, setConfig } = require('./config.repo');

// Constant key สำหรับอ้างอิง devices config ใน table app_config
const CONFIG_KEY = 'devices';
const OFFLINE_AFTER_MINUTES = 5;
const ACTIVATION_DEVICE_TYPES = new Set(['kiosk', 'barrier_gate']);

function isActivationDevice(device) {
  return ACTIVATION_DEVICE_TYPES.has(device?.deviceType);
}

function isExpired(value, now = new Date()) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date < now;
}

function isOfflineByLastSeen(lastSeen, now = new Date()) {
  if (!lastSeen) return true;
  const date = new Date(lastSeen);
  if (Number.isNaN(date.getTime())) return true;
  return now - date > OFFLINE_AFTER_MINUTES * 60000;
}

// Function เพิ่ม summary online/offline ให้ config devices
function withSummary(config) {
  const devices = Array.isArray(config.devices) ? config.devices : [];
  const totalDevices = devices.length;
  const online = devices.filter((device) => device.isOnline).length;

  return {
    ...config,
    summary: {
      totalDevices,
      online,
      offline: totalDevices - online
    },
    devices
  };
}

// Function query devices config จาก database
async function getDevicesConfig() {
  const config = await getConfig(CONFIG_KEY, defaults.devices);
  const now = new Date();
  let changed = false;

  const devices = (Array.isArray(config.devices) ? config.devices : [])
    .filter((device) => {
      const shouldRemove = device.status === 'pending_activation' && isExpired(device.activationExpiresAt, now);
      if (shouldRemove) changed = true;
      return !shouldRemove;
    })
    .map((device) => {
      if (
        isActivationDevice(device) &&
        device.status === 'active' &&
        device.isOnline &&
        isOfflineByLastSeen(device.lastSeen, now)
      ) {
        changed = true;
        return {
          ...device,
          isOnline: false,
          status: 'offline',
        };
      }
      return device;
    });

  const nextConfig = withSummary({ ...config, devices });
  if (changed) {
    const saved = await setConfig(CONFIG_KEY, nextConfig);
    return withSummary(saved);
  }
  return nextConfig;
}

// Function create device ใหม่
async function createDevice(payload = {}) {
  const config = await getDevicesConfig();
  const {
    deviceCode,
    deviceName,
    deviceType,
    connectionType,
    ipAddress,
    status,
    isOnline,
    note
  } = payload;

  if (config.devices.some((device) => device.deviceCode === deviceCode)) {
    return { ok: false, reason: 'duplicate' };
  }

  const device = {
    id: `d_${Date.now()}`,
    deviceCode,
    deviceName,
    deviceType,
    connectionType: connectionType || 'lan',
    ipAddress: ipAddress || null,
    status: status || 'active',
    isOnline: Boolean(isOnline),
    note: note || ''
  };
  const configWithDevice = withSummary({ ...config, devices: [...config.devices, device] });
  const saved = await setConfig(CONFIG_KEY, configWithDevice);

  return { ok: true, device, config: withSummary(saved) };
}

async function createPendingActivationDevice(payload = {}) {
  const config = await getDevicesConfig();
  const {
    generatedDeviceId,
    activationCode,
    activationExpiresAt,
    deviceCode,
    deviceName,
    name,
    deviceType,
    connectionType,
    location,
    version,
    note
  } = payload;

  if (!generatedDeviceId) throw new Error('generatedDeviceId is required');
  if (!deviceType) throw new Error('deviceType is required');

  const pendingCode = deviceCode || generatedDeviceId;
  if (config.devices.some((device) => device.deviceCode === pendingCode || device.id === generatedDeviceId)) {
    return { ok: false, reason: 'duplicate' };
  }

  const device = {
    id: generatedDeviceId,
    deviceId: null,
    activationCode,
    activationExpiresAt,
    deviceCode: pendingCode,
    deviceName: deviceName || name || generatedDeviceId,
    deviceType,
    connectionType: connectionType || 'lan',
    ipAddress: null,
    location: location || null,
    version: version || '1.0.0',
    status: 'pending_activation',
    isOnline: false,
    note: note || 'Waiting for activation'
  };
  const configWithDevice = withSummary({ ...config, devices: [...config.devices, device] });
  const saved = await setConfig(CONFIG_KEY, configWithDevice);

  return { ok: true, device, config: withSummary(saved) };
}

async function activateRegisteredDevice(generatedDeviceId, details = {}) {
  const config = await getDevicesConfig();
  const devices = [...config.devices];
  const index = devices.findIndex((device) => device.id === generatedDeviceId || device.deviceId === generatedDeviceId);
  if (index === -1) return null;

  const current = devices[index];
  devices[index] = {
    ...current,
    deviceId: generatedDeviceId,
    activationCode: null,
    activationExpiresAt: null,
    deviceName: details.name || current.deviceName,
    location: details.location || current.location || null,
    ipAddress: details.ip || details.ipAddress || current.ipAddress || null,
    version: details.version || current.version || '1.0.0',
    status: 'active',
    isOnline: true,
    activatedAt: details.activatedAt || new Date().toISOString(),
    lastSeen: details.lastSeen || new Date().toISOString(),
  };

  const saved = await setConfig(CONFIG_KEY, withSummary({ ...config, devices }));
  return { device: devices[index], config: withSummary(saved) };
}

async function updateRegisteredDeviceHeartbeat(generatedDeviceId, details = {}) {
  const config = await getDevicesConfig();
  const devices = [...config.devices];
  const index = devices.findIndex((device) => device.deviceId === generatedDeviceId || device.id === generatedDeviceId);
  if (index === -1) return null;

  const current = devices[index];
  devices[index] = {
    ...current,
    ipAddress: details.ip || details.ipAddress || current.ipAddress || null,
    version: details.version || current.version,
    location: details.location || current.location,
    deviceName: details.name || current.deviceName,
    status: current.status === 'maintenance' ? 'maintenance' : 'active',
    isOnline: current.status === 'maintenance' ? current.isOnline : true,
    lastSeen: new Date().toISOString(),
  };

  const saved = await setConfig(CONFIG_KEY, withSummary({ ...config, devices }));
  return { device: devices[index], config: withSummary(saved) };
}

// Function update device ด้วย id
async function updateDevice(id, body = {}) {
  const config = await getDevicesConfig();
  const devices = [...config.devices];
  const index = devices.findIndex((item) => item.id === id);
  if (index === -1) return null;

  const allowedFields = [
    'deviceCode',
    'deviceName',
    'deviceType',
    'connectionType',
    'ipAddress',
    'status',
    'isOnline',
    'note'
  ];
  const patch = {};
  allowedFields.forEach((field) => {
    if (field in body) patch[field] = body[field];
  });

  devices[index] = { ...devices[index], ...patch };
  const saved = await setConfig(CONFIG_KEY, withSummary({ ...config, devices }));

  return { device: devices[index], config: withSummary(saved) };
}

// Function delete device ด้วย id
async function deleteDevice(id) {
  const config = await getDevicesConfig();
  const devices = [...config.devices];
  const index = devices.findIndex((item) => item.id === id);
  if (index === -1) return null;

  const [device] = devices.splice(index, 1);
  const saved = await setConfig(CONFIG_KEY, withSummary({ ...config, devices }));

  return { device, config: withSummary(saved) };
}

// Export Functions
module.exports = {
  activateRegisteredDevice,
  createDevice,
  createPendingActivationDevice,
  deleteDevice,
  getDevicesConfig,
  updateDevice,
  updateRegisteredDeviceHeartbeat,
  withSummary
};
