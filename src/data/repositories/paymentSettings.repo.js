// Import Require
const defaults = require('../defaults');
const { getConfig, getConfigWithMeta, setConfig, stripConfigMeta } = require('./config.repo');

// Config Key สำหรับ payment settings
const CONFIG_KEY = 'payment_settings';

// Function ดึง payment settings
async function getPaymentSettings() {
  return getConfig(CONFIG_KEY, defaults.paymentSettings);
}

// Function ดึง payment settings พร้อม meta
async function getPaymentSettingsWithMeta() {
  return getConfigWithMeta(CONFIG_KEY, defaults.paymentSettings);
}

// Function query รายการ payment method ทั้งหมด
async function listMethods() {
  const settings = await getPaymentSettings();
  return settings.methods || [];
}

// Function query รายการ payment method พร้อม configUpdatedAt
async function listMethodsWithMeta() {
  const settings = await getPaymentSettingsWithMeta();
  return {
    data: settings.methods || [],
    configUpdatedAt: settings.configUpdatedAt,
  };
}

// Function update payment method ด้วย id
async function updateMethod(id, updates) {
  const settings = await getPaymentSettings();
  const methods = [...(settings.methods || [])];
  const index = methods.findIndex((method) => method.id === id);
  if (index === -1) return null;

  methods[index] = {
    ...methods[index],
    ...stripConfigMeta(updates),
  };

  const saved = await setConfig(CONFIG_KEY, { ...settings, methods });
  return { ...methods[index], configUpdatedAt: saved.configUpdatedAt };
}

// Function delete payment method ด้วย id
async function deleteMethod(id) {
  const settings = await getPaymentSettings();
  const methods = [...(settings.methods || [])];
  const index = methods.findIndex((method) => method.id === id);
  if (index === -1) return null;

  const nextMethods = methods.filter((method) => method.id !== id);
  const nextChannels = (settings.channels || []).map((channel) => ({
    ...channel,
    allowedMethods: Array.isArray(channel.allowedMethods)
      ? channel.allowedMethods.filter((methodId) => methodId !== id)
      : channel.allowedMethods,
  }));

  const saved = await setConfig(CONFIG_KEY, {
    ...settings,
    methods: nextMethods,
    channels: nextChannels,
  });
  return { id, configUpdatedAt: saved.configUpdatedAt };
}

// Function query รายการ payment channel ทั้งหมด
async function listChannels() {
  const settings = await getPaymentSettings();
  return settings.channels || [];
}

// Function query รายการ payment channel พร้อม configUpdatedAt
async function listChannelsWithMeta() {
  const settings = await getPaymentSettingsWithMeta();
  return {
    data: settings.channels || [],
    configUpdatedAt: settings.configUpdatedAt,
  };
}

// Function update mapping method ที่อนุญาตใน channel
async function updateChannelMapping(id, allowedMethods) {
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

  const saved = await setConfig(CONFIG_KEY, { ...settings, channels });
  return { ...channels[index], configUpdatedAt: saved.configUpdatedAt };
}

// Function delete payment channel ด้วย id
async function deleteChannel(id) {
  const settings = await getPaymentSettings();
  const channels = [...(settings.channels || [])];
  const index = channels.findIndex((channel) => channel.id === id);
  if (index === -1) return null;

  const nextChannels = channels.filter((channel) => channel.id !== id);
  const saved = await setConfig(CONFIG_KEY, {
    ...settings,
    channels: nextChannels,
  });
  return { id, configUpdatedAt: saved.configUpdatedAt };
}

// Function validate ว่า method สามารถใช้งานกับ channel นี้ได้หรือไม่
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
  deleteMethod,
  updateMethod,
  listChannels,
  listChannelsWithMeta,
  deleteChannel,
  updateChannelMapping,
  validatePaymentSelection,
};