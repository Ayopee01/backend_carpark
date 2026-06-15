const assert = require('node:assert/strict');
const { test } = require('node:test');

// Import function คำนวณค่าจอดจาก src/utils/pricing.js มาใช้ทดสอบ
const { calculateFee } = require('../src/utils/pricing');

// Config ทดสอบกรณีมีแค่ base_hour: ราคา 30 บาทต่อชั่วโมงสำหรับรถยนต์
const carBaseOnly = [
  { feeType: 'base_hour', vehicleType: 'car', price: 30, status: 'active' },
];

// Config ทดสอบกรณีมี rules ครบ: ชั่วโมงแรก, ชั่วโมงถัดไป, และค่าข้ามวัน
const carFullRules = [
  { feeType: 'base_hour', vehicleType: 'car', baseHours: 1, price: 30, status: 'active' },
  { feeType: 'next_hour', vehicleType: 'car', hourStart: 2, hourEnd: null, price: 10, status: 'active' },
  { feeType: 'overnight_day', vehicleType: 'car', periodUnit: 'day', price: 100, status: 'active' },
];

// Config ทดสอบแยกประเภทรถ motorcycle ออกจาก car
const motorcycleRules = [
  { feeType: 'base_hour', vehicleType: 'motorcycle', price: 10, status: 'active' },
];

// Config ทดสอบหลายช่วง: 1-2 ชั่วโมงแรก 30, ชั่วโมง 3-5 ราคา 10, หลังจากนั้น free
const carTierRules = [
  { feeType: 'base_hour', vehicleType: 'car', baseHours: 2, price: 30, status: 'active' },
  { feeType: 'next_hour', vehicleType: 'car', hourStart: 3, hourEnd: 5, price: 10, status: 'active' },
  { feeType: 'next_hour', vehicleType: 'car', hourStart: 6, hourEnd: null, price: 0, status: 'active' },
];

// Config ทดสอบข้ามวันแบบปรับเพิ่ม: ยอดชั่วโมงเดิม + วันละ 100
const carTierWithOvernightPenalty = [
  ...carTierRules,
  { feeType: 'overnight_day', vehicleType: 'car', periodUnit: 'day', price: 100, status: 'active' },
];

// Config ทดสอบข้ามวันแบบเหมา: ถ้าข้ามวันให้คิดวันละ 500 แทนยอดชั่วโมงเดิม
const carTierWithDailyFlat = [
  ...carTierRules,
  { feeType: 'overnight_day', vehicleType: 'car', periodUnit: 'day', price: 500, chargeMode: 'daily_flat', status: 'active' },
];

test('base_hour is used with parking duration when it is the only rule', () => {
  // เรียก calculateFee(entryAt, exitAt, pricingRules) โดยส่ง config carBaseOnly เข้าไป
  const fee = calculateFee('2026-05-25T03:30:00.000Z', '2026-06-11T09:11:02.151Z', carBaseOnly);

  // ตรวจคำตอบ: 414 ชั่วโมง * 30 บาท = 12,420 บาท
  assert.equal(fee.totalHours, 414);
  assert.equal(fee.totalAmount, 12420);
});

test('base, next hour, and overnight rules are added together', () => {
  // เรียก calculateFee ด้วย config carFullRules เพื่อให้รวม base + next_hour + overnight_day
  const fee = calculateFee('2026-05-25T03:30:00.000Z', '2026-06-11T08:53:18.770Z', carFullRules);

  // ตรวจคำตอบ: 30 + (413 * 10) + (17 * 100) = 5,860 บาท
  assert.equal(fee.totalHours, 414);
  assert.equal(fee.totalAmount, 5860);
});

test('supports tiered hours with a free range after hour 5', () => {
  // เรียก calculateFee ด้วย carTierRules: 1-2 ชม. * 30, 3-5 ชม. * 10, ชม. 6 free
  const fee = calculateFee('2026-05-01T08:00:00+07:00', '2026-05-01T14:00:00+07:00', carTierRules);

  // ตรวจคำตอบ: (2 * 30) + (3 * 10) + (1 * 0) = 90 บาท
  assert.equal(fee.totalHours, 6);
  assert.equal(fee.totalAmount, 90);
});

test('supports overnight as an additive daily penalty', () => {
  // เรียก calculateFee ด้วย carTierWithOvernightPenalty เพื่อบวกค่าปรับข้ามวันเพิ่มจากยอดชั่วโมง
  const fee = calculateFee('2026-05-01T08:00:00+07:00', '2026-05-02T10:00:00+07:00', carTierWithOvernightPenalty);

  // ตรวจคำตอบ: 90 บาทจากช่วงชั่วโมง + 100 บาทค่าข้ามวัน = 190 บาท
  assert.equal(fee.totalHours, 26);
  assert.equal(fee.totalAmount, 190);
});

test('supports overnight as a daily flat amount', () => {
  // เรียก calculateFee ด้วย carTierWithDailyFlat เพื่อให้ข้ามวันคิดเหมาแทนยอดชั่วโมงเดิม
  const fee = calculateFee('2026-05-01T08:00:00+07:00', '2026-05-02T10:00:00+07:00', carTierWithDailyFlat);

  // ตรวจคำตอบ: ข้าม 1 วันและ chargeMode เป็น daily_flat จึงคิด 500 บาท
  assert.equal(fee.totalHours, 26);
  assert.equal(fee.totalAmount, 500);
});

test('vehicle type selects the matching rule', () => {
  // เรียก calculateFee พร้อม option vehicleType เพื่อเลือก rule ของ motorcycle
  const fee = calculateFee('2026-05-03T07:45:00+07:00', '2026-05-03T08:20:00+07:00', motorcycleRules, {
    vehicleType: 'motorcycle',
  });

  // ตรวจคำตอบ: motorcycle จอดไม่ถึง 1 ชั่วโมง ปัดเป็น 1 ชั่วโมง ราคา 10 บาท
  assert.equal(fee.totalAmount, 10);
});
