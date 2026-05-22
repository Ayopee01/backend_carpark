// Import Require
const { createId } = require('../store');
const defaults = require('../defaults');
const { getConfig, setConfig } = require('./config.repo');

// Constant key for pricing config in app_config table
const CONFIG_KEY = 'pricing_config';
const ALLOWED_FEE_TYPES = ['base_hour', 'next_hour', 'overnight_day', 'overnight_week', 'overnight_month', 'overnight_year'];
const ALLOWED_VEHICLE_TYPES = ['car', 'motorcycle'];

function normalizeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizePricingItem(payload = {}, current = {}) {
  const feeType = payload.feeType || current.feeType || 'base_hour';
  const vehicleType = payload.vehicleType || current.vehicleType || 'car';

  return {
    ...current,
    ...payload,
    id: current.id || payload.id || createId('pr'),
    name: payload.name || current.name || feeType,
    feeType: ALLOWED_FEE_TYPES.includes(feeType) ? feeType : 'base_hour',
    vehicleType: ALLOWED_VEHICLE_TYPES.includes(vehicleType) ? vehicleType : 'car',
    price: normalizeNumber(payload.price ?? current.price, 0),
    baseHours: normalizeNumber(payload.baseHours ?? current.baseHours, 1),
    hourStart: normalizeNumber(payload.hourStart ?? current.hourStart, 1),
    hourEnd: payload.hourEnd === null ? null : normalizeNumber(payload.hourEnd ?? current.hourEnd, 1),
    periodUnit: payload.periodUnit || current.periodUnit || null,
    periodStart: normalizeNumber(payload.periodStart ?? current.periodStart, 1),
    periodEnd: payload.periodEnd === null ? null : normalizeNumber(payload.periodEnd ?? current.periodEnd, 1),
    status: payload.status || current.status || 'active',
  };
}

// Function query pricing config from database, fallback to defaults.
async function getPricingConfig() {
  return getConfig(CONFIG_KEY, defaults.pricingConfig);
}

// Function replace/merge pricing config as one admin config object.
async function updatePricingConfig(body = {}) {
  const current = await getPricingConfig();
  const nextConfig = {
    ...current,
    ...body,
    pricingRules: Array.isArray(body.pricingRules)
      ? body.pricingRules.map((item) => normalizePricingItem(item))
      : current.pricingRules,
    paymentChannels: body.paymentChannels || current.paymentChannels,
    serviceChannelMapping: body.serviceChannelMapping || current.serviceChannelMapping,
    masterData: body.masterData || current.masterData,
  };

  return setConfig(CONFIG_KEY, nextConfig);
}

// Function add one pricing config item.
async function createPricingConfigItem(payload = {}) {
  const current = await getPricingConfig();
  const item = normalizePricingItem(payload);
  const nextConfig = {
    ...current,
    pricingRules: [...(current.pricingRules || []), item],
  };

  await setConfig(CONFIG_KEY, nextConfig);
  return item;
}

// Function update one pricing config item by id.
async function updatePricingConfigItem(id, payload = {}) {
  const current = await getPricingConfig();
  const index = (current.pricingRules || []).findIndex((item) => item.id === id);
  if (index === -1) return null;

  const nextRules = [...current.pricingRules];
  nextRules[index] = normalizePricingItem(payload, current.pricingRules[index]);

  await setConfig(CONFIG_KEY, { ...current, pricingRules: nextRules });
  return nextRules[index];
}

// Function delete one pricing config item by id.
async function deletePricingConfigItem(id) {
  const current = await getPricingConfig();
  const index = (current.pricingRules || []).findIndex((item) => item.id === id);
  if (index === -1) return null;

  const nextRules = [...current.pricingRules];
  const [item] = nextRules.splice(index, 1);

  await setConfig(CONFIG_KEY, { ...current, pricingRules: nextRules });
  return item;
}

// Export Functions
module.exports = {
  createPricingConfigItem,
  deletePricingConfigItem,
  getPricingConfig,
  updatePricingConfig,
  updatePricingConfigItem,
};
