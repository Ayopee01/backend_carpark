// Import Require
const express = require('express');
const {
  getReceiptSettingsWithMeta,
  getSystemSettingsWithMeta,
  updatePrinterSettings,
  updateReceiptSettings,
  updateSystemSettings
} = require('../data/repositories/systemSettings.repo');
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
    const printer = await updatePrinterSettings(req.body || {});
    res.json({ message: 'Printer settings updated', printer });
  } catch (err) {
    next(err);
  }
});

// Route update receipt settings
router.put('/receipt', async (req, res, next) => {
  try {
    await updateReceiptSettings(req.body || {});
    res.json({ success: true, message: 'Receipt settings updated' });
  } catch (err) {
    next(err);
  }
});

// Route update system settings
router.put('/', async (req, res, next) => {
  try {
    await updateSystemSettings(req.body || {});
    res.json({ success: true, message: 'System settings updated' });
  } catch (err) {
    next(err);
  }
});

// Export router
module.exports = router;
