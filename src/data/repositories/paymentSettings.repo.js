// Import Require
const defaults = require('../defaults');
const { getConfig, getConfigWithMeta, setConfig, stripConfigMeta } = require('./config.repo');

// Constant key สำหรับอ้างอิง config payment settings ใน table app_config
const CONFIG_KEY = 'payment_settings';

// Function query payment settings จาก database ถ้าไม่มีให้ใช้ค่า default
async function getPaymentSettings() {
  return getConfig(CONFIG_KEY, defaults.paymentSettings);
}

// Function query payment settings พร้อม version สำหรับ optimistic locking
async function getPaymentSettingsWithMeta() {
  return getConfigWithMeta(CONFIG_KEY, defaults.paymentSettings);
}

// Function query รายการ payment method ทั้งหมด
async function listMethods() {
  const settings = await getPaymentSettings();
  return settings.methods || [];
}

// Function query รายการ payment method พร้อม version ของ config
async function listMethodsWithMeta() {
  const settings = await getPaymentSettingsWithMeta();
  return {
    data: settings.methods || [],
    version: settings.version,
    configUpdatedAt: settings.configUpdatedAt,
  };
}

// Function update payment method ด้วย id แล้ว save กลับเข้า config
async function updateMethod(id, updates, expectedVersion) {
  const settings = await getPaymentSettings();
  const methods = [...(settings.methods || [])];
  const index = methods.findIndex((method) => method.id === id);
  if (index === -1) return null;

  methods[index] = {
    ...methods[index],
    ...stripConfigMeta(updates),
  };

  const saved = await setConfig(CONFIG_KEY, { ...settings, methods }, { expectedVersion });
  return { ...methods[index], version: saved.version, configUpdatedAt: saved.configUpdatedAt };
}

// Function query รายการ service channel ทั้งหมด
async function listChannels() {
  const settings = await getPaymentSettings();
  return settings.channels || [];
}

// Function query รายการ service channel พร้อม version ของ config
async function listChannelsWithMeta() {
  const settings = await getPaymentSettingsWithMeta();
  return {
    data: settings.channels || [],
    version: settings.version,
    configUpdatedAt: settings.configUpdatedAt,
  };
}

// Function update mapping วิธีชำระเงินที่อนุญาตในแต่ละ channel
async function updateChannelMapping(id, allowedMethods, expectedVersion) {
  if (!Array.isArray(allowedMethods)) return null;

  const settings = await getPaymentSettings();
  const methodIds = new Set((settings.methods || []).map((method) => method.id));
  if (allowedMethods.some((methodId) => !methodIds.has(methodId))) return null;

  const channels = [...(settings.channels || [])];
  const index = channels.findIndex((channel) => channel.id === id);
  if (index === -1) return null;

  channels[index] = {
    ...channels[index],
    allowedMethods,
  };

  const saved = await setConfig(CONFIG_KEY, { ...settings, channels }, { expectedVersion });
  return { ...channels[index], version: saved.version, configUpdatedAt: saved.configUpdatedAt };
}

async function validatePaymentSelection(channel, method) {
  const settings = await getPaymentSettings();
  const methods = Array.isArray(settings.methods) ? settings.methods : [];
  const channels = Array.isArray(settings.channels) ? settings.channels : [];
  const selectedMethod = methods.find((item) => item.id === method);

  if (!selectedMethod) {
    return { ok: false, message: 'Payment method not found' };
  }
  if (selectedMethod.isActive === false) {
    return { ok: false, message: 'Payment method is inactive' };
  }

  const channelId = channel && channel.startsWith('ch_') ? channel : `ch_${channel}`;
  const selectedChannel = channels.find((item) => item.id === channelId || item.id === channel || String(item.name || '').toLowerCase() === String(channel || '').toLowerCase());
  if (!selectedChannel) {
    return { ok: false, message: 'Payment channel not found' };
  }
  if (!Array.isArray(selectedChannel.allowedMethods) || !selectedChannel.allowedMethods.includes(method)) {
    return { ok: false, message: 'Payment method is not allowed for this channel' };
  }

  return { ok: true, method: selectedMethod, channel: selectedChannel };
}

// Export Functions
module.exports = {
  getPaymentSettingsWithMeta,
  listMethods,
  listMethodsWithMeta,
  updateMethod,
  listChannels,
  listChannelsWithMeta,
  updateChannelMapping,
  validatePaymentSelection,
};
