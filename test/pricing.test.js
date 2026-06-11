const assert = require('node:assert/strict');
const { test } = require('node:test');

const { calculateFee } = require('../src/utils/pricing');

const pricingRules = [
  { id: 'pr_car_base_hour', feeType: 'base_hour', vehicleType: 'car', baseHours: 1, hourStart: 1, hourEnd: 1, price: 30, status: 'active' },
  { id: 'pr_car_next_hour', feeType: 'next_hour', vehicleType: 'car', hourStart: 2, hourEnd: null, price: 10, status: 'active' },
  { id: 'pr_car_overnight_day', feeType: 'overnight_day', vehicleType: 'car', periodUnit: 'day', periodStart: 1, periodEnd: null, price: 100, status: 'active' },
  { id: 'pr_motorcycle_base_hour', feeType: 'base_hour', vehicleType: 'motorcycle', baseHours: 1, hourStart: 1, hourEnd: 1, price: 10, status: 'active' },
  { id: 'pr_motorcycle_next_hour', feeType: 'next_hour', vehicleType: 'motorcycle', hourStart: 2, hourEnd: null, price: 5, status: 'active' },
];

test('uses base_hour as the starting amount for the base window', () => {
  const result = calculateFee(
    '2026-05-01T08:00:00+07:00',
    '2026-05-01T08:30:00+07:00',
    pricingRules,
    { vehicleType: 'car', serviceType: 'parking' }
  );

  assert.equal(result.totalHours, 1);
  assert.equal(result.totalAmount, 30);
  assert.deepEqual(result.appliedRules.map((rule) => ({
    feeType: rule.feeType,
    hours: rule.hours,
    amount: rule.amount,
  })), [
    { feeType: 'base_hour', hours: 1, amount: 30 },
  ]);
});

test('uses base_hour as the hourly fallback when no next_hour rule exists', () => {
  const result = calculateFee(
    '2026-05-25T03:30:00.000Z',
    '2026-06-11T09:11:02.151Z',
    [
      { id: 'pr_car_base_hour', feeType: 'base_hour', vehicleType: 'car', baseHours: 1, hourStart: 1, hourEnd: 1, price: 30, status: 'active' },
    ],
    { vehicleType: 'car', serviceType: 'parking' }
  );

  assert.equal(result.totalHours, 414);
  assert.equal(result.totalAmount, 12420);
  assert.deepEqual(result.appliedRules.map((rule) => ({
    feeType: rule.feeType,
    hours: rule.hours,
    amount: rule.amount,
  })), [
    { feeType: 'base_hour', hours: 414, amount: 12420 },
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
    { feeType: 'base_hour', hours: 1, amount: 30 },
    { feeType: 'next_hour', hours: 3, amount: 30 },
  ]);
});

test('keeps charging long-running transactions from base, hourly, and overnight rules', () => {
  const result = calculateFee(
    '2026-05-25T03:30:00.000Z',
    '2026-06-11T08:53:18.770Z',
    pricingRules,
    { vehicleType: 'car', serviceType: 'parking' }
  );

  assert.equal(result.totalHours, 414);
  assert.equal(result.totalAmount, 5860);
  assert.deepEqual(result.appliedRules.map((rule) => ({
    feeType: rule.feeType,
    hours: rule.hours,
    units: rule.units,
    amount: rule.amount,
  })), [
    { feeType: 'base_hour', hours: 1, units: undefined, amount: 30 },
    { feeType: 'next_hour', hours: 413, units: undefined, amount: 4130 },
    { feeType: 'overnight_day', hours: undefined, units: 17, amount: 1700 },
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
