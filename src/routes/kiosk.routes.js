// Import Require
const express = require('express');
const {
  createTransaction,
  getTransactionApiById,
  getTransactionApiByPlateNo,
  listTransactions,
  processPayment,
} = require('../data/repositories/transactions.repo');
const {
  activateKiosk,
  searchKiosk,
  updateKioskStatus,
} = require('../data/repositories/kiosks.repo');
const { getConfig } = require('../data/repositories/config.repo');
const defaults = require('../data/defaults');
const appEvents = require('../utils/events');

const router = express.Router();

// Route SSE สำหรับส่ง event update ไปยัง kiosk
router.get('/events', async (req, res, next) => {
  try {
    const { deviceId } = req.query;
    if (deviceId) {
      const kiosk = await searchKiosk(deviceId);
      if (!kiosk) return res.status(401).json({ message: 'Unauthorized device' });
      if (kiosk.status === 'maintenance') return res.status(403).json({ message: 'This kiosk is currently under maintenance', status: kiosk.status });
      await updateKioskStatus(deviceId, { ip: req.ip });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'SSE Connection Established' })}\n\n`);

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

// Route kiosk สร้างรายการรถเข้าและออกบิล
router.post('/entry', async (req, res, next) => {
  try {
    const { deviceId, plateNo, vehicleType } = req.body;
    if (!deviceId) return res.status(400).json({ message: 'deviceId is required' });
    if (!plateNo) return res.status(400).json({ message: 'plateNo is required' });

    const kiosk = await searchKiosk(deviceId);
    if (!kiosk || kiosk.status === 'maintenance') {
      return res.status(403).json({ message: 'Invalid kiosk or currently under maintenance' });
    }

    const newTransaction = await createTransaction({
      plateNo,
      vehicleType: vehicleType || 'car',
      serviceType: 'parking',
    });
    const systemSettings = await getConfig('system_settings', defaults.systemSettings);

    await updateKioskStatus(deviceId, { ip: req.ip });

    return res.status(201).json({
      message: 'Entry bill created successfully',
      transaction: newTransaction,
      kiosk: {
        deviceId: kiosk.deviceId,
        name: kiosk.name,
        location: kiosk.location,
        status: 'online',
      },
      receiptConfig: systemSettings.receipt?.entryBill || {},
    });
  } catch (err) {
    next(err);
  }
});

// Route kiosk check-in เพื่อ update lastSeen และสถานะ online
router.post('/check-in', async (req, res, next) => {
  try {
    const { deviceId, name, location, version } = req.body;
    if (!deviceId) return res.status(400).json({ message: 'deviceId is required' });

    const current = await searchKiosk(deviceId);
    if (!current) return res.status(401).json({ message: 'Invalid or unregistered deviceId' });
    if (current.status === 'maintenance') {
      return res.status(403).json({
        message: 'This kiosk is currently under maintenance. Check-in is disabled.',
        status: current.status,
      });
    }

    const kiosk = await updateKioskStatus(deviceId, {
      name,
      location,
      version,
      ip: req.ip,
    });

    return res.json({
      message: 'Check-in successful',
      status: kiosk.status,
      kiosk,
    });
  } catch (err) {
    next(err);
  }
});

// Route activate kiosk ด้วย activation code
router.post('/activate', async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: 'Activation code is required' });

    const result = await activateKiosk(code);
    if (!result.success) return res.status(400).json(result);

    return res.json(result);
  } catch (err) {
    next(err);
  }
});

// Route query config สำหรับ kiosk
router.get('/config', async (req, res, next) => {
  try {
    const { deviceId } = req.query;
    let status = 'unregistered';

    if (deviceId) {
      const kiosk = await searchKiosk(deviceId);
      if (!kiosk) return res.status(401).json({ message: 'Invalid or unregistered deviceId' });
      if (kiosk.status !== 'maintenance') {
        const updated = await updateKioskStatus(deviceId, { ip: req.ip });
        status = updated.status;
      } else {
        status = kiosk.status;
      }
    }

    const currentTheme = await getConfig('theme', defaults.theme);
    const systemSettings = await getConfig('system_settings', defaults.systemSettings);

    return res.json({
      theme: {
        themeColor: currentTheme.themeColor ?? null,
        logoUrl: currentTheme.logoUrl ?? null,
        themeMode: currentTheme.themeMode ?? '',
        customThemeColor: currentTheme.customThemeColor ?? null,
        updatedAt: currentTheme.updatedAt || null,
      },
      systemName: systemSettings.general?.systemName,
      status,
    });
  } catch (err) {
    next(err);
  }
});

// Route ค้นหา transaction ที่ยังค้างชำระด้วยทะเบียนรถ
router.get('/search', async (req, res, next) => {
  try {
    const { plateNo, deviceId } = req.query || {};
    if (!plateNo) return res.status(400).json({ message: 'plateNo is required in query' });
    if (deviceId) {
      const kiosk = await searchKiosk(deviceId);
      if (!kiosk) return res.status(401).json({ message: 'Invalid or unregistered deviceId' });
      if (kiosk.status === 'maintenance') {
        return res.status(403).json({ message: 'This kiosk is currently under maintenance', status: kiosk.status });
      }
      await updateKioskStatus(deviceId, { ip: req.ip });
    }

    // Search only transactions that can still be paid from kiosk/mobile.
    const result = await listTransactions({ plateNo, status: ['pending', 'partially_paid'] });
    return res.json({
      count: result.meta ? result.meta.total : result.data.length,
      items: result.data,
    });
  } catch (err) {
    next(err);
  }
});

// Route query transaction รายการเดียวสำหรับ kiosk payment
router.get('/transaction', async (req, res, next) => {
  try {
    const { plateNo, deviceId } = req.query || {};
    if (!plateNo) return res.status(400).json({ message: 'plateNo is required in query' });
    if (deviceId) {
      const kiosk = await searchKiosk(deviceId);
      if (!kiosk) return res.status(401).json({ message: 'Invalid or unregistered deviceId' });
      if (kiosk.status === 'maintenance') {
        return res.status(403).json({ message: 'This kiosk is currently under maintenance', status: kiosk.status });
      }
      await updateKioskStatus(deviceId, { ip: req.ip });
    }

    const transaction = await getTransactionApiByPlateNo(plateNo, { payableOnly: true });
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });
    if (transaction.status === 'completed' || transaction.status === 'cancelled') {
      return res.status(403).json({ message: 'This transaction is already processed' });
    }

    return res.json(transaction);
  } catch (err) {
    next(err);
  }
});

router.get('/transaction/:id', async (req, res, next) => {
  try {
    const { deviceId } = req.query || {};
    if (deviceId) {
      const kiosk = await searchKiosk(deviceId);
      if (!kiosk) return res.status(401).json({ message: 'Invalid or unregistered deviceId' });
      if (kiosk.status === 'maintenance') {
        return res.status(403).json({ message: 'This kiosk is currently under maintenance', status: kiosk.status });
      }
      await updateKioskStatus(deviceId, { ip: req.ip });
    }

    const transaction = await getTransactionApiById(req.params.id);
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });
    if (transaction.status === 'completed' || transaction.status === 'cancelled') {
      return res.status(403).json({ message: 'This transaction is already processed' });
    }

    return res.json(transaction);
  } catch (err) {
    next(err);
  }
});

// Route รับชำระเงินจาก kiosk
router.post('/payment', async (req, res, next) => {
  try {
    const { transactionId, plateNo, method, amount, deviceId } = req.body;
    if (!transactionId && !plateNo) return res.status(400).json({ message: 'transactionId or plateNo is required' });

    let onlineKiosk = null;
    if (deviceId) {
      const kiosk = await searchKiosk(deviceId);
      if (!kiosk) return res.status(401).json({ message: 'Invalid or unregistered deviceId' });
      if (kiosk.status === 'maintenance') {
        return res.status(403).json({
          message: 'This kiosk is currently under maintenance. Payment is disabled.',
          status: kiosk.status,
        });
      }
      onlineKiosk = await updateKioskStatus(deviceId, { ip: req.ip });
    }

    const result = await processPayment(transactionId, {
      plateNo,
      method: method || 'qr_code',
      channel: 'kiosk',
      amount,
      processedBy: deviceId ? `kiosk_${deviceId}` : 'system_kiosk',
      device: onlineKiosk ? {
        deviceId: onlineKiosk.deviceId,
        deviceType: 'kiosk',
        deviceName: onlineKiosk.name,
        deviceLocation: onlineKiosk.location,
      } : null,
    });

    if (!result) return res.status(400).json({ message: 'Payment processing failed' });

    return res.json({
      message: 'Payment received successfully',
      transaction: result,
      ...(onlineKiosk ? { kiosk: {
        deviceId: onlineKiosk.deviceId,
        name: onlineKiosk.name,
        location: onlineKiosk.location,
        status: onlineKiosk.status,
      } } : {}),
    });
  } catch (err) {
    next(err);
  }
});

// Export router
module.exports = router;
