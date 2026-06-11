// Import Require
const { createId } = require('../store');
const defaults = require('../defaults');
const { getConfig, getConfigWithMeta, setConfig, stripConfigMeta } = require('./config.repo');

// Constant key for pricing config in app_config table
const CONFIG_KEY = 'pricing_config';
const ALLOWED_FEE_TYPES = ['base_hour', 'next_hour', 'overnight_day', 'overnight_week', 'overnight_month', 'overnight_year'];
const ALLOWED_VEHICLE_TYPES = ['car', 'motorcycle'];

function normalizeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeNullableNumber(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  return normalizeNumber(value, fallback);
}

function defaultHourStart(feeType) {
  return feeType === 'next_hour' ? 2 : 1;
}

function defaultHourEnd(feeType, baseHours) {
  if (feeType === 'next_hour') return null;
  return baseHours;
}

function defaultPeriodUnit(feeType) {
  return String(feeType || '').startsWith('overnight_')
    ? String(feeType).replace('overnight_', '')
    : null;
}

function normalizePricingItem(payload = {}, current = {}) {
  const feeType = payload.feeType || current.feeType || 'base_hour';
  const vehicleType = payload.vehicleType || current.vehicleType || 'car';
  const baseHours = normalizeNumber(payload.baseHours ?? current.baseHours, 1);
  const fallbackHourEnd = defaultHourEnd(feeType, baseHours);

  return {
    ...current,
    ...payload,
    id: current.id || payload.id || createId('pr'),
    name: payload.name || current.name || feeType,
    feeType: ALLOWED_FEE_TYPES.includes(feeType) ? feeType : 'base_hour',
    vehicleType: ALLOWED_VEHICLE_TYPES.includes(vehicleType) ? vehicleType : 'car',
    price: normalizeNumber(payload.price ?? current.price, 0),
    baseHours,
    hourStart: normalizeNumber(payload.hourStart ?? current.hourStart, defaultHourStart(feeType)),
    hourEnd: payload.hourEnd === null
      ? null
      : normalizeNullableNumber(payload.hourEnd ?? current.hourEnd, fallbackHourEnd),
    periodUnit: payload.periodUnit || current.periodUnit || defaultPeriodUnit(feeType),
    periodStart: normalizeNumber(payload.periodStart ?? current.periodStart, 1),
    periodEnd: payload.periodEnd === null ? null : normalizeNullableNumber(payload.periodEnd ?? current.periodEnd, null),
    status: payload.status || current.status || 'active',
  };
}

async function getPricingConfig() {
  return getConfig(CONFIG_KEY, defaults.pricingConfig);
}

async function getPricingConfigWithMeta() {
  return getConfigWithMeta(CONFIG_KEY, defaults.pricingConfig);
}

async function getPricingRulesConfigWithMeta() {
  const config = await getPricingConfigWithMeta();
  return {
    pricingRules: Array.isArray(config.pricingRules) ? config.pricingRules : [],
    configUpdatedAt: config.configUpdatedAt,
  };
}

async function updatePricingConfig(body = {}) {
  const cleanBody = stripConfigMeta(body);
  const current = await getPricingConfig();
  const nextConfig = {
    ...current,
    ...cleanBody,
    pricingRules: Array.isArray(cleanBody.pricingRules)
      ? cleanBody.pricingRules.map((item) => normalizePricingItem(item))
      : current.pricingRules,
    paymentChannels: cleanBody.paymentChannels || current.paymentChannels,
    serviceChannelMapping: cleanBody.serviceChannelMapping || current.serviceChannelMapping,
    masterData: cleanBody.masterData || current.masterData,
  };

  return setConfig(CONFIG_KEY, nextConfig);
}

async function createPricingConfigItem(payload = {}) {
  const current = await getPricingConfig();
  const item = normalizePricingItem(stripConfigMeta(payload));
  const nextConfig = {
    ...current,
    pricingRules: [...(current.pricingRules || []), item],
  };

  const saved = await setConfig(CONFIG_KEY, nextConfig);
  return { ...item, configUpdatedAt: saved.configUpdatedAt };
}

async function updatePricingConfigItem(id, payload = {}) {
  const current = await getPricingConfig();
  const index = (current.pricingRules || []).findIndex((item) => item.id === id);
  if (index === -1) return null;

  const nextRules = [...current.pricingRules];
  nextRules[index] = normalizePricingItem(stripConfigMeta(payload), current.pricingRules[index]);

  const saved = await setConfig(CONFIG_KEY, { ...current, pricingRules: nextRules });
  return { ...nextRules[index], configUpdatedAt: saved.configUpdatedAt };
}

async function deletePricingConfigItem(id) {
  const current = await getPricingConfig();
  const index = (current.pricingRules || []).findIndex((item) => item.id === id);
  if (index === -1) return null;

  const nextRules = [...current.pricingRules];
  const [item] = nextRules.splice(index, 1);

  const saved = await setConfig(CONFIG_KEY, { ...current, pricingRules: nextRules });
  return { ...item, configUpdatedAt: saved.configUpdatedAt };
}

// Export Functions
module.exports = {
  createPricingConfigItem,
  deletePricingConfigItem,
  getPricingConfig,
  getPricingConfigWithMeta,
  getPricingRulesConfigWithMeta,
  updatePricingConfig,
  updatePricingConfigItem,
};
