const express = require('express');
const { getConfig } = require('../data/repositories/config.repo');
const { searchKiosk, updateKioskStatus } = require('../data/repositories/kiosks.repo');
const { searchBarrierGate, updateBarrierGateStatus } = require('../data/repositories/barrierGates.repo');
const defaults = require('../data/defaults');
const { optionalDeviceAuth } = require('../middleware/deviceAuth');

const router = express.Router();

// Shared config endpoint for mobile users, kiosks, and barrier gates.
router.get('/config', optionalDeviceAuth(['kiosk', 'barrier_gate']), async (req, res, next) => {
  try {
    const { deviceId } = req.query;
    let status = 'unregistered';
    let deviceType = 'public';

    if (deviceId && req.device?.deviceType === 'kiosk') {
      const kiosk = await searchKiosk(deviceId);
      if (!kiosk) return res.status(401).json({ message: 'Invalid or unregistered deviceId' });
      deviceType = 'kiosk';
      if (kiosk.status !== 'maintenance') {
        const updated = await updateKioskStatus(deviceId, { ip: req.ip });
        status = updated.status;
      } else {
        status = kiosk.status;
      }
    }

    if (deviceId && req.device?.deviceType === 'barrier_gate') {
      const barrierGate = await searchBarrierGate(deviceId);
      if (!barrierGate) return res.status(401).json({ message: 'Invalid or unregistered deviceId' });
      deviceType = 'barrier_gate';
      if (barrierGate.status !== 'maintenance') {
        const updated = await updateBarrierGateStatus(deviceId, { ip: req.ip });
        status = updated.status;
      } else {
        status = barrierGate.status;
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
