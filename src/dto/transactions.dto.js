// DTO normalize camera transaction payload before sending it to the service layer.
// Function normalize ทะเบียนรถจาก payload ของกล้อง
function normalizePlateNo(plateNo) {
  return plateNo ? String(plateNo).trim().replace(/[\s-]/g, '') : '';
}

// Function normalize ประเภทรถจาก payload ของกล้อง
function normalizeVehicleType(vehicleType) {
  return vehicleType ? String(vehicleType).trim().toLowerCase() : 'car';
}

// Function แปลง raw payload จากกล้องให้เป็น DTO ที่ service ใช้งานได้ตรงรูปแบบ
function toCameraTransactionDto(payload = {}) {
  return {
    plateNo: normalizePlateNo(payload.plateNo),
    vehicleType: normalizeVehicleType(payload.vehicleType),
    cameraId: String(payload.cameraId).trim(),
    gateId: String(payload.gateId).trim(),
    direction: String(payload.direction).trim().toUpperCase(),
    capturedAt: payload.capturedAt ? new Date(payload.capturedAt) : new Date(),
    confidence: payload.confidence === undefined || payload.confidence === null
      ? undefined
      : Number(payload.confidence),
    imageUrl: payload.imageUrl === undefined || payload.imageUrl === null
      ? undefined
      : String(payload.imageUrl).trim(),
  };
}

module.exports = {
  normalizePlateNo,
  normalizeVehicleType,
  toCameraTransactionDto,
};
