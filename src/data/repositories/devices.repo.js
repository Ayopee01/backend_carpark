// Import Require
const defaults = require('../defaults');
const { getConfig, setConfig } = require('./config.repo');

// Constant key สำหรับอ้างอิง devices config ใน table app_config
const CONFIG_KEY = 'devices';

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
  return withSummary(await getConfig(CONFIG_KEY, defaults.devices));
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
  createDevice,
  deleteDevice,
  getDevicesConfig,
  updateDevice,
  withSummary
};
