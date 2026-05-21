// Import Require
const express = require('express');
const { getTransactionApiById, getTransactionApiByPlateNo, processPayment } = require('../data/repositories/transactions.repo');
const {
  activateBarrierGate,
  searchBarrierGate,
  updateBarrierGateStatus,
} = require('../data/repositories/barrierGates.repo');

const router = express.Router();

router.post('/activate', async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: 'Activation code is required' });

    const result = await activateBarrierGate(code);
    if (!result.success) return res.status(400).json(result);

    return res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/check-in', async (req, res, next) => {
  try {
    const { deviceId, name, location, version } = req.body;
    if (!deviceId) return res.status(400).json({ message: 'deviceId is required' });

    const current = await searchBarrierGate(deviceId);
    if (!current) return res.status(401).json({ message: 'Invalid or unregistered deviceId' });
    if (current.status === 'maintenance') {
      return res.status(403).json({
        message: 'This Barrier Gate is currently under maintenance. Check-in is disabled.',
        status: current.status,
      });
    }

    const barrierGate = await updateBarrierGateStatus(deviceId, {
      name,
      location,
      version,
      ip: req.ip,
    });

    return res.json({
      message: 'Check-in successful',
      status: barrierGate.status,
      barrierGate,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/transaction', async (req, res, next) => {
  try {
    const { plateNo, deviceId } = req.query || {};
    if (!plateNo) return res.status(400).json({ message: 'plateNo is required in query' });
    if (deviceId) {
      const barrierGate = await searchBarrierGate(deviceId);
      if (!barrierGate) return res.status(401).json({ message: 'Invalid or unregistered deviceId' });
      if (barrierGate.status === 'maintenance') {
        return res.status(403).json({ message: 'This Barrier Gate is currently under maintenance', status: barrierGate.status });
      }
      await updateBarrierGateStatus(deviceId, { ip: req.ip });
    }

    const transaction = await getTransactionApiByPlateNo(plateNo, { payableOnly: true });
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });

    return res.json(transaction);
  } catch (err) {
    next(err);
  }
});

router.get('/transaction/:id', async (req, res, next) => {
  try {
    const { deviceId } = req.query || {};
    if (deviceId) {
      const barrierGate = await searchBarrierGate(deviceId);
      if (!barrierGate) return res.status(401).json({ message: 'Invalid or unregistered deviceId' });
      if (barrierGate.status === 'maintenance') {
        return res.status(403).json({ message: 'This Barrier Gate is currently under maintenance', status: barrierGate.status });
      }
      await updateBarrierGateStatus(deviceId, { ip: req.ip });
    }

    const transaction = await getTransactionApiById(req.params.id);
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });

    return res.json(transaction);
  } catch (err) {
    next(err);
  }
});

router.post('/payment', async (req, res, next) => {
  try {
    const { transactionId, plateNo, method, amount, deviceId } = req.body;
    if (!transactionId && !plateNo) return res.status(400).json({ message: 'transactionId or plateNo is required' });

    let onlineBarrierGate = null;
    if (deviceId) {
      const barrierGate = await searchBarrierGate(deviceId);
      if (!barrierGate) return res.status(401).json({ message: 'Invalid or unregistered deviceId' });
      if (barrierGate.status === 'maintenance') {
        return res.status(403).json({
          message: 'This Barrier Gate is currently under maintenance. Payment is disabled.',
          status: barrierGate.status,
        });
      }
      onlineBarrierGate = await updateBarrierGateStatus(deviceId, { ip: req.ip });
    }

    const result = await processPayment(transactionId, {
      plateNo,
      method: method || 'wallet',
      channel: 'gate',
      amount,
      processedBy: deviceId ? `barrier_gate_${deviceId}` : 'system_barrier_gate',
      device: onlineBarrierGate ? {
        deviceId: onlineBarrierGate.deviceId,
        deviceType: 'barrier_gate',
        deviceName: onlineBarrierGate.name,
        deviceLocation: onlineBarrierGate.location,
      } : null,
    });

    if (!result) return res.status(400).json({ message: 'Payment processing failed' });

    return res.json({
      message: 'Barrier Gate payment received successfully',
      transaction: result,
      ...(onlineBarrierGate ? { barrierGate: {
        deviceId: onlineBarrierGate.deviceId,
        name: onlineBarrierGate.name,
        location: onlineBarrierGate.location,
        status: onlineBarrierGate.status,
      } } : {}),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
