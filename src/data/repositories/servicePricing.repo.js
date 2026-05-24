// Import Require
const { createId } = require('../store');
const defaults = require('../defaults');
const { getConfig, getConfigWithMeta, setConfig, stripConfigMeta } = require('./config.repo');

// Constant key for pricing config in app_config table
const CONFIG_KEY = 'pricing_config';
const ALLOWED_FEE_TYPES = ['base_hour', 'next_hour', 'overnight_day', 'overnight_week', 'overnight_month', 'overnight_year'];
const ALLOWED_VEHICLE_TYPES = ['car', 'motorcycle'];

// Function แปลงค่าเป็น number ถ้าแปลงไม่ได้ให้ใช้ fallback
function normalizeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

// Function normalize pricing rule ให้มี field และค่ามาตรฐานที่ระบบรองรับเสมอ
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

// Function query pricing config พร้อม version สำหรับ optimistic locking.
async function getPricingConfigWithMeta() {
  return getConfigWithMeta(CONFIG_KEY, defaults.pricingConfig);
}

// Function replace/merge pricing config as one admin config object.
async function updatePricingConfig(body = {}, expectedVersion) {
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

  return setConfig(CONFIG_KEY, nextConfig, { expectedVersion });
}

// Function add one pricing config item.
async function createPricingConfigItem(payload = {}, expectedVersion) {
  const current = await getPricingConfig();
  const item = normalizePricingItem(stripConfigMeta(payload));
  const nextConfig = {
    ...current,
    pricingRules: [...(current.pricingRules || []), item],
  };

  const saved = await setConfig(CONFIG_KEY, nextConfig, { expectedVersion });
  return { ...item, version: saved.version, configUpdatedAt: saved.configUpdatedAt };
}

// Function update one pricing config item by id.
async function updatePricingConfigItem(id, payload = {}, expectedVersion) {
  const current = await getPricingConfig();
  const index = (current.pricingRules || []).findIndex((item) => item.id === id);
  if (index === -1) return null;

  const nextRules = [...current.pricingRules];
  nextRules[index] = normalizePricingItem(stripConfigMeta(payload), current.pricingRules[index]);

  const saved = await setConfig(CONFIG_KEY, { ...current, pricingRules: nextRules }, { expectedVersion });
  return { ...nextRules[index], version: saved.version, configUpdatedAt: saved.configUpdatedAt };
}

// Function delete one pricing config item by id.
async function deletePricingConfigItem(id, expectedVersion) {
  const current = await getPricingConfig();
  const index = (current.pricingRules || []).findIndex((item) => item.id === id);
  if (index === -1) return null;

  const nextRules = [...current.pricingRules];
  const [item] = nextRules.splice(index, 1);

  const saved = await setConfig(CONFIG_KEY, { ...current, pricingRules: nextRules }, { expectedVersion });
  return { ...item, version: saved.version, configUpdatedAt: saved.configUpdatedAt };
}

// Export Functions
module.exports = {
  createPricingConfigItem,
  deletePricingConfigItem,
  getPricingConfig,
  getPricingConfigWithMeta,
  updatePricingConfig,
  updatePricingConfigItem,
};
