// Import Require
const express = require('express');
const {
  createPendingActivationDevice,
  deleteDevice,
  getDevicesConfigWithMeta,
  provisionCameraDevice,
  provisionPrinterDevice,
  refreshDeviceRuntimeState,
  reissueActivationCode,
  toSafeConfig,
  updateDevice,
} = require('../data/repositories/devices.repo');
const appEvents = require('../utils/events');
const {
  deleteKiosk,
  editKiosk,
  generateActivationCode,
} = require('../data/repositories/kiosks.repo');
const {
  deleteBarrierGate,
  generateBarrierGateActivationCode,
  updateBarrierGate,
} = require('../data/repositories/barrierGates.repo');
const { createSseStream } = require('../utils/sse');

const router = express.Router();

let runtimeMonitorStarted = false;

// Function แปลง body เป็น payload สำหรับ activation
function toActivationPayload(body = {}, deviceType) {
  return {
    ...(body.deviceName ? { deviceName: body.deviceName } : {}),
    ...(body.name ? { name: body.name } : {}),
    ...(body.deviceCode ? { deviceCode: body.deviceCode } : {}),
    ...(body.location ? { location: body.location } : {}),
    ...(body.gateId ? { gateId: body.gateId } : {}),
    ...(body.direction ? { direction: body.direction } : {}),
    ...(Array.isArray(body.cameraIds) ? { cameraIds: body.cameraIds } : {}),
    ...(Array.isArray(body.printerIds) ? { printerIds: body.printerIds } : {}),
    ...(body.connectionType ? { connectionType: body.connectionType } : {}),
    ...(body.note ? { note: body.note } : {}),
    deviceType,
  };
}

// Function ตรวจว่า device ตรงกับ keyword หรือไม่
function matchesKeyword(device, keyword) {
  if (!keyword) return true;
  const normalized = String(keyword).trim().toLowerCase();
  return [
    device.id,
    device.deviceId,
    device.deviceCode,
    device.deviceName,
    device.deviceType,
    device.status,
    device.location,
    device.ipAddress,
  ].some((value) => String(value || '').toLowerCase().includes(normalized));
}

// Function สรุปจำนวน device ตามสถานะ
function summarizeDevices(devices) {
  return {
    total: devices.length,
    online: devices.filter((device) => device.isOnline).length,
    offline: devices.filter((device) => !device.isOnline && device.status !== 'maintenance').length,
    maintenance: devices.filter((device) => device.status === 'maintenance').length,
  };
}

// Function แปลง status เป็น runtime status
function toRuntimeStatus(status) {
  if (status === 'active') return 'online';
  return status;
}

// Function แปลง device เป็น response หลัง mutation
function toDeviceMutationResponse(device) {
  if (!device) return null;

  return {
    deviceId: device.deviceId || device.id,
    deviceName: device.deviceName,
    deviceType: device.deviceType,
    connectionType: device.connectionType,
    location: device.location || null,
    ipAddress: device.ipAddress || null,
    gateId: device.gateId || null,
    direction: device.direction || null,
    cameraIds: Array.isArray(device.cameraIds) ? device.cameraIds : [],
    cameraRole: device.cameraRole || null,
    printerIds: Array.isArray(device.printerIds) ? device.printerIds : [],
    printerRole: device.printerRole || null,
    status: device.status,
    isOnline: Boolean(device.isOnline),
    note: device.note || '',
  };
}

// Function สร้าง response หลัง provision camera
function toProvisionedCameraResponse(result) {
  return {
    success: true,
    message: 'Camera provisioned',
    device: toDeviceMutationResponse(result.device),
    deviceToken: result.deviceToken,
  };
}

// Function สร้าง response หลัง provision printer
function toProvisionedPrinterResponse(result) {
  return {
    success: true,
    message: 'Printer provisioned',
    device: toDeviceMutationResponse(result.device),
    deviceToken: result.deviceToken,
  };
}

// Function สร้าง response หลัง reissue activation code
function toReissuedActivationResponse(result) {
  return {
    success: true,
    message: 'Activation code reissued',
    deviceId: result.device.deviceId || result.device.id,
    deviceName: result.device.deviceName,
    deviceType: result.device.deviceType,
    activationCode: result.activationCode,
    expiresAt: result.expiresAt,
    device: toDeviceMutationResponse(result.device),
  };
}

// Function sync runtime config ของ kiosk/barrier gate
async function syncRuntimeDevice(device, body = {}, action = 'update') {
  const deviceId = device?.deviceId || device?.id;
  if (!deviceId) return;

  if (device.deviceType === 'kiosk') {
    if (action === 'delete') {
      await deleteKiosk(deviceId);
      return;
    }
    await editKiosk(deviceId, {
      name: body.deviceName || body.name || device.deviceName,
      location: body.location || device.location,
      printerIds: Array.isArray(body.printerIds) ? body.printerIds : device.printerIds,
      status: toRuntimeStatus(body.status || device.status),
    });
  }

  if (device.deviceType === 'barrier_gate') {
    if (action === 'delete') {
      await deleteBarrierGate(deviceId);
      return;
    }
    await updateBarrierGate(deviceId, {
      name: body.deviceName || body.name || device.deviceName,
      location: body.location || device.location,
      gateId: body.gateId !== undefined ? body.gateId : device.gateId,
      direction: body.direction !== undefined ? body.direction : device.direction,
      cameraIds: Array.isArray(body.cameraIds) ? body.cameraIds : device.cameraIds,
      printerIds: Array.isArray(body.printerIds) ? body.printerIds : device.printerIds,
      status: toRuntimeStatus(body.status || device.status),
    });
  }
}

// Function เริ่ม monitor device runtime เพียงครั้งเดียว
function startDeviceRuntimeMonitor() {
  if (runtimeMonitorStarted) return;
  runtimeMonitorStarted = true;
  const interval = setInterval(() => {
    refreshDeviceRuntimeState({ emitEvents: true }).catch((err) => {
      console.error('Device runtime monitor failed:', err);
    });
  }, 30 * 1000);
  interval.unref?.();
}

startDeviceRuntimeMonitor();

// Route SSE สำหรับ device realtime ของ admin
router.get('/events', async (req, res) => {
  try {
    const stream = createSseStream(req, res, {
      connected: { type: 'connected', message: 'Device event stream connected' },
    });

    const sendDeviceEvent = (event) => {
      stream.write(event);
    };
    const sendConfigUpdated = (config) => {
      stream.write({ type: 'devices_config_updated', config });
    };

    appEvents.on('device_event', sendDeviceEvent);
    appEvents.on('devices_config_updated', sendConfigUpdated);
    stream.addCleanup(() => {
      appEvents.off('device_event', sendDeviceEvent);
      appEvents.off('devices_config_updated', sendConfigUpdated);
    });
  } catch (err) {
    const statusCode = err.statusCode || err.status || 500;
    return res.status(statusCode).json({
      status: 'error',
      message: err.message || 'Internal server error',
    });
  }
});

// Function สร้าง response activation แบบ public
function toPublicActivationResponse(result, payload) {
  return {
    CodeActivate: result.code,
    deviceName: payload.deviceName || payload.name || result.deviceId,
    deviceType: result.deviceType,
    status: 'active',
    isOnline: true,
  };
}

// Route list device ทั้งหมดพร้อม filter
router.get('/', async (req, res, next) => {
  try {
    const config = toSafeConfig(await getDevicesConfigWithMeta());
    let devices = Array.isArray(config.devices) ? config.devices : [];
    const { deviceType, status, keyword } = req.query || {};

    if (deviceType) {
      devices = devices.filter((device) => device.deviceType === deviceType);
    }
    if (status) {
      devices = devices.filter((device) => device.status === status);
    }
    if (keyword) {
      devices = devices.filter((device) => matchesKeyword(device, keyword));
    }

    return res.json({
      ...summarizeDevices(devices),
      devices,
      configUpdatedAt: config.configUpdatedAt,
    });
  } catch (err) {
    next(err);
  }
});

// Route สร้าง activation code สำหรับ kiosk หรือ barrier gate
router.post('/', async (req, res, next) => {
  try {
    const { deviceName, name, deviceType } = req.body || {};
    if (!deviceName && !name) {
      return res.status(400).json({ status: 'error', message: 'deviceName is required' });
    }
    if (!['kiosk', 'barrier_gate'].includes(deviceType)) {
      return res.status(400).json({ status: 'error', message: 'deviceType must be kiosk or barrier_gate' });
    }

    const payload = toActivationPayload(req.body || {}, deviceType);
    const result = deviceType === 'barrier_gate'
      ? await generateBarrierGateActivationCode(payload)
      : await generateActivationCode(payload);

    const pending = await createPendingActivationDevice({
      ...payload,
      generatedDeviceId: result.deviceId,
      activationCode: result.code,
      activationExpiresAt: result.expiresAt,
    });
    if (!pending.ok && pending.reason === 'duplicate') {
      return res.status(409).json({ status: 'error', message: 'Device code already exists' });
    }

    return res.status(201).json(toPublicActivationResponse(result, payload));
  } catch (err) {
    next(err);
  }
});

// Route provision camera สำหรับ LPR หรือ Postman simulation
router.post('/cameras/provision', async (req, res, next) => {
  try {
    const { deviceName, name } = req.body || {};
    if (!deviceName && !name) {
      return res.status(400).json({ status: 'error', message: 'deviceName is required' });
    }

    const result = await provisionCameraDevice(req.body || {});
    if (!result.ok && result.reason === 'duplicate') {
      return res.status(409).json({ status: 'error', message: 'Device code already exists' });
    }

    return res.status(201).json(toProvisionedCameraResponse(result));
  } catch (err) {
    next(err);
  }
});

// Route provision printer สำหรับ kiosk หรือ barrier gate
router.post('/printers/provision', async (req, res, next) => {
  try {
    const { deviceName, name } = req.body || {};
    if (!deviceName && !name) {
      return res.status(400).json({ status: 'error', message: 'deviceName is required' });
    }

    const result = await provisionPrinterDevice(req.body || {});
    if (!result.ok && result.reason === 'duplicate') {
      return res.status(409).json({ status: 'error', message: 'Device code already exists' });
    }

    return res.status(201).json(toProvisionedPrinterResponse(result));
  } catch (err) {
    next(err);
  }
});

// Route reissue activation code สำหรับ kiosk/barrier gate เดิม
router.post('/:deviceId/reissue-activation-code', async (req, res, next) => {
  try {
    const result = await reissueActivationCode(req.params.deviceId);
    if (!result.ok && result.reason === 'not_found') {
      return res.status(404).json({ status: 'error', message: 'Device not found' });
    }
    if (!result.ok && result.reason === 'invalid_type') {
      return res.status(400).json({ status: 'error', message: 'Activation code can only be reissued for kiosk or barrier_gate devices' });
    }
    if (!result.ok && result.reason === 'maintenance') {
      return res.status(403).json({ status: 'error', message: 'Device is currently under maintenance' });
    }
    if (!result.ok) {
      return res.status(400).json({ status: 'error', message: 'Unable to reissue activation code' });
    }

    return res.status(201).json(toReissuedActivationResponse(result));
  } catch (err) {
    next(err);
  }
});

// Route update device ด้วย id, deviceId หรือ deviceCode
router.put('/:deviceId', async (req, res, next) => {
  try {
    const result = await updateDevice(req.params.deviceId, req.body || {});
    if (!result) return res.status(404).json({ message: 'Device not found' });
    await syncRuntimeDevice(result.device, req.body || {}, 'update');

    return res.json({
      message: 'Device updated',
      device: toDeviceMutationResponse(result.device),
    });
  } catch (err) {
    next(err);
  }
});

// Route delete device ด้วย id, deviceId หรือ deviceCode
router.delete('/:deviceId', async (req, res, next) => {
  try {
    const result = await deleteDevice(req.params.deviceId);
    if (!result) return res.status(404).json({ message: 'Device not found' });
    await syncRuntimeDevice(result.device, {}, 'delete');

    return res.json({
      success: true,
      message: 'Device deleted',
    });
  } catch (err) {
    next(err);
  }
});

// Export Router
module.exports = router;
