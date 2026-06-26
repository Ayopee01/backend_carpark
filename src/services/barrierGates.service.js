// Import Function สำหรับจัดการ Activation Code และ Heartbeat ของ Barrier Gate
const {
  deleteBarrierGateActivationCode,
  resolveBarrierGateActivationCode,
  upsertBarrierGateHeartbeatRecord,
} = require('../data/repositories/barrierGates.repo');

// Import Function สำหรับจัดการ Device ที่ลงทะเบียนในระบบ
const {
  activateRegisteredDevice,
  updateRegisteredDeviceHeartbeat,
} = require('../data/repositories/devices.repo');

// Function บันทึกหรืออัปเดต Heartbeat ล่าสุดของ Barrier Gate
async function upsertBarrierGateHeartbeat(deviceId, details = {}) {
  // บันทึกหรืออัปเดตข้อมูล Heartbeat ของ Barrier Gate
  const barrierGate = await upsertBarrierGateHeartbeatRecord(deviceId, details);

  // อัปเดต Heartbeat ของ Device กลางให้ข้อมูลตรงกับ Barrier Gate ล่าสุด
  await updateRegisteredDeviceHeartbeat(deviceId, {
    name: barrierGate.name,
    location: barrierGate.location,
    ip: barrierGate.ip,
  });

  // คืนค่าข้อมูล Barrier Gate หลังจากอัปเดต Heartbeat
  return barrierGate;
}

// Function Activate Barrier Gate ด้วย Activation Code
async function activateBarrierGate(code) {
  // ตรวจสอบและดึงข้อมูล Activation Code ที่ยังใช้งานได้
  const data = await resolveBarrierGateActivationCode(code);

  // ถ้าไม่พบ code หรือ code หมดอายุ ให้แจ้งว่าไม่สามารถ activate ได้
  if (!data) return { success: false, message: 'Invalid or expired code' };

  // Activate Device ที่ลงทะเบียนไว้ และสร้าง deviceToken สำหรับอุปกรณ์
  const registered = await activateRegisteredDevice(data.deviceId, {
    name: data.name,
    location: data.location,
    gateId: data.gateId,
    direction: data.direction,
    cameraIds: data.cameraIds,
  });

  // ถ้าไม่พบ deviceToken แสดงว่า device ไม่พร้อมใช้งานหรือข้อมูลหมดอายุ
  if (!registered?.deviceToken) {
    return { success: false, message: 'Registered device is missing or expired' };
  }

  // บันทึก Heartbeat แรกหลังจาก Activate สำเร็จ
  await upsertBarrierGateHeartbeat(data.deviceId, {
    name: data.name,
    location: data.location,
    gateId: data.gateId,
    direction: data.direction,
    cameraIds: data.cameraIds,
  });

  // ลบ Activation Code หลังใช้งานสำเร็จ เพื่อป้องกันการใช้ซ้ำ
  deleteBarrierGateActivationCode(data.code);

  // ส่งข้อมูล Device และ Token กลับไปให้ Barrier Gate ใช้งานต่อ
  return {
    success: true,
    message: 'Barrier Gate activation successful',
    deviceToken: registered.deviceToken,
    deviceId: registered.device.deviceId,
    deviceType: registered.device.deviceType,
    deviceName: registered.device.deviceName,
    location: registered.device.location,
    gateId: registered.device.gateId || null,
    direction: registered.device.direction || null,
    cameraIds: registered.device.cameraIds || [],
    status: registered.device.status,
  };
}

// Export Function
module.exports = {
  activateBarrierGate,
  upsertBarrierGateHeartbeat,
};
