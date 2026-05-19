// Import Require
const defaults = require('../defaults');
const { getConfig, setConfig } = require('./config.repo');

// Constant key สำหรับอ้างอิง config payment settings ใน table app_config
const CONFIG_KEY = 'payment_settings';

// Function query payment settings จาก database ถ้าไม่มีให้ใช้ค่า default
async function getPaymentSettings() {
  return getConfig(CONFIG_KEY, defaults.paymentSettings);
}

// Function query รายการ payment method ทั้งหมด
async function listMethods() {
  const settings = await getPaymentSettings();
  return settings.methods || [];
}

// Function update payment method ด้วย id แล้ว save กลับเข้า config
async function updateMethod(id, updates) {
  const settings = await getPaymentSettings();
  const methods = [...(settings.methods || [])];
  const index = methods.findIndex((method) => method.id === id);
  if (index === -1) return null;

  methods[index] = {
    ...methods[index],
    ...updates,
  };

  await setConfig(CONFIG_KEY, { ...settings, methods });
  return methods[index];
}

// Function query รายการ service channel ทั้งหมด
async function listChannels() {
  const settings = await getPaymentSettings();
  return settings.channels || [];
}

// Function update mapping วิธีชำระเงินที่อนุญาตในแต่ละ channel
async function updateChannelMapping(id, allowedMethods) {
  if (!Array.isArray(allowedMethods)) return null;

  const settings = await getPaymentSettings();
  const channels = [...(settings.channels || [])];
  const index = channels.findIndex((channel) => channel.id === id);
  if (index === -1) return null;

  channels[index] = {
    ...channels[index],
    allowedMethods,
  };

  await setConfig(CONFIG_KEY, { ...settings, channels });
  return channels[index];
}

// Export Functions
module.exports = {
  listMethods,
  updateMethod,
  listChannels,
  updateChannelMapping,
};
