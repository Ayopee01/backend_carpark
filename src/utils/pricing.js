// Function คำนวณค่าจอดรถจากเวลาเข้า เวลาออก และกฎราคาที่กำหนด
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
      missingHours: []
    };
  }

  // คำนวณจำนวนชั่วโมงแบบปัดขึ้น เช่น 1 ชั่วโมง 1 นาที = 2 ชั่วโมง
  const totalHours = Math.ceil(diffMs / (1000 * 60 * 60));
  
  // เลือกเฉพาะกฎที่ตรงกับประเภทรถ ประเภทบริการ และยังเปิดใช้งานอยู่
  const relevantRules = pricingRules
    .filter(r => r.vehicleType === vehicleType && r.serviceType === serviceType && r.status === 'active')
    .sort((a, b) => a.hourStart - b.hourStart);

  let totalAmount = 0;
  const appliedRules = [];
  const missingHours = [];
  
  for (let h = 1; h <= totalHours; h++) {
    // หากฎที่ครอบคลุมชั่วโมงปัจจุบัน
    const rule = relevantRules.find(r => h >= r.hourStart && (r.hourEnd === null || h <= r.hourEnd || r.hourEnd === 999));
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
        price: Number.isFinite(price) ? price : 0
      });
    } else {
      missingHours.push(h);
    }
  }

  return {
    totalHours,
    totalAmount,
    durationMs: diffMs,
    appliedRules,
    missingHours
  };
}

// Export Functions
module.exports = { calculateFee };
