const express = require('express');
const { getConfig } = require('../data/repositories/config.repo');
const defaults = require('../data/defaults');

const router = express.Router();

// Route public config พื้นฐานก่อน activation/login
router.get('/config', async (req, res, next) => {
  try {
    const currentTheme = await getConfig('theme', defaults.theme);
    const systemSettings = await getConfig('system_settings', defaults.systemSettings);

    return res.json({
      theme: {
        systemName: systemSettings.general?.systemName ?? null,
        themeColor: currentTheme.themeColor ?? null,
        logoUrl: currentTheme.logoUrl ?? null,
        themeMode: currentTheme.themeMode ?? '',
        customThemeColor: currentTheme.customThemeColor ?? null,
        updatedAt: currentTheme.updatedAt || null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Export Router
module.exports = router;
