const {
  activateRegisteredDevice,
  getPendingActivationDeviceByCode,
} = require('../data/repositories/devices.repo');

async function activateCamera(code) {
  const normalizedCode = code === undefined || code === null ? '' : String(code).trim();
  if (!normalizedCode) return { success: false, message: 'Invalid or expired code' };

  const pending = await getPendingActivationDeviceByCode(normalizedCode, 'camera');
  if (!pending) return { success: false, message: 'Invalid or expired code' };

  const registered = await activateRegisteredDevice(pending.id, {
    name: pending.deviceName,
    location: pending.location,
    gateId: pending.gateId,
    direction: pending.direction,
    cameraRole: pending.cameraRole || 'lpr',
  });
  if (!registered?.deviceToken) {
    return { success: false, message: 'Registered device is missing or expired' };
  }

  return {
    success: true,
    message: 'Camera activation successful',
    deviceToken: registered.deviceToken,
    deviceId: registered.device.deviceId,
    deviceType: registered.device.deviceType,
    deviceName: registered.device.deviceName,
    location: registered.device.location,
    gateId: registered.device.gateId || null,
    direction: registered.device.direction || null,
    cameraRole: registered.device.cameraRole || 'lpr',
    status: registered.device.status,
  };
}

module.exports = {
  activateCamera,
};
