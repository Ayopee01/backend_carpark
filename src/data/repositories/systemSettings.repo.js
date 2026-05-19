// Import Require
const defaults = require('../defaults');
const { getConfig, setConfig } = require('./config.repo');

// Constant key สำหรับอ้างอิง system settings ใน table app_config
const CONFIG_KEY = 'system_settings';

// Function query system settings จาก database ถ้าไม่มีให้ใช้ค่า default
async function getSystemSettings() {
  return getConfig(CONFIG_KEY, defaults.systemSettings);
}

// Function query receipt settings
async function getReceiptSettings() {
  const settings = await getSystemSettings();
  return settings.receipt || {};
}

// Function update printer settings ใน receipt
async function updatePrinterSettings({ fontSize, billNumberFontSize, paperWidth } = {}) {
  const current = await getSystemSettings();
  const newReceipt = {
    ...current.receipt,
    printer: {
      ...(current.receipt?.printer || {}),
      ...(fontSize !== undefined ? { fontSize } : {}),
      ...(billNumberFontSize !== undefined ? { billNumberFontSize } : {}),
      ...(paperWidth !== undefined ? { paperWidth } : {})
    }
  };

  const saved = await setConfig(CONFIG_KEY, {
    ...current,
    receipt: newReceipt,
    updatedAt: new Date().toISOString()
  });

  return saved.receipt.printer;
}

// Function update receipt settings แบบ merge ค่าเดิมกับค่าใหม่
async function updateReceiptSettings(body = {}) {
  const current = await getSystemSettings();
  const newReceipt = {
    ...current.receipt,
    ...body,
    entryBill: {
      ...(current.receipt?.entryBill || {}),
      ...(body.entryBill || {})
    },
    paymentBill: {
      ...(current.receipt?.paymentBill || {}),
      ...(body.paymentBill || {})
    }
  };

  const saved = await setConfig(CONFIG_KEY, {
    ...current,
    receipt: newReceipt,
    updatedAt: new Date().toISOString()
  });

  return saved.receipt;
}

// Function update system settings ทั้งก้อน
async function updateSystemSettings(body = {}) {
  const current = await getSystemSettings();
  return setConfig(CONFIG_KEY, {
    ...current,
    ...body,
    updatedAt: new Date().toISOString()
  });
}

// Export Functions
module.exports = {
  getReceiptSettings,
  getSystemSettings,
  updatePrinterSettings,
  updateReceiptSettings,
  updateSystemSettings
};
