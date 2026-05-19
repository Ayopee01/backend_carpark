// Import Require
const { createId } = require('../store');
const defaults = require('../defaults');
const { getConfig, setConfig } = require('./config.repo');
const { calculateFee } = require('../../utils/pricing');

// Constant key สำหรับอ้างอิง pricing config ใน table app_config
const CONFIG_KEY = 'pricing_config';

// Function query pricing config จาก database ถ้าไม่มีให้ใช้ค่า default
async function getPricingConfig() {
  return getConfig(CONFIG_KEY, defaults.pricingConfig);
}

// Function update pricing config ทั้งก้อน
async function updatePricingConfig(body = {}) {
  const current = await getPricingConfig();
  const nextConfig = {
    ...current,
    pricingRules: body.pricingRules || current.pricingRules,
    paymentChannels: body.paymentChannels || current.paymentChannels,
    serviceChannelMapping: body.serviceChannelMapping || current.serviceChannelMapping,
    masterData: body.masterData || current.masterData
  };

  return setConfig(CONFIG_KEY, nextConfig);
}

// Function create pricing rule ใหม่
async function createPricingRule(payload = {}) {
  const current = await getPricingConfig();
  const rule = {
    id: createId('pr'),
    serviceType: payload.serviceType,
    vehicleType: payload.vehicleType,
    conditionType: payload.conditionType || 'range',
    hourStart: Number(payload.hourStart ?? 1),
    hourEnd: payload.hourEnd === null ? null : Number(payload.hourEnd ?? 1),
    price: Number(payload.price),
    status: payload.status || 'active'
  };

  const nextConfig = {
    ...current,
    pricingRules: [...(current.pricingRules || []), rule]
  };

  await setConfig(CONFIG_KEY, nextConfig);
  return rule;
}

// Function update pricing rule ด้วย id
async function updatePricingRule(id, payload = {}) {
  const current = await getPricingConfig();
  const index = (current.pricingRules || []).findIndex((item) => item.id === id);
  if (index === -1) return null;

  const updatedRule = {
    ...current.pricingRules[index],
    ...payload
  };

  if (payload.hourStart !== undefined) updatedRule.hourStart = Number(payload.hourStart);
  if (payload.hourEnd !== undefined) updatedRule.hourEnd = payload.hourEnd === null ? null : Number(payload.hourEnd);
  if (payload.price !== undefined) updatedRule.price = Number(payload.price);

  const nextRules = [...current.pricingRules];
  nextRules[index] = updatedRule;

  await setConfig(CONFIG_KEY, { ...current, pricingRules: nextRules });
  return updatedRule;
}

// Function delete pricing rule ด้วย id
async function deletePricingRule(id) {
  const current = await getPricingConfig();
  const index = (current.pricingRules || []).findIndex((item) => item.id === id);
  if (index === -1) return null;

  const nextRules = [...current.pricingRules];
  const [rule] = nextRules.splice(index, 1);

  await setConfig(CONFIG_KEY, { ...current, pricingRules: nextRules });
  return rule;
}

// Function preview à¸„à¸³à¸™à¸§à¸“à¸£à¸²à¸„à¸²à¸ˆà¸²à¸ pricing rules à¸›à¸±à¸ˆà¸ˆà¸¸à¸šà¸±à¸™
async function calculatePricing(payload = {}) {
  const config = await getPricingConfig();
  const result = calculateFee(payload.entryAt, payload.exitAt || new Date().toISOString(), config.pricingRules || [], {
    vehicleType: payload.vehicleType || 'car',
    serviceType: payload.serviceType || 'parking'
  });

  return {
    input: {
      entryAt: payload.entryAt,
      exitAt: payload.exitAt || null,
      vehicleType: payload.vehicleType || 'car',
      serviceType: payload.serviceType || 'parking'
    },
    ...result
  };
}

// Export Functions
module.exports = {
  calculatePricing,
  createPricingRule,
  deletePricingRule,
  getPricingConfig,
  updatePricingConfig,
  updatePricingRule
};
