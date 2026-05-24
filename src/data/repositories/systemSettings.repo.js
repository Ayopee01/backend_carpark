// Import Require
const defaults = require('../defaults');
const { getConfig, getConfigWithMeta, setConfig, stripConfigMeta } = require('./config.repo');

// Constant key สำหรับอ้างอิง system settings ใน table app_config
const CONFIG_KEY = 'system_settings';

// Function query system settings จาก database ถ้าไม่มีให้ใช้ค่า default
async function getSystemSettings() {
  return getConfig(CONFIG_KEY, defaults.systemSettings);
}

// Function query system settings พร้อม version สำหรับ optimistic locking
async function getSystemSettingsWithMeta() {
  return getConfigWithMeta(CONFIG_KEY, defaults.systemSettings);
}

// Function query receipt settings
async function getReceiptSettings() {
  const settings = await getSystemSettings();
  return settings.receipt || {};
}

// Function query receipt settings พร้อม version ของ system settings
async function getReceiptSettingsWithMeta() {
  const settings = await getSystemSettingsWithMeta();
  return {
    ...(settings.receipt || {}),
    version: settings.version,
    configUpdatedAt: settings.configUpdatedAt,
  };
}

// Function update printer settings ใน receipt
async function updatePrinterSettings({ fontSize, billNumberFontSize, paperWidth } = {}, expectedVersion) {
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
  }, { expectedVersion });

  return { ...saved.receipt.printer, version: saved.version, configUpdatedAt: saved.configUpdatedAt };
}

// Function update receipt settings แบบ merge ค่าเดิมกับค่าใหม่
async function updateReceiptSettings(body = {}, expectedVersion) {
  const current = await getSystemSettings();
  const cleanBody = stripConfigMeta(body);
  const newReceipt = {
    ...current.receipt,
    ...cleanBody,
    entryBill: {
      ...(current.receipt?.entryBill || {}),
      ...(cleanBody.entryBill || {})
    },
    paymentBill: {
      ...(current.receipt?.paymentBill || {}),
      ...(cleanBody.paymentBill || {})
    }
  };

  const saved = await setConfig(CONFIG_KEY, {
    ...current,
    receipt: newReceipt,
    updatedAt: new Date().toISOString()
  }, { expectedVersion });

  return { ...saved.receipt, version: saved.version, configUpdatedAt: saved.configUpdatedAt };
}

// Function update system settings ทั้งก้อน
async function updateSystemSettings(body = {}, expectedVersion) {
  const current = await getSystemSettings();
  return setConfig(CONFIG_KEY, {
    ...current,
    ...stripConfigMeta(body),
    updatedAt: new Date().toISOString()
  }, { expectedVersion });
}

// Export Functions
module.exports = {
  getReceiptSettings,
  getReceiptSettingsWithMeta,
  getSystemSettings,
  getSystemSettingsWithMeta,
  updatePrinterSettings,
  updateReceiptSettings,
  updateSystemSettings
};
