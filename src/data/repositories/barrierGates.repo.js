// Import Require
const crypto = require('crypto');
const { getConfig, getConfigWithMeta, setConfig, updateConfig } = require('./config.repo');
const {
  getDevicesConfig,
  getRegisteredDevice,
  getPendingActivationDeviceByCode,
} = require('./devices.repo');

// Config ของ Barrier Gate
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

// Function ดึง config ของ Barrier Gates โดย format ให้เป็น array เสมอ
async function getBarrierGatesConfig() {
  const config = await getConfig(CONFIG_KEY, { barrierGates: [] });
  return {
    ...config,
    barrierGates: Array.isArray(config.barrierGates) ? config.barrierGates : [],
  };
}

// Function ดึง config ของ Barrier Gates พร้อม metadata
async function getBarrierGatesConfigWithMeta() {
  const config = await getConfigWithMeta(CONFIG_KEY, { barrierGates: [] });
  return {
    ...config,
    barrierGates: Array.isArray(config.barrierGates) ? config.barrierGates : [],
  };
}

// Function บันทึกรายการ Barrier Gate ลง Config
async function saveBarrierGates(barrierGates) {
  return setConfig(CONFIG_KEY, { barrierGates });
}

function findBarrierGateIndex(barrierGates, deviceId) {
  return barrierGates.findIndex((barrierGate) => barrierGate.deviceId === deviceId);
}

function normalizeDirection(direction) {
  const value = String(direction || '').trim().toUpperCase();
  return ['IN', 'OUT'].includes(value) ? value : null;
}

function normalizeCameraIds(cameraIds) {
  if (!Array.isArray(cameraIds)) return [];
  return [...new Set(cameraIds.map((cameraId) => String(cameraId || '').trim()).filter(Boolean))];
}

// Function คำนวณ runtime status ของ Barrier Gate จาก status และ lastSeen
function getBarrierGateRuntimeStatus(barrierGate) {
  if (!barrierGate) return null;
  if (barrierGate.status === 'maintenance') return 'maintenance';

  const lastSeen = new Date(barrierGate.lastSeen);
  if (Number.isNaN(lastSeen.getTime())) return 'offline';

  const diffMinutes = Math.floor((new Date() - lastSeen) / 60000);
  return diffMinutes > OFFLINE_AFTER_MINUTES ? 'offline' : 'online';
}

// Function เพิ่ม runtime status ให้กับข้อมูล Barrier Gate
function withRuntimeStatus(barrierGate) {
  if (!barrierGate) return null;
  return {
    ...barrierGate,
    status: getBarrierGateRuntimeStatus(barrierGate),
  };
}

// Function ค้นหา Barrier Gate ตาม deviceId และเพิ่ม runtime status
async function searchBarrierGate(deviceId) {
  if (!deviceId) return null;
  const { barrierGates } = await getBarrierGatesConfig();
  return withRuntimeStatus(barrierGates.find((barrierGate) => barrierGate.deviceId === deviceId) || null);
}

async function getBarrierGate(deviceId) {
  return searchBarrierGate(deviceId);
}

// Function สร้าง Activation Code และ deviceId สำหรับ Barrier Gate
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
async function resolveBarrierGateActivationCode(code) {
  const normalizedCode = code === undefined || code === null ? '' : String(code).trim();
  if (!normalizedCode) return null;

  cleanupExpiredActivationCodes();
  let data = activationCodes.get(normalizedCode);

  if (!data) {
    const pending = await getPendingActivationDeviceByCode(normalizedCode, 'barrier_gate');
    if (pending) {
      data = {
        deviceId: pending.id,
        name: pending.deviceName,
        location: pending.location,
        gateId: pending.gateId,
        direction: pending.direction,
        cameraIds: normalizeCameraIds(pending.cameraIds),
        expiresAt: pending.activationExpiresAt ? new Date(pending.activationExpiresAt) : null,
      };
    }
  }

  if (!data) return null;
  if (data.expiresAt && data.expiresAt < new Date()) {
    activationCodes.delete(normalizedCode);
    return null;
  }

  return { ...data, code: normalizedCode };
}

function deleteBarrierGateActivationCode(code) {
  if (!code) return;
  activationCodes.delete(String(code).trim());
}

// Function แก้ไขข้อมูล Barrier Gate ตาม deviceId เช่น name, location, ip
async function createBarrierGate(data = {}) {
  const deviceId = data.deviceId;
  if (!deviceId) return { success: false, message: 'deviceId is required' };

  const { barrierGates } = await getBarrierGatesConfig();
  const index = findBarrierGateIndex(barrierGates, deviceId);
  if (index !== -1) return { success: false, message: 'Barrier Gate already exists' };

  const now = new Date().toISOString();
  const barrierGate = {
    deviceId,
    deviceType: 'barrier_gate',
    name: data.name || data.deviceName || `Barrier Gate ${deviceId}`,
    location: data.location || 'Unknown',
    ip: data.ip || '0.0.0.0',
    gateId: data.gateId ? String(data.gateId).trim() : null,
    direction: normalizeDirection(data.direction),
    cameraIds: normalizeCameraIds(data.cameraIds),
    status: data.status || 'online',
    firstSeen: data.firstSeen || now,
    lastSeen: data.lastSeen || now,
  };

  const saved = await saveBarrierGates([...barrierGates, barrierGate]);
  return {
    success: true,
    barrierGate: {
      ...withRuntimeStatus(barrierGate),
      configUpdatedAt: saved.configUpdatedAt,
    },
  };
}

async function updateBarrierGate(deviceId, details = {}) {
  const { barrierGates } = await getBarrierGatesConfig();
  const index = findBarrierGateIndex(barrierGates, deviceId);
  if (index === -1) return { success: false, message: 'Barrier Gate not found' };

  barrierGates[index] = {
    ...barrierGates[index],
    ...details,
    direction: details.direction !== undefined ? normalizeDirection(details.direction) : barrierGates[index].direction || null,
    cameraIds: details.cameraIds !== undefined ? normalizeCameraIds(details.cameraIds) : normalizeCameraIds(barrierGates[index].cameraIds),
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

const editBarrierGate = updateBarrierGate;

// Function ลบ Barrier Gate ออกจาก Config ตาม deviceId
async function deleteBarrierGate(deviceId) {
  const { barrierGates } = await getBarrierGatesConfig();
  const index = findBarrierGateIndex(barrierGates, deviceId);
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
async function upsertBarrierGateHeartbeatRecord(deviceId, details = {}) {
  const now = new Date().toISOString();
  let barrierGate;

  await updateConfig(CONFIG_KEY, (config = {}) => {
    const barrierGates = Array.isArray(config.barrierGates) ? [...config.barrierGates] : [];
    const index = findBarrierGateIndex(barrierGates, deviceId);

    if (index === -1) {
      barrierGate = {
        deviceId,
        deviceType: 'barrier_gate',
        name: details.name || `Barrier Gate ${deviceId}`,
        location: details.location || 'Unknown',
        ip: details.ip || '0.0.0.0',
        gateId: details.gateId ? String(details.gateId).trim() : null,
        direction: normalizeDirection(details.direction),
        cameraIds: normalizeCameraIds(details.cameraIds),
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
        ...(details.gateId !== undefined ? { gateId: String(details.gateId || '').trim() || null } : {}),
        ...(details.direction !== undefined ? { direction: normalizeDirection(details.direction) } : {}),
        ...(details.cameraIds !== undefined ? { cameraIds: normalizeCameraIds(details.cameraIds) } : {}),
      };
      barrierGates[index] = barrierGate;
    }

    return { ...config, barrierGates };
  }, { barrierGates: [] });

  return barrierGate;
}

const updateBarrierGateStatus = upsertBarrierGateHeartbeatRecord;

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

async function findBarrierGateByCamera(cameraId, { gateId = null, direction = null } = {}) {
  const normalizedCameraId = String(cameraId || '').trim();
  if (!normalizedCameraId) return null;

  const { barrierGates } = await getBarrierGatesConfig();
  const normalizedGateId = gateId ? String(gateId).trim() : null;
  const normalizedDirection = normalizeDirection(direction);

  return barrierGates.find((barrierGate) => {
    const cameraIds = normalizeCameraIds(barrierGate.cameraIds);
    if (!cameraIds.includes(normalizedCameraId)) return false;
    if (normalizedGateId && barrierGate.gateId && barrierGate.gateId !== normalizedGateId) return false;
    if (normalizedDirection && barrierGate.direction && barrierGate.direction !== normalizedDirection) return false;
    return true;
  }) || null;
}

async function validateCameraGateBinding({ cameraId, gateId, direction } = {}) {
  const normalizedCameraId = String(cameraId || '').trim();
  if (!normalizedCameraId) {
    return { ok: false, statusCode: 400, reason: 'cameraId_required', message: 'cameraId is required' };
  }

  const camera = await getRegisteredDevice(normalizedCameraId);
  if (!camera || camera.deviceType !== 'camera') {
    return { ok: false, statusCode: 400, reason: 'camera_not_registered', message: 'cameraId is not an activated camera device' };
  }
  if (!['active', 'offline'].includes(camera.status)) {
    return { ok: false, statusCode: 403, reason: 'camera_inactive', message: 'Camera device is not active' };
  }

  const barrierGate = await findBarrierGateByCamera(normalizedCameraId, { gateId, direction });
  if (!barrierGate) {
    return { ok: false, statusCode: 400, reason: 'camera_gate_mismatch', message: 'cameraId is not mapped to this gateId and direction' };
  }

  return { ok: true, camera, barrierGate };
}

module.exports = {
  createBarrierGate,
  deleteBarrierGateActivationCode,
  deleteBarrierGate,
  editBarrierGate,
  generateBarrierGateActivationCode,
  findBarrierGateByCamera,
  getBarrierGate,
  getBarrierGateRuntimeStatus,
  listAllBarrierGates,
  listAllBarrierGatesWithMeta,
  resolveBarrierGateActivationCode,
  searchBarrierGate,
  updateBarrierGate,
  updateBarrierGateStatus,
  upsertBarrierGateHeartbeatRecord,
  validateCameraGateBinding,
};
