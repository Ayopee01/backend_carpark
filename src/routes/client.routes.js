const express = require('express');
const appEvents = require('../utils/events');
const {
  getTransactionApiByIdOrPlateNo,
  lookupTransactionApiByPlateNo,
  processPayment,
} = require('../data/repositories/transactions.repo');
const { optionalDeviceAuth, requireDeviceAuth } = require('../middleware/deviceAuth');
const { updateRegisteredDeviceHeartbeat } = require('../data/repositories/devices.repo');
const { activateKiosk } = require('../data/repositories/kiosks.repo');
const { activateBarrierGate } = require('../services/barrierGates.service');
const { getPaymentChannelForClientSource, resolveClientSource } = require('../services/clientSource.service');
const { createOmiseChargeForClient, getOmiseQrImage } = require('../services/paymentGateway.service');
const { createSseStream } = require('../utils/sse');

const router = express.Router();

// Function แปลง transaction เป็น response สำหรับ client
function toClientTransactionResponse(transaction, source) {
  return {
    transactionId: transaction.id,
    billNo: transaction.billNo,
    plateNo: transaction.plateNo,
    vehicleType: transaction.vehicleType,
    entryAt: transaction.entryAt,
    calculatedAt: transaction.calculatedAt,
    exitTimeLimit: transaction.exitTimeLimit,
    isOverstay: transaction.isOverstay,
    status: transaction.status,
    amount: {
      netAmount: transaction.netAmount,
      paidAmount: transaction.totalPaid,
      remainingAmount: transaction.remainingAmount,
    },
    duration: {
      display: transaction.serviceDisplay,
      hours: transaction.durationHour,
      totalMinutes: transaction.totalMinutes,
    },
    qrData: transaction.qrData,
    clientType: source.clientType,
    device: source.device,
  };
}

// Function รับ payment จาก mobile/kiosk/gate client
async function handleClientPayment(req, res, next, pathPlateNo) {
  try {
    const { transactionId, plateNo: bodyPlateNo, method, amount, deviceId: bodyDeviceId } = req.body || {};
    const plateNo = pathPlateNo || bodyPlateNo;
    const deviceId = req.query?.deviceId || bodyDeviceId || req.get('x-device-id');
    if (!transactionId && !plateNo) return res.status(400).json({ message: 'transactionId or plateNo is required' });

    const source = await resolveClientSource(deviceId, req);
    const channel = getPaymentChannelForClientSource(source);
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
}

// Route activation กลางสำหรับ kiosk และ barrier gate
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

// Route check-in สำหรับ device ที่มี credential
router.post('/check-in', requireDeviceAuth(['kiosk', 'barrier_gate', 'camera', 'printer']), async (req, res, next) => {
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

// Route public lookup transaction ด้วย plateNo สำหรับ client
router.get('/transaction', async (req, res, next) => {
  try {
    const { plateNo, deviceId } = req.query || {};
    const normalizedPlateNo = plateNo === undefined || plateNo === null ? '' : String(plateNo).trim();
    if (!normalizedPlateNo) return res.status(400).json({ message: 'plateNo is required' });

    const source = await resolveClientSource(deviceId, req);
    const lookup = await lookupTransactionApiByPlateNo(normalizedPlateNo, { payableOnly: true });
    if (lookup.matchType === 'invalid') return res.status(400).json({ message: lookup.message });
    if (lookup.matchType === 'not_found') return res.status(404).json({ message: 'Transaction not found' });
    if (lookup.matchType === 'multiple') {
      return res.json({
        ...lookup,
        clientType: source.clientType,
        device: source.device,
      });
    }

    const transaction = lookup.transaction;
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });
    if (transaction.status === 'completed' || transaction.status === 'cancelled') {
      return res.status(403).json({ message: 'This transaction is already processed' });
    }

    return res.json(toClientTransactionResponse(transaction, source));
  } catch (err) {
    next(err);
  }
});

// Route public lookup transaction ด้วย id หรือ plateNo สำหรับ client
router.get('/transaction/:id', async (req, res, next) => {
  try {
    const { deviceId } = req.query || {};
    const source = await resolveClientSource(deviceId, req);
    const transaction = await getTransactionApiByIdOrPlateNo(req.params.id);
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });
    if (transaction.status === 'completed' || transaction.status === 'cancelled') {
      return res.status(403).json({ message: 'This transaction is already processed' });
    }

    return res.json(toClientTransactionResponse(transaction, source));
  } catch (err) {
    next(err);
  }
});

// Route สร้าง Omise charge สำหรับ mobile/kiosk/barrier gate
router.post('/payment/omise/charge', async (req, res, next) => {
  try {
    const {
      plateNo,
      source,
      token,
      sourceType,
      method,
      deviceId: bodyDeviceId,
      returnUri,
    } = req.body || {};
    const deviceId = req.query?.deviceId || bodyDeviceId || req.get('x-device-id');
    if (!plateNo) return res.status(400).json({ message: 'plateNo is required' });
    if (!source && !token) return res.status(400).json({ message: 'source or token is required' });

    const sourceInfo = await resolveClientSource(deviceId, req);
    const channel = getPaymentChannelForClientSource(sourceInfo);
    const result = await createOmiseChargeForClient({
      plateNo,
      source,
      token,
      sourceType,
      method,
      channel,
      processedBy: deviceId ? `${sourceInfo.clientType}_${deviceId}` : 'mobile_user',
      returnUri,
    });

    return res.status(201).json({
      message: 'Omise charge created',
      clientType: sourceInfo.clientType,
      device: sourceInfo.device,
      charge: result,
    });
  } catch (err) {
    if (err.statusCode === 409 && err.candidates) {
      return res.status(409).json({
        message: err.message,
        matchType: 'multiple',
        requiresSelection: true,
        candidates: err.candidates,
      });
    }
    if (err.provider === 'omise') {
      return res.status(err.statusCode || 502).json({
        message: err.message,
        provider: err.provider,
        code: err.code || null,
        location: err.location || null,
      });
    }
    next(err);
  }
});

// Route ดึงรูป QR ของ Omise สำหรับ client flow
router.get('/payment/omise/qr', async (req, res, next) => {
  try {
    const { chargeId, documentPath } = req.query || {};
    const image = await getOmiseQrImage({ chargeId, documentPath });

    res.setHeader('Content-Type', image.contentType || 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(image.body);
  } catch (err) {
    if (err.provider === 'omise') {
      return res.status(err.statusCode || 502).json({
        message: err.message || 'Unable to load Omise QR image',
        provider: err.provider,
      });
    }
    next(err);
  }
});

// Route public payment ด้วย plateNo ใน path
router.post('/:plateNo/payment', async (req, res, next) => {
  const plateNo = req.params.plateNo === undefined || req.params.plateNo === null ? '' : String(req.params.plateNo).trim();
  if (!plateNo) return res.status(400).json({ message: 'plateNo is required' });
  return handleClientPayment(req, res, next, plateNo);
});

// Route public payment สำหรับ client
router.post('/payment', async (req, res, next) => {
  return handleClientPayment(req, res, next);
});

// Route SSE กลางสำหรับ kiosk, barrier gate และ mobile
router.get('/events', optionalDeviceAuth(['kiosk', 'barrier_gate']), async (req, res, next) => {
  try {
    const { deviceId, gateId, direction, cameraId } = req.query;
    let clientType = 'public';
    const normalizedDeviceId = deviceId ? String(deviceId).trim() : null;
    const normalizedGateId = gateId ? String(gateId).trim() : null;
    const normalizedDirection = direction ? String(direction).trim().toUpperCase() : null;
    const normalizedCameraId = cameraId ? String(cameraId).trim() : null;

    if (normalizedDeviceId) {
      if (!req.device) return res.status(401).json({ message: 'Unauthorized device' });
      if (req.device.status === 'maintenance') {
        return res.status(403).json({ message: 'This device is currently under maintenance', status: req.device.status });
      }
      await updateRegisteredDeviceHeartbeat(normalizedDeviceId, { ip: req.ip });
      clientType = req.device.deviceType;
    }

    const stream = createSseStream(req, res, {
      connected: { type: 'connected', clientType, message: 'Client event stream connected' },
      pingIntervalMs: 0,
    });

    const onThemeUpdated = (newTheme) => {
      stream.write({ type: 'theme_updated', theme: newTheme });
    };

    // Function ส่ง LPR event เฉพาะ gate/direction/camera ที่ subscribe
    const onLprDetected = (event) => {
      if (normalizedGateId && event.gateId !== normalizedGateId) return;
      if (normalizedDirection && event.direction !== normalizedDirection) return;
      if (normalizedCameraId && event.cameraId !== normalizedCameraId) return;
      stream.write(event);
    };

    // Function refresh heartbeat ระหว่างเปิด SSE ค้างไว้
    const refreshDeviceHeartbeat = async () => {
      if (!normalizedDeviceId || !req.device) return;
      try {
        await updateRegisteredDeviceHeartbeat(normalizedDeviceId, { ip: req.ip });
      } catch (err) {
        console.error('Client event heartbeat failed:', err);
      }
    };
    stream.addInterval(() => {
      refreshDeviceHeartbeat();
      stream.write({ type: 'ping', at: new Date().toISOString() });
    }, 25 * 1000);

    appEvents.on('theme_updated', onThemeUpdated);
    appEvents.on('lpr_detected', onLprDetected);
    stream.addCleanup(() => {
      appEvents.off('theme_updated', onThemeUpdated);
      appEvents.off('lpr_detected', onLprDetected);
    });
  } catch (err) {
    next(err);
  }
});

// Export Router
module.exports = router;
