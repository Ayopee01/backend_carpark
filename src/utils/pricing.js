const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function isActiveVehicleRule(rule, vehicleType) {
  return rule.status === 'active' && (!rule.vehicleType || rule.vehicleType === vehicleType);
}

function getActiveRules(pricingRules = [], vehicleType = 'car') {
  return pricingRules.filter((rule) => isActiveVehicleRule(rule, vehicleType));
}

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getRulePrice(rule) {
  return toFiniteNumber(rule?.price, 0);
}

function getBaseHours(rule) {
  return Math.max(1, toFiniteNumber(rule?.baseHours ?? rule?.hourEnd, 1));
}

function getHourEnd(rule) {
  if (rule.hourEnd === null || rule.hourEnd === undefined || rule.hourEnd === 999) return null;
  return toFiniteNumber(rule.hourEnd, null);
}

function getPeriodEnd(rule) {
  if (rule.periodEnd === null || rule.periodEnd === undefined || rule.periodEnd === 999) return null;
  return toFiniteNumber(rule.periodEnd, null);
}

function calculateModernFee(totalHours, diffMs, rules) {
  const baseRule = rules.find((rule) => rule.feeType === 'base_hour');
  const nextRules = rules
    .filter((rule) => rule.feeType === 'next_hour')
    .sort((a, b) => toFiniteNumber(a.hourStart, 0) - toFiniteNumber(b.hourStart, 0));
  const overnightRules = rules.filter((rule) => String(rule.feeType || '').startsWith('overnight_'));
  const appliedRules = [];
  let totalAmount = 0;
  const baseHours = baseRule ? getBaseHours(baseRule) : 0;

  if (baseRule && totalHours > 0) {
    const firstNextStart = nextRules.length
      ? Math.min(...nextRules.map((rule) => Math.max(1, toFiniteNumber(rule.hourStart, baseHours + 1 || 2))))
      : null;
    const baseWindowHours = firstNextStart === null
      ? totalHours
      : Math.max(baseHours, firstNextStart - 1);
    const chargedHours = Math.min(totalHours, baseWindowHours);
    const pricePerHour = getRulePrice(baseRule);
    const amount = chargedHours * pricePerHour;
    totalAmount += amount;
    appliedRules.push({
      ruleId: baseRule.id,
      feeType: baseRule.feeType,
      hours: chargedHours,
      pricePerHour,
      amount,
    });
  }

  nextRules.forEach((rule) => {
    const startHour = Math.max(1, toFiniteNumber(rule.hourStart, baseHours + 1 || 2));
    const endHour = getHourEnd(rule);
    if (totalHours < startHour) return;

    const lastChargedHour = endHour === null ? totalHours : Math.min(totalHours, endHour);
    const chargeableHours = Math.max(0, lastChargedHour - startHour + 1);
    if (chargeableHours <= 0) return;

    const pricePerHour = getRulePrice(rule);
    const amount = chargeableHours * pricePerHour;
    totalAmount += amount;
    appliedRules.push({
      ruleId: rule.id,
      feeType: rule.feeType,
      hours: chargeableHours,
      hourStart: startHour,
      hourEnd: endHour,
      pricePerHour,
      amount,
    });
  });

  let remainingDays = Math.max(0, Math.ceil(diffMs / DAY_MS) - 1);
  const periodOrder = [
    { unit: 'year', days: 365 },
    { unit: 'month', days: 30 },
    { unit: 'week', days: 7 },
    { unit: 'day', days: 1 },
  ];

  periodOrder.forEach(({ unit, days }) => {
    const rule = overnightRules.find((item) => (item.periodUnit || String(item.feeType).replace('overnight_', '')) === unit);
    if (!rule || remainingDays <= 0) return;

    const availableUnits = Math.floor(remainingDays / days);
    const periodStart = Math.max(1, toFiniteNumber(rule.periodStart, 1));
    const periodEnd = getPeriodEnd(rule);
    const chargeableUnits = periodEnd === null
      ? availableUnits
      : Math.min(availableUnits, periodEnd);
    if (chargeableUnits < periodStart) return;

    const amount = chargeableUnits * getRulePrice(rule);
    totalAmount += amount;
    remainingDays -= chargeableUnits * days;
    appliedRules.push({
      ruleId: rule.id,
      feeType: rule.feeType,
      periodUnit: unit,
      units: chargeableUnits,
      pricePerUnit: getRulePrice(rule),
      amount,
    });
  });

  return { totalAmount, appliedRules };
}

function calculateLegacyFee(totalHours, relevantRules) {
  let totalAmount = 0;
  const appliedRules = [];
  const missingHours = [];

  for (let h = 1; h <= totalHours; h++) {
    const rule = relevantRules.find((item) => h >= item.hourStart && (item.hourEnd === null || h <= item.hourEnd || item.hourEnd === 999));
    if (rule) {
      const price = Number(rule.price);
      totalAmount += Number.isFinite(price) ? price : 0;
      appliedRules.push({
        hour: h,
        ruleId: rule.id,
        serviceType: rule.serviceType,
        vehicleType: rule.vehicleType,
        conditionType: rule.conditionType || 'range',
        hourStart: rule.hourStart,
        hourEnd: rule.hourEnd,
        price: Number.isFinite(price) ? price : 0,
      });
    } else {
      missingHours.push(h);
    }
  }

  return { totalAmount, appliedRules, missingHours };
}

function calculateFee(entryAt, exitAt, pricingRules = [], { vehicleType = 'car', serviceType = 'parking' } = {}) {
  const start = new Date(entryAt);
  const end = exitAt ? new Date(exitAt) : new Date();
  const diffMs = end - start;

  if (!entryAt || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || diffMs < 0) {
    return {
      totalHours: 0,
      totalAmount: 0,
      durationMs: 0,
      appliedRules: [],
      missingHours: [],
    };
  }

  const totalHours = Math.ceil(diffMs / HOUR_MS);
  const activeRules = getActiveRules(pricingRules, vehicleType);
  const hasModernRules = activeRules.some((rule) => rule.feeType);

  if (hasModernRules) {
    const result = calculateModernFee(totalHours, diffMs, activeRules);
    return {
      totalHours,
      totalAmount: result.totalAmount,
      durationMs: diffMs,
      appliedRules: result.appliedRules,
      missingHours: [],
    };
  }

  const relevantRules = activeRules
    .filter((rule) => rule.serviceType === serviceType)
    .sort((a, b) => a.hourStart - b.hourStart);
  const result = calculateLegacyFee(totalHours, relevantRules);

  return {
    totalHours,
    totalAmount: result.totalAmount,
    durationMs: diffMs,
    appliedRules: result.appliedRules,
    missingHours: result.missingHours,
  };
}

module.exports = { calculateFee };
