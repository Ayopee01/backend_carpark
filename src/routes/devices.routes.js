// Import Require
const express = require('express');
const {
  createPendingActivationDevice,
  deleteDevice,
  getDevicesConfigWithMeta,
  provisionCameraDevice,
  refreshDeviceRuntimeState,
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

const router = express.Router();

let runtimeMonitorStarted = false;

function toActivationPayload(body = {}, deviceType) {
  return {
    ...(body.deviceName ? { deviceName: body.deviceName } : {}),
    ...(body.name ? { name: body.name } : {}),
    ...(body.deviceCode ? { deviceCode: body.deviceCode } : {}),
    ...(body.location ? { location: body.location } : {}),
    ...(body.gateId ? { gateId: body.gateId } : {}),
    ...(body.direction ? { direction: body.direction } : {}),
    ...(Array.isArray(body.cameraIds) ? { cameraIds: body.cameraIds } : {}),
    ...(body.cameraRole ? { cameraRole: body.cameraRole } : {}),
    ...(body.connectionType ? { connectionType: body.connectionType } : {}),
    ...(body.note ? { note: body.note } : {}),
    deviceType,
  };
}

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

function summarizeDevices(devices) {
  return {
    total: devices.length,
    online: devices.filter((device) => device.isOnline).length,
    offline: devices.filter((device) => !device.isOnline && device.status !== 'maintenance').length,
    maintenance: devices.filter((device) => device.status === 'maintenance').length,
  };
}

function toRuntimeStatus(status) {
  if (status === 'active') return 'online';
  return status;
}

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
    status: device.status,
    isOnline: Boolean(device.isOnline),
    note: device.note || '',
  };
}

function toProvisionedCameraResponse(result) {
  return {
    success: true,
    message: 'Camera provisioned',
    device: toDeviceMutationResponse(result.device),
    deviceToken: result.deviceToken,
  };
}

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
      status: toRuntimeStatus(body.status || device.status),
    });
  }
}

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

// Admin SSE for realtime device updates.
router.get('/events', async (req, res) => {
  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Device event stream connected' })}\n\n`);

    const sendDeviceEvent = (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    const sendConfigUpdated = (config) => {
      res.write(`data: ${JSON.stringify({ type: 'devices_config_updated', config })}\n\n`);
    };
    const keepAlive = setInterval(() => {
      res.write(`data: ${JSON.stringify({ type: 'ping', at: new Date().toISOString() })}\n\n`);
    }, 25 * 1000);

    appEvents.on('device_event', sendDeviceEvent);
    appEvents.on('devices_config_updated', sendConfigUpdated);
    req.on('close', () => {
      clearInterval(keepAlive);
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

function toPublicActivationResponse(result, payload) {
  return {
    CodeActivate: result.code,
    deviceName: payload.deviceName || payload.name || result.deviceId,
    deviceType: result.deviceType,
    status: 'active',
    isOnline: true,
  };
}

// List every managed device in one endpoint. Filter by deviceType/status/keyword when needed.
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

// Create activation code for kiosk or barrier gate frontend roles.
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

// Provision a camera directly for LPR devices or Postman simulation.
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

// Update by id, deviceId, or deviceCode.
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

// Delete by id, deviceId, or deviceCode.
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

// Export router
module.exports = router;
