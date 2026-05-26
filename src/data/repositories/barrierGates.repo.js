// Import Require
const crypto = require('crypto');
const { getConfig, getConfigWithMeta, setConfig, updateConfig } = require('./config.repo');
const {
  activateRegisteredDevice,
  getDevicesConfig,
  getPendingActivationDeviceByCode,
  updateRegisteredDeviceHeartbeat,
} = require('./devices.repo');

// ค่าคงที่สำหรับเก็บ Config ของ Barrier Gate และกำหนดเงื่อนไขเวลา Offline / Activation Code
const CONFIG_KEY = 'barrier_gates';
const OFFLINE_AFTER_MINUTES = 5;
const ACTIVATION_TTL_MS = 10 * 60 * 1000;
const activationCodes = new Map();

// Function ลบ Activation Code ที่หมดอายุออกจากหน่วยความจำ
function cleanupExpiredActivationCodes() {
  const now = new Date();
  activationCodes.forEach((data, code) => {
    if (data.expiresAt < now) activationCodes.delete(code);
  });
}

// Function สร้าง activation code แบบสุ่มและกันเลขซ้ำใน memory ระหว่างรอ activate
function createActivationCode() {
  let code;
  do {
    code = crypto.randomInt(100000, 1000000).toString();
  } while (activationCodes.has(code));
  return code;
}

// Function ดึง Config ของ Barrier Gate และรับประกันว่า barrierGates จะเป็น Array เสมอ
async function getBarrierGatesConfig() {
  const config = await getConfig(CONFIG_KEY, { barrierGates: [] });
  return {
    ...config,
    barrierGates: Array.isArray(config.barrierGates) ? config.barrierGates : [],
  };
}

// Function ดึง Config ของ Barrier Gate สำหรับ admin update
async function getBarrierGatesConfigWithMeta() {
  const config = await getConfigWithMeta(CONFIG_KEY, { barrierGates: [] });
  return {
    ...config,
    barrierGates: Array.isArray(config.barrierGates) ? config.barrierGates : [],
  };
}

// Function บันทึกรายการ Barrier Gate ทั้งหมดกลับเข้า Config
async function saveBarrierGates(barrierGates) {
  return setConfig(CONFIG_KEY, { barrierGates });
}

// Function คำนวณสถานะใช้งานจริงของ Barrier Gate จากค่า status และเวลา lastSeen
function getBarrierGateRuntimeStatus(barrierGate) {
  if (!barrierGate) return null;
  if (barrierGate.status === 'maintenance') return 'maintenance';

  const lastSeen = new Date(barrierGate.lastSeen);
  if (Number.isNaN(lastSeen.getTime())) return 'offline';

  const diffMinutes = Math.floor((new Date() - lastSeen) / 60000);
  return diffMinutes > OFFLINE_AFTER_MINUTES ? 'offline' : 'online';
}

// Function เพิ่มสถานะ Runtime ล่าสุดเข้าไปในข้อมูล Barrier Gate ก่อนส่งออก
function withRuntimeStatus(barrierGate) {
  if (!barrierGate) return null;
  return {
    ...barrierGate,
    status: getBarrierGateRuntimeStatus(barrierGate),
  };
}

// Function ค้นหา Barrier Gate จาก deviceId และคืนค่าพร้อมสถานะ Runtime
async function searchBarrierGate(deviceId) {
  if (!deviceId) return null;
  const { barrierGates } = await getBarrierGatesConfig();
  return withRuntimeStatus(barrierGates.find((barrierGate) => barrierGate.deviceId === deviceId) || null);
}

// Function สร้าง Activation Code สำหรับลงทะเบียน Barrier Gate ใหม่ พร้อมกำหนดวันหมดอายุ
async function generateBarrierGateActivationCode(details = {}) {
  cleanupExpiredActivationCodes();
  const [{ barrierGates }, devicesConfig] = await Promise.all([
    getBarrierGatesConfig(),
    getDevicesConfig(),
  ]);
  const code = createActivationCode();
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const deviceCount = (devicesConfig.devices || []).filter((device) => device.deviceType === 'barrier_gate').length;
  const count = (Math.max(barrierGates.length, deviceCount) + activationCodes.size + 1).toString().padStart(3, '0');
  const generatedId = `BG-${dateStr}-${count}`;
  const expiresAt = new Date(Date.now() + ACTIVATION_TTL_MS);

  activationCodes.set(code, {
    ...details,
    name: details.deviceName || details.name,
    deviceId: generatedId,
    expiresAt,
  });

  return { code, deviceId: generatedId, deviceType: 'barrier_gate', expiresAt: expiresAt.toISOString() };
}

// Function เปิดใช้งาน Barrier Gate ด้วย Activation Code และบันทึกเป็น Registered Device
async function activateBarrierGate(code) {
  const normalizedCode = code === undefined || code === null ? '' : String(code).trim();
  if (!normalizedCode) return { success: false, message: 'Invalid or expired code' };

  cleanupExpiredActivationCodes();
  let data = activationCodes.get(normalizedCode);

  if (!data) {
    const pending = await getPendingActivationDeviceByCode(normalizedCode, 'barrier_gate');
    if (pending) {
      data = {
        deviceId: pending.id,
        name: pending.deviceName,
        location: pending.location,
        expiresAt: pending.activationExpiresAt ? new Date(pending.activationExpiresAt) : null,
      };
    }
  }

  if (!data) return { success: false, message: 'Invalid or expired code' };
  if (data.expiresAt && data.expiresAt < new Date()) {
    activationCodes.delete(normalizedCode);
    return { success: false, message: 'Code expired' };
  }

  const registered = await activateRegisteredDevice(data.deviceId, {
    name: data.name,
    location: data.location,
  });
  if (!registered?.deviceToken) {
    return { success: false, message: 'Registered device is missing or expired' };
  }

  const barrierGate = await updateBarrierGateStatus(data.deviceId, {
    name: data.name,
    location: data.location,
  });

  activationCodes.delete(normalizedCode);
  return {
    success: true,
    message: 'Barrier Gate activation successful',
    deviceToken: registered?.deviceToken,
    deviceId: registered.device.deviceId,
    deviceType: registered.device.deviceType,
    deviceName: registered.device.deviceName,
    location: registered.device.location,
    status: registered.device.status,
  };
}

// Function แก้ไขข้อมูล Barrier Gate ตาม deviceId เช่น name, location, ip
async function editBarrierGate(deviceId, details = {}) {
  const { barrierGates } = await getBarrierGatesConfig();
  const index = barrierGates.findIndex((barrierGate) => barrierGate.deviceId === deviceId);
  if (index === -1) return { success: false, message: 'Barrier Gate not found' };

  barrierGates[index] = {
    ...barrierGates[index],
    ...details,
    deviceId,
  };
  const saved = await saveBarrierGates(barrierGates);

  return {
    success: true,
    barrierGate: {
      ...withRuntimeStatus(barrierGates[index]),
      configUpdatedAt: saved.configUpdatedAt,
    },
  };
}

// Function ลบ Barrier Gate ออกจาก Config ตาม deviceId
async function deleteBarrierGate(deviceId) {
  const { barrierGates } = await getBarrierGatesConfig();
  const index = barrierGates.findIndex((barrierGate) => barrierGate.deviceId === deviceId);
  if (index === -1) return { success: false, message: 'Barrier Gate not found' };

  const [deleted] = barrierGates.splice(index, 1);
  const saved = await saveBarrierGates(barrierGates);
  return {
    success: true,
    message: 'Barrier Gate deleted',
    barrierGate: {
      ...deleted,
      configUpdatedAt: saved.configUpdatedAt,
    },
  };
}

// Function อัปเดต Heartbeat/สถานะของ Barrier Gate หรือสร้างข้อมูลใหม่เมื่อยังไม่เคยมี deviceId นี้
async function updateBarrierGateStatus(deviceId, details = {}) {
  const now = new Date().toISOString();
  let barrierGate;

  await updateConfig(CONFIG_KEY, (config = {}) => {
    const barrierGates = Array.isArray(config.barrierGates) ? [...config.barrierGates] : [];
    const index = barrierGates.findIndex((item) => item.deviceId === deviceId);

    if (index === -1) {
      barrierGate = {
        deviceId,
        deviceType: 'barrier_gate',
        name: details.name || `Barrier Gate ${deviceId}`,
        location: details.location || 'Unknown',
        ip: details.ip || '0.0.0.0',
        status: 'online',
        firstSeen: now,
        lastSeen: now,
      };
      barrierGates.push(barrierGate);
    } else {
      const previous = barrierGates[index];
      barrierGate = {
        ...previous,
        deviceType: 'barrier_gate',
        lastSeen: now,
        status: details.status || (previous.status === 'maintenance' ? 'maintenance' : 'online'),
        ...(details.name ? { name: details.name } : {}),
        ...(details.location ? { location: details.location } : {}),
        ...(details.ip ? { ip: details.ip } : {}),
      };
      barrierGates[index] = barrierGate;
    }

    return { ...config, barrierGates };
  }, { barrierGates: [] });

  await updateRegisteredDeviceHeartbeat(deviceId, {
    name: barrierGate.name,
    location: barrierGate.location,
    ip: barrierGate.ip,
  });
  return barrierGate;
}

// Function แสดงรายการ Barrier Gate ทั้งหมด พร้อมคำนวณสถานะ Runtime ล่าสุดให้แต่ละตัว
async function listAllBarrierGates() {
  const { barrierGates } = await getBarrierGatesConfig();
  return barrierGates.map(withRuntimeStatus);
}

// Function แสดงรายการ Barrier Gate ทั้งหมดพร้อมเวลาแก้ไขล่าสุดของ config
async function listAllBarrierGatesWithMeta() {
  const config = await getBarrierGatesConfigWithMeta();
  return {
    barrierGates: config.barrierGates.map(withRuntimeStatus),
    configUpdatedAt: config.configUpdatedAt,
  };
}

module.exports = {
  activateBarrierGate,
  deleteBarrierGate,
  editBarrierGate,
  generateBarrierGateActivationCode,
  getBarrierGateRuntimeStatus,
  listAllBarrierGates,
  listAllBarrierGatesWithMeta,
  searchBarrierGate,
  updateBarrierGateStatus,
};
