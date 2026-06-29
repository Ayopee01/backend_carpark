const { getRegisteredDevice, updateRegisteredDeviceHeartbeat } = require('../data/repositories/devices.repo');

// Function สร้าง HTTP error พร้อม statusCode
function createHttpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

// Function resolve client source จาก deviceId หรือ mobile
async function resolveClientSource(deviceId, req) {
  if (!deviceId) return { clientType: 'mobile', device: null };

  const device = await getRegisteredDevice(deviceId);
  if (!device || !['kiosk', 'barrier_gate'].includes(device.deviceType)) {
    throw createHttpError(401, 'Invalid or unregistered deviceId');
  }
  if (device.status === 'maintenance') {
    throw createHttpError(403, 'Device is currently under maintenance');
  }

  const updated = await updateRegisteredDeviceHeartbeat(deviceId, { ip: req.ip });
  const current = updated?.device || device;

  return {
    clientType: current.deviceType === 'barrier_gate' ? 'barrier_gate' : 'kiosk',
    device: {
      deviceId: current.deviceId,
      deviceType: current.deviceType,
      deviceName: current.deviceName,
      deviceLocation: current.location,
      status: current.status,
    },
  };
}

// Function map client source เป็น payment channel
function getPaymentChannelForClientSource(source) {
  if (source.clientType === 'barrier_gate') return 'gate';
  if (source.clientType === 'kiosk') return 'kiosk';
  return 'mobile';
}

// Export Functions
module.exports = {
  getPaymentChannelForClientSource,
  resolveClientSource,
};
