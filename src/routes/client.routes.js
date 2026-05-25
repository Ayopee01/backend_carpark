const express = require('express');
const appEvents = require('../utils/events');
const {
  getTransactionApiByIdOrPlateNo,
  processPayment,
} = require('../data/repositories/transactions.repo');
const { optionalDeviceAuth, requireDeviceAuth } = require('../middleware/deviceAuth');
const { getRegisteredDevice, updateRegisteredDeviceHeartbeat } = require('../data/repositories/devices.repo');
const { activateKiosk } = require('../data/repositories/kiosks.repo');
const { activateBarrierGate } = require('../data/repositories/barrierGates.repo');

const router = express.Router();

function createHttpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function resolveClientSource(deviceId, req) {
  if (!deviceId) return { clientType: 'mobile', device: null };

  const device = await getRegisteredDevice(deviceId);
  if (!device || !['kiosk', 'barrier_gate'].includes(device.deviceType)) {
    throw createHttpError(401, 'Invalid or unregistered deviceId');
  }
  if (device.status === 'maintenance') {
    throw createHttpError(403, 'Device is currently under maintenance');
  }

  const updated = await updateRegisteredDeviceHeartbeat(deviceId, { ip: req.ip });
  const current = updated?.device || device;

  return {
    clientType: current.deviceType === 'barrier_gate' ? 'barrier_gate' : 'kiosk',
    device: {
      deviceId: current.deviceId,
      deviceType: current.deviceType,
      deviceName: current.deviceName,
      deviceLocation: current.location,
      status: current.status,
    },
  };
}

// Shared activation endpoint for kiosk and barrier gate frontends.
router.post('/activate', async (req, res, next) => {
  try {
    const code = req.body?.code === undefined || req.body?.code === null ? '' : String(req.body.code).trim();
    if (!code) return res.status(400).json({ message: 'Activation code is required' });

    const kioskResult = await activateKiosk(code);
    if (kioskResult.success) return res.json(kioskResult);

    const barrierGateResult = await activateBarrierGate(code);
    if (barrierGateResult.success) return res.json(barrierGateResult);

    return res.status(400).json({ message: 'Invalid or expired code' });
  } catch (err) {
    next(err);
  }
});

// Shared heartbeat/check-in endpoint for kiosk and barrier gate devices.
router.post('/check-in', requireDeviceAuth(['kiosk', 'barrier_gate']), async (req, res, next) => {
  try {
    const { deviceId, name, location } = req.body || {};
    if (!deviceId) return res.status(400).json({ message: 'deviceId is required' });

    if (req.device?.status === 'maintenance') {
      return res.status(403).json({
        message: 'This device is currently under maintenance. Check-in is disabled.',
        status: req.device.status,
      });
    }

    const result = await updateRegisteredDeviceHeartbeat(deviceId, { name, location, ip: req.ip });
    if (!result?.device) return res.status(401).json({ message: 'Invalid or unregistered deviceId' });

    return res.json({
      message: 'Check-in successful',
      deviceType: result.device.deviceType,
      status: result.device.status,
      device: result.device,
    });
  } catch (err) {
    next(err);
  }
});

// Public transaction lookup by transaction id or plateNo for kiosk, barrier gate, or mobile clients.
router.get('/transaction/:id', async (req, res, next) => {
  try {
    const { deviceId } = req.query || {};
    const source = await resolveClientSource(deviceId, req);
    const transaction = await getTransactionApiByIdOrPlateNo(req.params.id, { payableOnly: true });
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });
    if (transaction.status === 'completed' || transaction.status === 'cancelled') {
      return res.status(403).json({ message: 'This transaction is already processed' });
    }

    return res.json({ ...transaction, clientType: source.clientType, device: source.device });
  } catch (err) {
    next(err);
  }
});

// Public payment endpoint for kiosk, barrier gate, or mobile clients.
router.post('/payment', async (req, res, next) => {
  try {
    const { transactionId, plateNo, method, amount, deviceId } = req.body || {};
    if (!transactionId && !plateNo) return res.status(400).json({ message: 'transactionId or plateNo is required' });

    const source = await resolveClientSource(deviceId, req);
    const channel = source.clientType === 'barrier_gate'
      ? 'gate'
      : source.clientType === 'kiosk'
        ? 'kiosk'
        : 'mobile';
    const defaultMethod = channel === 'gate' ? 'wallet' : 'qr';

    const result = await processPayment(transactionId, {
      plateNo,
      method: method || defaultMethod,
      channel,
      amount,
      processedBy: deviceId ? `${source.clientType}_${deviceId}` : 'mobile_user',
      device: source.device && source.clientType !== 'mobile' ? source.device : null,
    });

    if (!result) return res.status(400).json({ message: 'Payment processing failed' });

    return res.json({
      message: 'Payment received successfully',
      transaction: result,
      clientType: source.clientType,
      device: source.device,
    });
  } catch (err) {
    next(err);
  }
});

// Shared SSE stream for kiosk, barrier gate, and public/mobile clients.
router.get('/events', optionalDeviceAuth(['kiosk', 'barrier_gate']), async (req, res, next) => {
  try {
    const { deviceId } = req.query;
    let clientType = 'public';

    if (deviceId) {
      if (!req.device) return res.status(401).json({ message: 'Unauthorized device' });
      if (req.device.status === 'maintenance') {
        return res.status(403).json({ message: 'This device is currently under maintenance', status: req.device.status });
      }
      await updateRegisteredDeviceHeartbeat(deviceId, { ip: req.ip });
      clientType = req.device.deviceType;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write(`data: ${JSON.stringify({ type: 'connected', clientType, message: 'Client event stream connected' })}\n\n`);

    const onThemeUpdated = (newTheme) => {
      res.write(`data: ${JSON.stringify({ type: 'theme_updated', theme: newTheme })}\n\n`);
    };
    const keepAlive = setInterval(() => {
      res.write(`data: ${JSON.stringify({ type: 'ping', at: new Date().toISOString() })}\n\n`);
    }, 25 * 1000);

    appEvents.on('theme_updated', onThemeUpdated);
    req.on('close', () => {
      clearInterval(keepAlive);
      appEvents.off('theme_updated', onThemeUpdated);
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
