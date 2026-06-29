// Import Require
const { toCameraTransactionDto } = require('../dto/transactions.dto');

// Function เพิ่ม error เมื่อ field ที่ต้องเป็น string ไม่มีค่า
function pushRequiredStringError(errors, payload, field) {
  if (payload[field] === undefined || payload[field] === null || typeof payload[field] !== 'string' || payload[field].trim() === '') {
    errors.push({ field, message: `${field} is required` });
  }
}

// Function validate payload จากกล้องก่อนแปลงเป็น DTO สำหรับสร้าง transaction
function validateCameraTransactionPayload(payload = {}) {
  const errors = [];

  pushRequiredStringError(errors, payload, 'plateNo');
  pushRequiredStringError(errors, payload, 'cameraId');
  pushRequiredStringError(errors, payload, 'gateId');
  pushRequiredStringError(errors, payload, 'direction');

  // ตรวจสอบ direction ต้องเป็น IN หรือ OUT
  if (typeof payload.direction === 'string' && payload.direction.trim() && !['IN', 'OUT'].includes(payload.direction.trim().toUpperCase())) {
    errors.push({ field: 'direction', message: 'direction must be IN or OUT' });
  }

  // ตรวจสอบ vehicleType ต้องเป็น car หรือ motorcycle
  if (
    payload.vehicleType !== undefined &&
    payload.vehicleType !== null &&
    (!['car', 'motorcycle'].includes(String(payload.vehicleType).trim().toLowerCase()))
  ) {
    errors.push({ field: 'vehicleType', message: 'vehicleType must be car or motorcycle' });
  }

  // ตรวจสอบ capturedAt ต้องเป็น datetime ที่ถูกต้อง
  if (payload.capturedAt !== undefined && payload.capturedAt !== null && Number.isNaN(new Date(payload.capturedAt).getTime())) {
    errors.push({ field: 'capturedAt', message: 'capturedAt must be a valid date time' });
  }

  // ตรวจสอบ imageUrl ต้องเป็น string
  if (payload.imageUrl !== undefined && payload.imageUrl !== null && typeof payload.imageUrl !== 'string') {
    errors.push({ field: 'imageUrl', message: 'imageUrl must be a string' });
  }

  // ถ้ามี error ให้ return valid false
  if (errors.length) return { valid: false, errors };

  return {
    valid: true,
    dto: toCameraTransactionDto(payload),
  };
}

// Export Functions
module.exports = {
  validateCameraTransactionPayload,
};