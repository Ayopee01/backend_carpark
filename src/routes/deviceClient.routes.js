const express = require('express');
const { getConfig } = require('../data/repositories/config.repo');
const { updateRegisteredDeviceHeartbeat } = require('../data/repositories/devices.repo');
const defaults = require('../data/defaults');
const { optionalDeviceAuth } = require('../middleware/deviceAuth');

const router = express.Router();

// Shared config endpoint for mobile users, kiosks, and barrier gates.
router.get('/config', optionalDeviceAuth(['kiosk', 'barrier_gate']), async (req, res, next) => {
  try {
    const { deviceId } = req.query;
    let status = 'unregistered';
    let deviceType = 'public';

    if (deviceId) {
      if (!req.device) return res.status(401).json({ message: 'Invalid or unregistered deviceId' });
      deviceType = req.device.deviceType;
      if (req.device.status !== 'maintenance') {
        const updated = await updateRegisteredDeviceHeartbeat(deviceId, { ip: req.ip });
        status = updated?.device?.status || req.device.status;
      } else {
        status = req.device.status;
      }
    }

    const currentTheme = await getConfig('theme', defaults.theme);
    const systemSettings = await getConfig('system_settings', defaults.systemSettings);

    return res.json({
      theme: {
        themeColor: currentTheme.themeColor ?? null,
        logoUrl: currentTheme.logoUrl ?? null,
        themeMode: currentTheme.themeMode ?? '',
        customThemeColor: currentTheme.customThemeColor ?? null,
        updatedAt: currentTheme.updatedAt || null,
      },
      systemName: systemSettings.general?.systemName,
      status,
      deviceType,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
