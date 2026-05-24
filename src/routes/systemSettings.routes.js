// Import Require
const express = require('express');
const {
  getReceiptSettingsWithMeta,
  getSystemSettingsWithMeta,
  updatePrinterSettings,
  updateReceiptSettings,
  updateSystemSettings
} = require('../data/repositories/systemSettings.repo');
const { getExpectedConfigVersion } = require('../data/repositories/config.repo');
const { authorize } = require('../middleware/permission');

const router = express.Router();

// Apply permission check สำหรับเมนู settings
router.use(authorize('settings'));

// Route query system settings
router.get('/', async (req, res, next) => {
  try {
    const settings = await getSystemSettingsWithMeta();
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

// Route query receipt settings
router.get('/receipt', async (req, res, next) => {
  try {
    const receipt = await getReceiptSettingsWithMeta();
    res.json(receipt);
  } catch (err) {
    next(err);
  }
});

// Route update printer settings
router.put('/receipt/printer', async (req, res, next) => {
  try {
    const printer = await updatePrinterSettings(req.body || {}, getExpectedConfigVersion(req));
    res.json({ message: 'Printer settings updated', printer });
  } catch (err) {
    next(err);
  }
});

// Route update receipt settings
router.put('/receipt', async (req, res, next) => {
  try {
    const receipt = await updateReceiptSettings(req.body || {}, getExpectedConfigVersion(req));
    res.json({ message: 'Receipt settings updated', receipt });
  } catch (err) {
    next(err);
  }
});

// Route update system settings
router.put('/', async (req, res, next) => {
  try {
    const settings = await updateSystemSettings(req.body || {}, getExpectedConfigVersion(req));
    res.json({ message: 'System settings updated', settings });
  } catch (err) {
    next(err);
  }
});

// Export router
module.exports = router;
