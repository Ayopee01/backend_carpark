// Import Require
const { verifyRegisteredDeviceToken } = require('../data/repositories/devices.repo');

// Function read deviceId from header, body, query, or params and reject mismatched ids
function getRequestDeviceIdentity(req) {
  const candidates = [
    req.get('x-device-id'),
    req.body?.deviceId,
    req.query?.deviceId,
    req.params?.deviceId,
  ].filter(Boolean);
  const uniqueIds = [...new Set(candidates)];
  return {
    deviceId: uniqueIds[0] || null,
    hasConflict: uniqueIds.length > 1,
  };
}

// Function read device token from the supported kiosk/barrier gate headers
function getRequestDeviceToken(req) {
  const authHeader = req.get('authorization') || '';
  if (authHeader.startsWith('Device ')) return authHeader.replace('Device ', '').trim();
  return req.get('x-device-token') || null;
}

// Function middleware for APIs that must be called by an activated kiosk/barrier gate
function requireDeviceAuth(allowedTypes = []) {
  return async (req, res, next) => {
    try {
      const identity = getRequestDeviceIdentity(req);
      if (identity.hasConflict) return res.status(400).json({ message: 'Device identity mismatch' });
      if (!identity.deviceId) return res.status(400).json({ message: 'deviceId is required' });

      const result = await verifyRegisteredDeviceToken(
        identity.deviceId,
        getRequestDeviceToken(req),
        allowedTypes
      );

      if (!result.ok) {
        const status = result.reason === 'not_found' ? 401 : 403;
        return res.status(status).json({ message: 'Invalid device credentials', reason: result.reason });
      }

      req.device = result.device;
      req.deviceId = result.device.deviceId || identity.deviceId;
      if (req.body && !req.body.deviceId) req.body.deviceId = req.deviceId;
      if (req.query && !req.query.deviceId) req.query.deviceId = req.deviceId;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

// Function middleware for APIs that allow public access when no deviceId is supplied
function optionalDeviceAuth(allowedTypes = []) {
  return async (req, res, next) => {
    const identity = getRequestDeviceIdentity(req);
    if (!identity.deviceId) return next();
    return requireDeviceAuth(allowedTypes)(req, res, next);
  };
}

// Export Functions
module.exports = {
  optionalDeviceAuth,
  requireDeviceAuth,
};
