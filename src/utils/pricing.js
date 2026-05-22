const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function isActiveVehicleRule(rule, vehicleType) {
  return rule.status === 'active' && (!rule.vehicleType || rule.vehicleType === vehicleType);
}

function getActiveRules(pricingRules = [], vehicleType = 'car') {
  return pricingRules.filter((rule) => isActiveVehicleRule(rule, vehicleType));
}

function calculateModernFee(totalHours, diffMs, rules) {
  const baseRule = rules.find((rule) => rule.feeType === 'base_hour');
  const nextRule = rules.find((rule) => rule.feeType === 'next_hour');
  const overnightRules = rules.filter((rule) => String(rule.feeType || '').startsWith('overnight_'));
  const appliedRules = [];
  let totalAmount = 0;

  if (baseRule && totalHours > 0) {
    const baseHours = Number(baseRule.baseHours || baseRule.hourEnd || 1);
    totalAmount += Number(baseRule.price || 0);
    appliedRules.push({
      ruleId: baseRule.id,
      feeType: baseRule.feeType,
      hours: Math.min(totalHours, baseHours),
      price: Number(baseRule.price || 0),
    });
  }

  if (nextRule && totalHours >= Number(nextRule.hourStart || 2)) {
    const chargeableHours = totalHours - Number(nextRule.hourStart || 2) + 1;
    const amount = chargeableHours * Number(nextRule.price || 0);
    totalAmount += amount;
    appliedRules.push({
      ruleId: nextRule.id,
      feeType: nextRule.feeType,
      hours: chargeableHours,
      pricePerHour: Number(nextRule.price || 0),
      amount,
    });
  }

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

    const units = Math.floor(remainingDays / days);
    if (units <= 0) return;

    const amount = units * Number(rule.price || 0);
    totalAmount += amount;
    remainingDays -= units * days;
    appliedRules.push({
      ruleId: rule.id,
      feeType: rule.feeType,
      periodUnit: unit,
      units,
      pricePerUnit: Number(rule.price || 0),
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

// Function calculate parking fee from current service-pricing config rules.
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

// Export Functions
module.exports = { calculateFee };
