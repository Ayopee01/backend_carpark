const express = require('express');
const appEvents = require('../utils/events');
const {
  getTransactionApiByIdOrPlateNo,
  processPayment,
} = require('../data/repositories/transactions.repo');
const { optionalDeviceAuth } = require('../middleware/deviceAuth');
const { activateKiosk, searchKiosk, updateKioskStatus } = require('../data/repositories/kiosks.repo');
const { activateBarrierGate, searchBarrierGate, updateBarrierGateStatus } = require('../data/repositories/barrierGates.repo');

const router = express.Router();

async function resolveClientSource(deviceId, req) {
  if (!deviceId) return { clientType: 'mobile', device: null };

  const kiosk = await searchKiosk(deviceId);
  if (kiosk) {
    let current = kiosk;
    if (kiosk.status !== 'maintenance') {
      current = await updateKioskStatus(deviceId, { ip: req.ip });
    }
    return {
      clientType: 'kiosk',
      device: {
        deviceId: current.deviceId,
        deviceType: 'kiosk',
        deviceName: current.name,
        deviceLocation: current.location,
        status: current.status,
      },
    };
  }

  const barrierGate = await searchBarrierGate(deviceId);
  if (barrierGate) {
    let current = barrierGate;
    if (barrierGate.status !== 'maintenance') {
      current = await updateBarrierGateStatus(deviceId, { ip: req.ip });
    }
    return {
      clientType: 'barrier_gate',
      device: {
        deviceId: current.deviceId,
        deviceType: 'barrier_gate',
        deviceName: current.name,
        deviceLocation: current.location,
        status: current.status,
      },
    };
  }

  return {
    clientType: 'unknown_device',
    device: {
      deviceId,
      deviceType: 'unknown',
      deviceName: null,
      deviceLocation: null,
      status: 'unknown',
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
router.post('/check-in', optionalDeviceAuth(['kiosk', 'barrier_gate']), async (req, res, next) => {
  try {
    const { deviceId, name, location } = req.body || {};
    if (!deviceId) return res.status(400).json({ message: 'deviceId is required' });

    if (req.device?.deviceType === 'kiosk') {
      const current = await searchKiosk(deviceId);
      if (!current) return res.status(401).json({ message: 'Invalid or unregistered deviceId' });
      if (current.status === 'maintenance') {
        return res.status(403).json({
          message: 'This kiosk is currently under maintenance. Check-in is disabled.',
          status: current.status,
        });
      }

      const kiosk = await updateKioskStatus(deviceId, { name, location, ip: req.ip });
      return res.json({ message: 'Check-in successful', deviceType: 'kiosk', status: kiosk.status, device: kiosk });
    }

    if (req.device?.deviceType === 'barrier_gate') {
      const current = await searchBarrierGate(deviceId);
      if (!current) return res.status(401).json({ message: 'Invalid or unregistered deviceId' });
      if (current.status === 'maintenance') {
        return res.status(403).json({
          message: 'This Barrier Gate is currently under maintenance. Check-in is disabled.',
          status: current.status,
        });
      }

      const barrierGate = await updateBarrierGateStatus(deviceId, { name, location, ip: req.ip });
      return res.json({ message: 'Check-in successful', deviceType: 'barrier_gate', status: barrierGate.status, device: barrierGate });
    }

    return res.status(401).json({ message: 'Invalid or unregistered deviceId' });
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

    if (deviceId && req.device?.deviceType === 'kiosk') {
      const kiosk = await searchKiosk(deviceId);
      if (!kiosk) return res.status(401).json({ message: 'Unauthorized device' });
      if (kiosk.status === 'maintenance') {
        return res.status(403).json({ message: 'This kiosk is currently under maintenance', status: kiosk.status });
      }
      await updateKioskStatus(deviceId, { ip: req.ip });
      clientType = 'kiosk';
    }

    if (deviceId && req.device?.deviceType === 'barrier_gate') {
      const barrierGate = await searchBarrierGate(deviceId);
      if (!barrierGate) return res.status(401).json({ message: 'Unauthorized device' });
      if (barrierGate.status === 'maintenance') {
        return res.status(403).json({ message: 'This Barrier Gate is currently under maintenance', status: barrierGate.status });
      }
      await updateBarrierGateStatus(deviceId, { ip: req.ip });
      clientType = 'barrier_gate';
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
