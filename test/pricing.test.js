const assert = require('node:assert/strict');
const { test } = require('node:test');

const { calculateFee } = require('../src/utils/pricing');

const pricingRules = [
  { id: 'pr_car_base_hour', feeType: 'base_hour', vehicleType: 'car', baseHours: 1, hourStart: 1, hourEnd: 1, price: 20, status: 'active' },
  { id: 'pr_car_next_hour', feeType: 'next_hour', vehicleType: 'car', hourStart: 3, hourEnd: null, price: 10, status: 'active' },
  { id: 'pr_car_overnight_day', feeType: 'overnight_day', vehicleType: 'car', periodUnit: 'day', periodStart: 1, periodEnd: null, price: 100, status: 'active' },
  { id: 'pr_motorcycle_base_hour', feeType: 'base_hour', vehicleType: 'motorcycle', baseHours: 1, hourStart: 1, hourEnd: 1, price: 10, status: 'active' },
  { id: 'pr_motorcycle_next_hour', feeType: 'next_hour', vehicleType: 'motorcycle', hourStart: 3, hourEnd: null, price: 5, status: 'active' },
];

test('uses service pricing rules for the base window before next_hour starts', () => {
  const result = calculateFee(
    '2026-05-01T08:00:00+07:00',
    '2026-05-01T10:00:00+07:00',
    pricingRules,
    { vehicleType: 'car', serviceType: 'parking' }
  );

  assert.equal(result.totalHours, 2);
  assert.equal(result.totalAmount, 40);
  assert.deepEqual(result.appliedRules.map((rule) => ({
    feeType: rule.feeType,
    hours: rule.hours,
    amount: rule.amount,
  })), [
    { feeType: 'base_hour', hours: 2, amount: 40 },
  ]);
});

test('adds next_hour price from the configured start hour', () => {
  const result = calculateFee(
    '2026-05-01T08:00:00+07:00',
    '2026-05-01T11:01:00+07:00',
    pricingRules,
    { vehicleType: 'car', serviceType: 'parking' }
  );

  assert.equal(result.totalHours, 4);
  assert.equal(result.totalAmount, 60);
  assert.deepEqual(result.appliedRules.map((rule) => ({
    feeType: rule.feeType,
    hours: rule.hours,
    amount: rule.amount,
  })), [
    { feeType: 'base_hour', hours: 2, amount: 40 },
    { feeType: 'next_hour', hours: 2, amount: 20 },
  ]);
});

test('filters rules by vehicle type so motorcycle pricing stays separate', () => {
  const result = calculateFee(
    '2026-05-03T07:45:00+07:00',
    '2026-05-03T08:20:00+07:00',
    pricingRules,
    { vehicleType: 'motorcycle', serviceType: 'parking' }
  );

  assert.equal(result.totalHours, 1);
  assert.equal(result.totalAmount, 10);
});

