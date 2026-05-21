// Import Require
const express = require('express');
const {
  createDevice,
  createPendingActivationDevice,
  deleteDevice,
  getDevicesConfig,
  updateDevice
} = require('../data/repositories/devices.repo');
const {
  deleteKiosk,
  editKiosk,
  generateActivationCode,
  listAllKiosks
} = require('../data/repositories/kiosks.repo');
const {
  deleteBarrierGate,
  editBarrierGate,
  generateBarrierGateActivationCode,
  listAllBarrierGates
} = require('../data/repositories/barrierGates.repo');

const router = express.Router();

// Route query config devices ทั้งหมด
router.get('/config', async (req, res, next) => {
  try {
    const config = await getDevicesConfig();
    res.json(config);
  } catch (err) {
    next(err);
  }
});

// Route create device ใหม่
router.post('/', async (req, res, next) => {
  try {
    const { deviceCode, deviceName, deviceType } = req.body || {};
    if (!deviceCode || !deviceName || !deviceType) {
      return res.status(400).json({ message: 'deviceCode, deviceName and deviceType are required' });
    }
    if (['kiosk', 'barrier_gate'].includes(deviceType)) {
      return res.status(400).json({
        message: 'Kiosk and Barrier Gate devices must be created through activation-code endpoints'
      });
    }

    const result = await createDevice(req.body || {});
    if (!result.ok && result.reason === 'duplicate') {
      return res.status(409).json({ message: 'Device code already exists' });
    }

    return res.status(201).json({
      message: 'Device created',
      device: result.device,
      config: result.config
    });
  } catch (err) {
    next(err);
  }
});

// Route update device ด้วย id
router.put('/:id', async (req, res, next) => {
  try {
    const result = await updateDevice(req.params.id, req.body || {});
    if (!result) return res.status(404).json({ message: 'Device not found' });

    return res.json({
      message: 'Device updated',
      device: result.device,
      config: result.config
    });
  } catch (err) {
    next(err);
  }
});

// Route delete device ด้วย id
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await deleteDevice(req.params.id);
    if (!result) return res.status(404).json({ message: 'Device not found' });

    return res.json({
      message: 'Device deleted',
      device: result.device,
      config: result.config
    });
  } catch (err) {
    next(err);
  }
});

// Route สร้าง activation code สำหรับ kiosk
router.post('/kiosks/activation-code', async (req, res, next) => {
  try {
    const result = await generateActivationCode(req.body || {});
    const pending = await createPendingActivationDevice({
      ...(req.body || {}),
      generatedDeviceId: result.deviceId,
      activationCode: result.code,
      deviceType: 'kiosk'
    });
    if (!pending.ok && pending.reason === 'duplicate') {
      return res.status(409).json({ message: 'Device code already exists' });
    }
    res.json({ message: 'Activation code generated', ...result, device: pending.device, config: pending.config });
  } catch (err) {
    next(err);
  }
});

// Route สร้าง activation code สำหรับ barrier gate
router.post('/barrier-gates/activation-code', async (req, res, next) => {
  try {
    const result = await generateBarrierGateActivationCode(req.body || {});
    const pending = await createPendingActivationDevice({
      ...(req.body || {}),
      generatedDeviceId: result.deviceId,
      activationCode: result.code,
      deviceType: 'barrier_gate'
    });
    if (!pending.ok && pending.reason === 'duplicate') {
      return res.status(409).json({ message: 'Device code already exists' });
    }
    res.json({ message: 'Barrier Gate activation code generated', ...result, device: pending.device, config: pending.config });
  } catch (err) {
    next(err);
  }
});

// Route query kiosk ทั้งหมดพร้อม summary
router.get('/kiosks', async (req, res, next) => {
  try {
    const kiosks = await listAllKiosks();
    res.json({
      total: kiosks.length,
      online: kiosks.filter((kiosk) => kiosk.status === 'online').length,
      offline: kiosks.filter((kiosk) => kiosk.status === 'offline').length,
      maintenance: kiosks.filter((kiosk) => kiosk.status === 'maintenance').length,
      kiosks
    });
  } catch (err) {
    next(err);
  }
});

// Route query barrier gate ทั้งหมดพร้อม summary
router.get('/barrier-gates', async (req, res, next) => {
  try {
    const barrierGates = await listAllBarrierGates();
    res.json({
      total: barrierGates.length,
      online: barrierGates.filter((barrierGate) => barrierGate.status === 'online').length,
      offline: barrierGates.filter((barrierGate) => barrierGate.status === 'offline').length,
      maintenance: barrierGates.filter((barrierGate) => barrierGate.status === 'maintenance').length,
      barrierGates
    });
  } catch (err) {
    next(err);
  }
});

// Route update kiosk ด้วย deviceId
router.put('/kiosks/:deviceId', async (req, res, next) => {
  try {
    const result = await editKiosk(req.params.deviceId, req.body || {});
    if (!result.success) return res.status(404).json(result);
    res.json({ message: 'Kiosk updated', kiosk: result.kiosk });
  } catch (err) {
    next(err);
  }
});

// Route delete kiosk ด้วย deviceId
router.delete('/kiosks/:deviceId', async (req, res, next) => {
  try {
    const result = await deleteKiosk(req.params.deviceId);
    if (!result.success) return res.status(404).json(result);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Route update barrier gate ด้วย deviceId
router.put('/barrier-gates/:deviceId', async (req, res, next) => {
  try {
    const result = await editBarrierGate(req.params.deviceId, req.body || {});
    if (!result.success) return res.status(404).json(result);
    res.json({ message: 'Barrier Gate updated', barrierGate: result.barrierGate });
  } catch (err) {
    next(err);
  }
});

// Route delete barrier gate ด้วย deviceId
router.delete('/barrier-gates/:deviceId', async (req, res, next) => {
  try {
    const result = await deleteBarrierGate(req.params.deviceId);
    if (!result.success) return res.status(404).json(result);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Export router
module.exports = router;
