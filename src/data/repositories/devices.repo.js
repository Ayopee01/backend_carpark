// Import Require
const crypto = require('crypto');
const defaults = require('../defaults');
const { createId } = require('../store');
const { getConfig, getConfigWithMeta, setConfig, updateConfig } = require('./config.repo');
const { hashToken } = require('../../utils/auth');

// Constant key สำหรับอ้างอิง devices config ใน table app_config
const CONFIG_KEY = 'devices';
const OFFLINE_AFTER_MINUTES = 5;
const ACTIVATION_DEVICE_TYPES = new Set(['kiosk', 'barrier_gate', 'camera', 'printer']);
const appEvents = require('../../utils/events');

// Function สร้าง device token แบบสุ่มเพื่อใช้ยืนยันตัวตนของ kiosk/barrier gate
function createDeviceToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Function เปรียบเทียบ hash แบบ timing-safe เพื่อใช้ตรวจ device token
function timingSafeStringEqual(actual, expected) {
  const actualBuffer = Buffer.from(String(actual || ''));
  const expectedBuffer = Buffer.from(String(expected || ''));
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

// Function ตรวจสอบว่า device เป็นอุปกรณ์ที่ต้อง activate ก่อนใช้งานหรือไม่
function isActivationDevice(device) {
  return ACTIVATION_DEVICE_TYPES.has(device?.deviceType);
}

// Function ตรวจสอบวันหมดอายุของค่าเวลา เช่น activationExpiresAt
function isExpired(value, now = new Date()) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date < now;
}

// Function ตรวจสอบว่าอุปกรณ์ offline จาก lastSeen เกินเวลาที่กำหนดหรือไม่
function isOfflineByLastSeen(lastSeen, now = new Date()) {
  if (!lastSeen) return true;
  const date = new Date(lastSeen);
  if (Number.isNaN(date.getTime())) return true;
  return now - date > OFFLINE_AFTER_MINUTES * 60000;
}

// Function ลบค่า token hash ออกจากข้อมูล device ก่อนส่งออก response
function toSafeDevice(device) {
  if (!device) return null;
  const safe = { ...device };
  delete safe.deviceTokenHash;
  return safe;
}

// Function ลบค่า token hash ออกจาก config ก่อนส่งออก response
function toSafeConfig(config) {
  return {
    ...config,
    devices: (Array.isArray(config.devices) ? config.devices : []).map(toSafeDevice),
  };
}

function normalizeDirection(direction) {
  const value = String(direction || '').trim().toUpperCase();
  return ['IN', 'OUT'].includes(value) ? value : null;
}

function normalizeDeviceIds(deviceIds) {
  if (!Array.isArray(deviceIds)) return [];
  return [...new Set(deviceIds.map((deviceId) => String(deviceId || '').trim()).filter(Boolean))];
}

function normalizeCameraIds(cameraIds) {
  return normalizeDeviceIds(cameraIds);
}

function normalizePrinterIds(printerIds) {
  return normalizeDeviceIds(printerIds);
}

// Function เพิ่ม summary online/offline ให้ config devices
function withSummary(config) {
  const devices = Array.isArray(config.devices) ? config.devices : [];
  const totalDevices = devices.length;
  const online = devices.filter((device) => device.isOnline).length;

  return {
    ...config,
    summary: {
      totalDevices,
      online,
      offline: totalDevices - online
    },
    devices
  };
}

// Function query devices config จาก database
async function getDevicesConfig() {
  return refreshDeviceRuntimeState();
}

// Function query devices config สำหรับ admin update
async function getDevicesConfigWithMeta() {
  await refreshDeviceRuntimeState();
  return withSummary(await getConfigWithMeta(CONFIG_KEY, defaults.devices));
}

// Function refresh สถานะ runtime ของ devices เช่น pending หมดอายุ หรือ active ที่ offline แล้ว
async function refreshDeviceRuntimeState({ emitEvents = false } = {}) {
  const now = new Date();
  let events = [];

  const saved = await updateConfig(CONFIG_KEY, (config = defaults.devices) => {
    let changed = false;
    events = [];

    const devices = (Array.isArray(config.devices) ? config.devices : [])
      .filter((device) => {
        const shouldRemove = device.status === 'pending_activation' && isExpired(device.activationExpiresAt, now);
        if (shouldRemove) {
          changed = true;
          events.push({
            type: 'device_activation_expired',
            deviceId: device.deviceId,
            id: device.id,
            deviceCode: device.deviceCode,
            deviceType: device.deviceType,
            deviceName: device.deviceName,
            status: 'expired',
            isOnline: false,
          });
        }
        return !shouldRemove;
      })
      .map((device) => {
        if (
          isActivationDevice(device) &&
          device.status === 'active' &&
          device.isOnline &&
          isOfflineByLastSeen(device.lastSeen, now)
        ) {
          changed = true;
          events.push({
            type: 'device_status_changed',
            deviceId: device.deviceId,
            id: device.id,
            deviceCode: device.deviceCode,
            deviceType: device.deviceType,
            deviceName: device.deviceName,
            previousStatus: device.status,
            status: 'offline',
            isOnline: false,
            lastSeen: device.lastSeen,
          });
          return {
            ...device,
            isOnline: false,
            status: 'offline',
          };
        }
        return device;
      });

    if (!changed) {
      return undefined;
    }

    return withSummary({ ...config, devices });
  }, defaults.devices);

  const refreshed = withSummary(saved);
  if (events.length && emitEvents) {
    events.forEach((event) => appEvents.emit('device_event', event));
    appEvents.emit('devices_config_updated', toSafeConfig(refreshed));
  }
  return refreshed;
}

// Function create device ใหม่
async function createDevice(payload = {}) {
  const config = await getDevicesConfig();
  const {
    deviceCode,
    deviceName,
    deviceType,
    connectionType,
    ipAddress,
    status,
    isOnline,
    note
  } = payload;

  if (config.devices.some((device) => device.deviceCode === deviceCode)) {
    return { ok: false, reason: 'duplicate' };
  }

  const device = {
    id: createId('d'),
    deviceCode,
    deviceName,
    deviceType,
    connectionType: connectionType || 'lan',
    ipAddress: ipAddress || null,
    status: status || 'active',
    isOnline: Boolean(isOnline),
    note: note || ''
  };
  const configWithDevice = withSummary({ ...config, devices: [...config.devices, device] });
  const saved = await setConfig(CONFIG_KEY, configWithDevice);
  appEvents.emit('device_event', {
    type: 'device_created',
    deviceId: device.deviceId,
    id: device.id,
    deviceCode: device.deviceCode,
    deviceType: device.deviceType,
    deviceName: device.deviceName,
    status: device.status,
    isOnline: device.isOnline,
    activationExpiresAt: device.activationExpiresAt,
  });
  appEvents.emit('devices_config_updated', toSafeConfig(withSummary(saved)));

  return { ok: true, device: toSafeDevice(device), config: toSafeConfig(withSummary(saved)) };
}

// Function สร้าง device สถานะ pending_activation เพื่อรอ Kiosk/Barrier Gate activate ด้วย code
async function createPendingActivationDevice(payload = {}) {
  const config = await getDevicesConfig();
  const {
    generatedDeviceId,
    activationCode,
    activationExpiresAt,
    deviceCode,
    deviceName,
    name,
    deviceType,
    connectionType,
    location,
    gateId,
    direction,
    cameraIds,
    cameraRole,
    printerIds,
    printerRole,
    note
  } = payload;

  if (!generatedDeviceId) throw new Error('generatedDeviceId is required');
  if (!deviceType) throw new Error('deviceType is required');

  const pendingCode = deviceCode || generatedDeviceId;
  if (config.devices.some((device) => device.deviceCode === pendingCode || device.id === generatedDeviceId)) {
    return { ok: false, reason: 'duplicate' };
  }

  const device = {
    id: generatedDeviceId,
    deviceId: null,
    activationCode,
    activationExpiresAt,
    deviceCode: pendingCode,
    deviceName: deviceName || name || generatedDeviceId,
    deviceType,
    connectionType: connectionType || 'lan',
    ipAddress: null,
    location: location || null,
    gateId: gateId ? String(gateId).trim() : null,
    direction: normalizeDirection(direction),
    cameraIds: normalizeCameraIds(cameraIds),
    cameraRole: cameraRole ? String(cameraRole).trim() : null,
    printerIds: normalizePrinterIds(printerIds),
    printerRole: printerRole ? String(printerRole).trim() : null,
    status: 'pending_activation',
    isOnline: false,
    note: note || 'Waiting for activation'
  };
  const configWithDevice = withSummary({ ...config, devices: [...config.devices, device] });
  const saved = await setConfig(CONFIG_KEY, configWithDevice);

  return { ok: true, device: toSafeDevice(device), config: toSafeConfig(withSummary(saved)) };
}

// Function เปลี่ยน device ที่รอ activate ให้เป็น active หลังอุปกรณ์ยืนยัน activation สำเร็จ
async function provisionCredentialedDevice(deviceType, payload = {}) {
  const config = await getDevicesConfig();
  const devicesOfType = (config.devices || []).filter((device) => device.deviceType === deviceType);
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = deviceType === 'printer' ? 'PRN' : 'CAM';
  const generatedDeviceId = payload.deviceId || payload.deviceCode || `${prefix}-${dateStr}-${(devicesOfType.length + 1).toString().padStart(3, '0')}`;
  const deviceCode = payload.deviceCode || generatedDeviceId;

  if ((config.devices || []).some((device) => (
    device.id === generatedDeviceId ||
    device.deviceId === generatedDeviceId ||
    device.deviceCode === deviceCode
  ))) {
    return { ok: false, reason: 'duplicate' };
  }

  const deviceToken = createDeviceToken();
  const now = new Date().toISOString();
  const device = {
    id: generatedDeviceId,
    deviceId: generatedDeviceId,
    deviceCode,
    deviceName: payload.deviceName || payload.name || generatedDeviceId,
    deviceType,
    connectionType: payload.connectionType || 'lan',
    ipAddress: payload.ipAddress || payload.ip || null,
    location: payload.location || null,
    gateId: payload.gateId ? String(payload.gateId).trim() : null,
    direction: normalizeDirection(payload.direction),
    cameraIds: [],
    cameraRole: deviceType === 'camera' ? (payload.cameraRole ? String(payload.cameraRole).trim() : 'lpr') : null,
    printerIds: [],
    printerRole: deviceType === 'printer' ? (payload.printerRole ? String(payload.printerRole).trim() : 'receipt') : null,
    status: 'active',
    isOnline: false,
    note: payload.note || `Provisioned ${deviceType} by admin`,
    deviceTokenHash: hashToken(deviceToken),
    deviceTokenIssuedAt: now,
    activatedAt: now,
    lastSeen: null,
  };

  const saved = await setConfig(CONFIG_KEY, withSummary({ ...config, devices: [...config.devices, device] }));
  appEvents.emit('device_event', {
    type: 'device_provisioned',
    deviceId: device.deviceId,
    id: device.id,
    deviceCode: device.deviceCode,
    deviceType: device.deviceType,
    deviceName: device.deviceName,
    status: device.status,
    isOnline: device.isOnline,
  });
  appEvents.emit('devices_config_updated', toSafeConfig(withSummary(saved)));

  return {
    ok: true,
    device: toSafeDevice(device),
    config: toSafeConfig(withSummary(saved)),
    deviceToken,
  };
}

async function provisionCameraDevice(payload = {}) {
  return provisionCredentialedDevice('camera', payload);
}

async function provisionPrinterDevice(payload = {}) {
  return provisionCredentialedDevice('printer', payload);
}

async function activateRegisteredDevice(generatedDeviceId, details = {}) {
  const deviceToken = createDeviceToken();
  let activatedDevice = null;
  const saved = await updateConfig(CONFIG_KEY, (config = defaults.devices) => {
    activatedDevice = null;

    const devices = [...(Array.isArray(config.devices) ? config.devices : [])];
    const index = devices.findIndex((device) => device.id === generatedDeviceId || device.deviceId === generatedDeviceId);
    if (index === -1) return undefined;

    const current = devices[index];
    if (!isActivationDevice(current) || current.status !== 'pending_activation' || isExpired(current.activationExpiresAt)) {
      return undefined;
    }

    activatedDevice = {
      ...current,
      deviceId: generatedDeviceId,
      activationCode: null,
      activationExpiresAt: null,
      deviceName: details.name || current.deviceName,
      location: details.location || current.location || null,
      gateId: details.gateId || current.gateId || null,
      direction: normalizeDirection(details.direction) || current.direction || null,
      cameraIds: details.cameraIds !== undefined ? normalizeCameraIds(details.cameraIds) : normalizeCameraIds(current.cameraIds),
      cameraRole: details.cameraRole || current.cameraRole || null,
      printerIds: details.printerIds !== undefined ? normalizePrinterIds(details.printerIds) : normalizePrinterIds(current.printerIds),
      printerRole: details.printerRole || current.printerRole || null,
      ipAddress: details.ip || details.ipAddress || current.ipAddress || null,
      status: 'active',
      isOnline: true,
      deviceTokenHash: hashToken(deviceToken),
      deviceTokenIssuedAt: new Date().toISOString(),
      activatedAt: details.activatedAt || new Date().toISOString(),
      lastSeen: details.lastSeen || new Date().toISOString(),
    };
    devices[index] = activatedDevice;

    return withSummary({ ...config, devices });
  }, defaults.devices);
  if (!activatedDevice) return null;

  appEvents.emit('device_event', {
    type: 'device_activated',
    deviceId: activatedDevice.deviceId,
    id: activatedDevice.id,
    deviceCode: activatedDevice.deviceCode,
    deviceType: activatedDevice.deviceType,
    deviceName: activatedDevice.deviceName,
    status: activatedDevice.status,
    isOnline: activatedDevice.isOnline,
    lastSeen: activatedDevice.lastSeen,
  });
  appEvents.emit('devices_config_updated', toSafeConfig(withSummary(saved)));
  return { device: toSafeDevice(activatedDevice), config: toSafeConfig(withSummary(saved)), deviceToken };
}

// Function ค้นหา registered device จาก deviceId หรือ internal id
async function getRegisteredDevice(deviceId) {
  if (!deviceId) return null;
  const config = await getDevicesConfig();
  return config.devices.find((device) => device.deviceId === deviceId || device.id === deviceId) || null;
}

// Function ค้นหา pending activation device จาก code ที่เก็บใน config เพื่อรองรับกรณี server restart
async function getPendingActivationDeviceByCode(code, deviceType = null) {
  if (!code) return null;
  const normalizedCode = String(code).trim();
  const config = await getDevicesConfig();
  return config.devices.find((device) => (
    device.status === 'pending_activation' &&
    String(device.activationCode || '').trim() === normalizedCode &&
    (!deviceType || device.deviceType === deviceType)
  )) || null;
}

// Function ตรวจสอบ device token ที่ส่งมาจาก kiosk/barrier gate
async function verifyRegisteredDeviceToken(deviceId, token, allowedTypes = []) {
  const device = await getRegisteredDevice(deviceId);
  if (!device) return { ok: false, reason: 'not_found' };
  if (allowedTypes.length && !allowedTypes.includes(device.deviceType)) {
    return { ok: false, reason: 'invalid_type', device };
  }
  if (!['active', 'offline', 'maintenance'].includes(device.status)) {
    return { ok: false, reason: 'inactive', device };
  }
  if (!device.deviceTokenHash || !token || !timingSafeStringEqual(hashToken(token), device.deviceTokenHash)) {
    return { ok: false, reason: 'invalid_token', device };
  }

  return { ok: true, device: toSafeDevice(device) };
}

// Function update heartbeat ของ registered device เพื่อบอกว่ายังออนไลน์และใช้งานอยู่
async function updateRegisteredDeviceHeartbeat(generatedDeviceId, details = {}) {
  let current = null;
  let updatedDevice = null;
  const saved = await updateConfig(CONFIG_KEY, (config = defaults.devices) => {
    const devices = [...(Array.isArray(config.devices) ? config.devices : [])];
    const index = devices.findIndex((device) => device.deviceId === generatedDeviceId || device.id === generatedDeviceId);
    if (index === -1) return undefined;

    current = devices[index];
    updatedDevice = {
      ...current,
      ipAddress: details.ip || details.ipAddress || current.ipAddress || null,
      location: details.location || current.location,
      deviceName: details.name || current.deviceName,
      gateId: details.gateId !== undefined ? String(details.gateId || '').trim() || null : current.gateId || null,
      direction: details.direction !== undefined ? normalizeDirection(details.direction) : current.direction || null,
      cameraIds: details.cameraIds !== undefined ? normalizeCameraIds(details.cameraIds) : normalizeCameraIds(current.cameraIds),
      cameraRole: details.cameraRole !== undefined ? String(details.cameraRole || '').trim() || null : current.cameraRole || null,
      printerIds: details.printerIds !== undefined ? normalizePrinterIds(details.printerIds) : normalizePrinterIds(current.printerIds),
      printerRole: details.printerRole !== undefined ? String(details.printerRole || '').trim() || null : current.printerRole || null,
      status: current.status === 'maintenance' ? 'maintenance' : 'active',
      isOnline: current.status === 'maintenance' ? current.isOnline : true,
      lastSeen: new Date().toISOString(),
    };
    devices[index] = updatedDevice;

    return withSummary({ ...config, devices });
  }, defaults.devices);
  if (!updatedDevice) return null;

  if (!current.isOnline || current.status === 'offline') {
    appEvents.emit('device_event', {
      type: 'device_status_changed',
      deviceId: updatedDevice.deviceId,
      id: updatedDevice.id,
      deviceCode: updatedDevice.deviceCode,
      deviceType: updatedDevice.deviceType,
      deviceName: updatedDevice.deviceName,
      previousStatus: current.status,
      status: updatedDevice.status,
      isOnline: updatedDevice.isOnline,
      lastSeen: updatedDevice.lastSeen,
    });
  }
  appEvents.emit('devices_config_updated', toSafeConfig(withSummary(saved)));
  return { device: toSafeDevice(updatedDevice), config: toSafeConfig(withSummary(saved)) };
}

function findDeviceIndex(devices, value) {
  return devices.findIndex((item) => item.id === value || item.deviceId === value || item.deviceCode === value);
}

// Function update device ด้วย id, deviceId, หรือ deviceCode
async function updateDevice(id, body = {}) {
  const config = await getDevicesConfig();
  const devices = [...config.devices];
  const index = findDeviceIndex(devices, id);
  if (index === -1) return null;

  const allowedFields = [
    'deviceCode',
    'deviceName',
    'deviceType',
    'connectionType',
    'ipAddress',
    'location',
    'gateId',
    'direction',
    'cameraIds',
    'cameraRole',
    'printerIds',
    'printerRole',
    'status',
    'isOnline',
    'note'
  ];
  const patch = {};
  allowedFields.forEach((field) => {
    if (field in body) patch[field] = body[field];
  });
  if ('name' in body && !('deviceName' in patch)) patch.deviceName = body.name;
  if ('ip' in body && !('ipAddress' in patch)) patch.ipAddress = body.ip;
  if ('direction' in patch) patch.direction = normalizeDirection(patch.direction);
  if ('cameraIds' in patch) patch.cameraIds = normalizeCameraIds(patch.cameraIds);
  if ('printerIds' in patch) patch.printerIds = normalizePrinterIds(patch.printerIds);
  if ('status' in patch && !('isOnline' in patch)) patch.isOnline = patch.status === 'active';

  devices[index] = { ...devices[index], ...patch };
  const saved = await setConfig(CONFIG_KEY, withSummary({ ...config, devices }));
  appEvents.emit('devices_config_updated', toSafeConfig(withSummary(saved)));

  return { device: toSafeDevice(devices[index]), config: toSafeConfig(withSummary(saved)) };
}

// Function delete device ด้วย id, deviceId, หรือ deviceCode
async function deleteDevice(id) {
  const config = await getDevicesConfig();
  const devices = [...config.devices];
  const index = findDeviceIndex(devices, id);
  if (index === -1) return null;

  const [device] = devices.splice(index, 1);
  const saved = await setConfig(CONFIG_KEY, withSummary({ ...config, devices }));
  appEvents.emit('device_event', {
    type: 'device_deleted',
    deviceId: device.deviceId,
    id: device.id,
    deviceCode: device.deviceCode,
    deviceType: device.deviceType,
    deviceName: device.deviceName,
    status: 'deleted',
    isOnline: false,
  });
  appEvents.emit('devices_config_updated', toSafeConfig(withSummary(saved)));

  return { device: toSafeDevice(device), config: toSafeConfig(withSummary(saved)) };
}

// Export Functions
module.exports = {
  activateRegisteredDevice,
  createDevice,
  createPendingActivationDevice,
  deleteDevice,
  getRegisteredDevice,
  getPendingActivationDeviceByCode,
  getDevicesConfig,
  getDevicesConfigWithMeta,
  provisionCameraDevice,
  provisionPrinterDevice,
  refreshDeviceRuntimeState,
  toSafeConfig,
  toSafeDevice,
  verifyRegisteredDeviceToken,
  updateDevice,
  updateRegisteredDeviceHeartbeat,
  withSummary
};
