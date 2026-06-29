// Import Require
const defaults = require('../defaults');
const { getConfig, getConfigWithMeta, setConfig, stripConfigMeta } = require('./config.repo');

// Constant key สำหรับอ้างอิง system settings ใน table app_config
const CONFIG_KEY = 'system_settings';

// Function ดึง system settings
async function getSystemSettings() {
  return getConfig(CONFIG_KEY, defaults.systemSettings);
}

// Function ดึง system settings พร้อม meta
async function getSystemSettingsWithMeta() {
  return getConfigWithMeta(CONFIG_KEY, defaults.systemSettings);
}

// Function ดึง receipt settings
async function getReceiptSettings() {
  const settings = await getSystemSettings();
  return settings.receipt || {};
}

// Function ดึง receipt settings พร้อม configUpdatedAt
async function getReceiptSettingsWithMeta() {
  const settings = await getSystemSettingsWithMeta();
  return {
    ...(settings.receipt || {}),
    configUpdatedAt: settings.configUpdatedAt,
  };
}

// Function update printer settings
async function updatePrinterSettings({ fontSize, billNumberFontSize, paperWidth } = {}) {
  const current = await getSystemSettings();
  const newReceipt = {
    ...current.receipt,
    printer: {
      ...(current.receipt?.printer || {}),
      ...(fontSize !== undefined ? { fontSize } : {}),
      ...(billNumberFontSize !== undefined ? { billNumberFontSize } : {}),
      ...(paperWidth !== undefined ? { paperWidth } : {}),
    },
  };

  const saved = await setConfig(CONFIG_KEY, {
    ...current,
    receipt: newReceipt,
    updatedAt: new Date().toISOString(),
  });

  return { ...saved.receipt.printer, configUpdatedAt: saved.configUpdatedAt };
}

// Function update receipt settings
async function updateReceiptSettings(body = {}) {
  const current = await getSystemSettings();
  const cleanBody = stripConfigMeta(body);
  const newReceipt = {
    ...current.receipt,
    ...cleanBody,
    entryBill: {
      ...(current.receipt?.entryBill || {}),
      ...(cleanBody.entryBill || {}),
    },
    paymentBill: {
      ...(current.receipt?.paymentBill || {}),
      ...(cleanBody.paymentBill || {}),
    },
  };

  const saved = await setConfig(CONFIG_KEY, {
    ...current,
    receipt: newReceipt,
    updatedAt: new Date().toISOString(),
  });

  return { ...saved.receipt, configUpdatedAt: saved.configUpdatedAt };
}

// Function update system settings
async function updateSystemSettings(body = {}) {
  const current = await getSystemSettings();
  return setConfig(CONFIG_KEY, {
    ...current,
    ...stripConfigMeta(body),
    updatedAt: new Date().toISOString(),
  });
}

// Export Functions
module.exports = {
  getReceiptSettings,
  getReceiptSettingsWithMeta,
  getSystemSettings,
  getSystemSettingsWithMeta,
  updatePrinterSettings,
  updateReceiptSettings,
  updateSystemSettings,
};