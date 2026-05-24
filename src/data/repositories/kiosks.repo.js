// Import Require
const crypto = require('crypto');
const { getConfig, getConfigWithMeta, setConfig, updateConfig } = require('./config.repo');
const {
  activateRegisteredDevice,
  getPendingActivationDeviceByCode,
  updateRegisteredDeviceHeartbeat,
} = require('./devices.repo');

// Constant key สำหรับอ้างอิง config kiosks ใน table app_config
const CONFIG_KEY = 'kiosks';
const OFFLINE_AFTER_MINUTES = 5;
const ACTIVATION_TTL_MS = 10 * 60 * 1000;
// Constant เก็บ activation code ชั่วคราวใน memory ระหว่างรอ kiosk activate
const activationCodes = new Map();

// Function ลบ activation code ของ kiosk ที่หมดอายุออกจาก memory
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

// Function query config ของ kiosks จาก database และทำให้ kiosks เป็น array เสมอ
async function getKiosksConfig() {
  const config = await getConfig(CONFIG_KEY, { kiosks: [] });
  return {
    ...config,
    kiosks: Array.isArray(config.kiosks) ? config.kiosks : [],
  };
}

// Function query config ของ kiosks พร้อม version สำหรับ admin update
async function getKiosksConfigWithMeta() {
  const config = await getConfigWithMeta(CONFIG_KEY, { kiosks: [] });
  return {
    ...config,
    kiosks: Array.isArray(config.kiosks) ? config.kiosks : [],
  };
}

// Function save รายการ kiosks กลับเข้า app_config
async function saveKiosks(kiosks, expectedVersion) {
  return setConfig(CONFIG_KEY, { kiosks }, { expectedVersion });
}

// Function คำนวณสถานะ kiosk จาก lastSeen โดยไม่เขียนค่ากลับ database
function getKioskRuntimeStatus(kiosk) {
  if (!kiosk) return null;
  if (kiosk.status === 'maintenance') return 'maintenance';

  const lastSeen = new Date(kiosk.lastSeen);
  if (Number.isNaN(lastSeen.getTime())) return 'offline';

  const diffMinutes = Math.floor((new Date() - lastSeen) / 60000);
  return diffMinutes > OFFLINE_AFTER_MINUTES ? 'offline' : 'online';
}

// Function เพิ่มสถานะ runtime ล่าสุดเข้าไปในข้อมูล kiosk ก่อนส่ง response
function withRuntimeStatus(kiosk) {
  if (!kiosk) return null;
  return {
    ...kiosk,
    status: getKioskRuntimeStatus(kiosk),
  };
}

// Function search kiosk ด้วย deviceId
async function searchKiosk(deviceId) {
  if (!deviceId) return null;
  const { kiosks } = await getKiosksConfig();
  return withRuntimeStatus(kiosks.find((kiosk) => kiosk.deviceId === deviceId) || null);
}

// Function create activation code สำหรับผูก kiosk ใหม่
async function generateActivationCode(details = {}) {
  cleanupExpiredActivationCodes();
  const { kiosks } = await getKiosksConfig();
  const code = createActivationCode();
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const count = (kiosks.length + activationCodes.size + 1).toString().padStart(3, '0');
  const generatedId = `K-${dateStr}-${count}`;
  const expiresAt = new Date(Date.now() + ACTIVATION_TTL_MS);

  activationCodes.set(code, {
    ...details,
    deviceId: generatedId,
    expiresAt,
  });

  return { code, deviceId: generatedId, deviceType: 'kiosk', expiresAt: expiresAt.toISOString() };
}

// Function activate kiosk ด้วย activation code ที่ยังไม่หมดอายุ
async function activateKiosk(code) {
  const normalizedCode = code === undefined || code === null ? '' : String(code).trim();
  if (!normalizedCode) return { success: false, message: 'Invalid or expired code' };

  cleanupExpiredActivationCodes();
  let data = activationCodes.get(normalizedCode);

  if (!data) {
    const pending = await getPendingActivationDeviceByCode(normalizedCode, 'kiosk');
    if (pending) {
      data = {
        deviceId: pending.id,
        name: pending.deviceName,
        location: pending.location,
        version: pending.version,
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
    version: data.version || '1.0.0',
  });
  if (!registered?.deviceToken) {
    return { success: false, message: 'Registered device is missing or expired' };
  }

  const kiosk = await updateKioskStatus(data.deviceId, {
    name: data.name,
    location: data.location,
    version: data.version || '1.0.0',
  });

  activationCodes.delete(normalizedCode);
  return {
    success: true,
    message: 'Activation successful',
    deviceId: data.deviceId,
    deviceType: 'kiosk',
    deviceToken: registered?.deviceToken,
    kiosk,
  };
}

// Function edit ข้อมูล kiosk ด้วย deviceId
async function editKiosk(deviceId, details = {}, expectedVersion) {
  const { kiosks } = await getKiosksConfig();
  const index = kiosks.findIndex((kiosk) => kiosk.deviceId === deviceId);
  if (index === -1) return { success: false, message: 'Kiosk not found' };

  kiosks[index] = {
    ...kiosks[index],
    ...details,
    deviceId,
  };
  const saved = await saveKiosks(kiosks, expectedVersion);

  return { success: true, kiosk: { ...kiosks[index], version: saved.version, configUpdatedAt: saved.configUpdatedAt } };
}

// Function delete kiosk ด้วย deviceId
async function deleteKiosk(deviceId, expectedVersion) {
  const { kiosks } = await getKiosksConfig();
  const index = kiosks.findIndex((kiosk) => kiosk.deviceId === deviceId);
  if (index === -1) return { success: false, message: 'Kiosk not found' };

  const [deleted] = kiosks.splice(index, 1);
  const saved = await saveKiosks(kiosks, expectedVersion);
  return { success: true, message: 'Kiosk deleted', kiosk: { ...deleted, version: saved.version, configUpdatedAt: saved.configUpdatedAt } };
}

// Function update สถานะ kiosk หรือ create kiosk ใหม่ถ้ายังไม่มีในระบบ
async function updateKioskStatus(deviceId, details = {}) {
  const now = new Date().toISOString();
  let kiosk;

  await updateConfig(CONFIG_KEY, (config = {}) => {
    const kiosks = Array.isArray(config.kiosks) ? [...config.kiosks] : [];
    const index = kiosks.findIndex((item) => item.deviceId === deviceId);

    if (index === -1) {
      kiosk = {
        deviceId,
        name: details.name || `Kiosk ${deviceId}`,
        location: details.location || 'Unknown',
        ip: details.ip || '0.0.0.0',
        version: details.version || '1.0.0',
        status: 'online',
        firstSeen: now,
        lastSeen: now,
      };
      kiosks.push(kiosk);
    } else {
      const previous = kiosks[index];
      kiosk = {
        ...previous,
        lastSeen: now,
        status: details.status || (previous.status === 'maintenance' ? 'maintenance' : 'online'),
        ...(details.name ? { name: details.name } : {}),
        ...(details.location ? { location: details.location } : {}),
        ...(details.ip ? { ip: details.ip } : {}),
        ...(details.version ? { version: details.version } : {}),
      };
      kiosks[index] = kiosk;
    }

    return { ...config, kiosks };
  }, { kiosks: [] });

  await updateRegisteredDeviceHeartbeat(deviceId, {
    name: kiosk.name,
    location: kiosk.location,
    ip: kiosk.ip,
    version: kiosk.version,
  });
  return kiosk;
}

// Function query kiosk ทั้งหมดและคำนวณสถานะ online/offline จาก lastSeen
async function listAllKiosks() {
  const { kiosks } = await getKiosksConfig();
  return kiosks.map(withRuntimeStatus);
}

// Function query kiosk ทั้งหมดพร้อม version ของ config
async function listAllKiosksWithMeta() {
  const config = await getKiosksConfigWithMeta();
  return {
    kiosks: config.kiosks.map(withRuntimeStatus),
    version: config.version,
    configUpdatedAt: config.configUpdatedAt,
  };
}

// Export Functions
module.exports = {
  activateKiosk,
  deleteKiosk,
  editKiosk,
  searchKiosk,
  generateActivationCode,
  getKioskRuntimeStatus,
  listAllKiosks,
  listAllKiosksWithMeta,
  updateKioskStatus,
};
