const express = require('express');
const { store } = require('../data/store');
const {
  listAllKiosks,
  generateActivationCode,
  editKiosk,
  deleteKiosk,
} = require('../data/repositories/kiosks.repo');

const router = express.Router();

console.log('✅ LOADED devices.routes.js');

function getDevicesConfig() {
  const config = store.devices || {
    summary: {
      totalDevices: 0,
      online: 0,
      offline: 0,
    },
    devices: [],
    masterData: {
      deviceTypes: [],
      connectionTypes: [],
    },
  };

  const devices = Array.isArray(config.devices) ? config.devices : [];

  const totalDevices = devices.length;
  const online = devices.filter((device) => device.isOnline).length;
  const offline = totalDevices - online;

  return {
    ...config,
    summary: {
      totalDevices,
      online,
      offline,
      ...(config.summary || {}),
    },
    devices,
  };
}

/**
 * GET /api/v1/devices/config
 * ดึง config อุปกรณ์ทั่วไป เช่น printer, lpr, barrier
 */
router.get('/config', (req, res) => {
  res.json(getDevicesConfig());
});

/**
 * POST /api/v1/devices
 * เพิ่มอุปกรณ์ทั่วไป
 */
router.post('/', (req, res) => {
  const config = getDevicesConfig();

  const {
    deviceCode,
    deviceName,
    deviceType,
    connectionType,
    ipAddress,
    status,
    isOnline,
    note,
  } = req.body || {};

  if (!deviceCode || !deviceName || !deviceType) {
    return res.status(400).json({
      message: 'deviceCode, deviceName and deviceType are required',
    });
  }

  const exists = config.devices.some((device) => {
    return device.deviceCode === deviceCode;
  });

  if (exists) {
    return res.status(409).json({
      message: 'Device code already exists',
    });
  }

  const newDevice = {
    id: `d${Date.now()}`,
    deviceCode,
    deviceName,
    deviceType,
    connectionType: connectionType || 'lan',
    ipAddress: ipAddress || null,
    status: status || 'active',
    isOnline: Boolean(isOnline),
    note: note || '',
  };

  store.devices.devices.push(newDevice);

  res.status(201).json({
    message: 'Device created',
    device: newDevice,
    config: getDevicesConfig(),
  });
});

/**
 * PUT /api/v1/devices/:id
 * แก้ไขอุปกรณ์ทั่วไป
 */
router.put('/:id', (req, res) => {
  const config = getDevicesConfig();
  const device = config.devices.find((item) => item.id === req.params.id);

  if (!device) {
    return res.status(404).json({
      message: 'Device not found',
    });
  }

  const allowedFields = [
    'deviceCode',
    'deviceName',
    'deviceType',
    'connectionType',
    'ipAddress',
    'status',
    'isOnline',
    'note',
  ];

  allowedFields.forEach((field) => {
    if (field in req.body) {
      device[field] = req.body[field];
    }
  });

  res.json({
    message: 'Device updated',
    device,
    config: getDevicesConfig(),
  });
});

/**
 * DELETE /api/v1/devices/:id
 * ลบอุปกรณ์ทั่วไป
 */
router.delete('/:id', (req, res) => {
  const config = getDevicesConfig();
  const index = config.devices.findIndex((item) => item.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({
      message: 'Device not found',
    });
  }

  const deleted = store.devices.devices.splice(index, 1)[0];

  res.json({
    message: 'Device deleted',
    device: deleted,
    config: getDevicesConfig(),
  });
});

/**
 * POST /api/v1/devices/kiosks/activation-code
 * แอดมินสร้าง activation code ให้ kiosk
 */
router.post('/kiosks/activation-code', async (req, res, next) => {
  try {
    const result = await generateActivationCode(req.body || {});

    res.json({
      message: 'Activation code generated',
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/devices/kiosks
 * ดูรายการ kiosk monitor
 */
router.get('/kiosks', async (req, res, next) => {
  try {
    const kiosks = await listAllKiosks();

    const online = kiosks.filter((kiosk) => kiosk.status === 'online').length;
    const offline = kiosks.filter((kiosk) => kiosk.status === 'offline').length;
    const maintenance = kiosks.filter((kiosk) => {
      return kiosk.status === 'maintenance';
    }).length;

    res.json({
      total: kiosks.length,
      online,
      offline,
      maintenance,
      kiosks,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/v1/devices/kiosks/:deviceId
 * แก้ไข kiosk เช่น name, location, status
 */
router.put('/kiosks/:deviceId', async (req, res, next) => {
  try {
    const result = await editKiosk(req.params.deviceId, req.body || {});

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json({
      message: 'Kiosk updated',
      kiosk: result.kiosk,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/v1/devices/kiosks/:deviceId
 * ลบ kiosk
 */
router.delete('/kiosks/:deviceId', async (req, res, next) => {
  try {
    const result = await deleteKiosk(req.params.deviceId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;