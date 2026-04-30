const express = require('express');
const { listTransactions, getTransactionById, processPayment, toTransactionApi, createTransaction } = require('../data/repositories/transactions.repo');
const { updateKioskStatus, activateKiosk } = require('../data/repositories/kiosks.repo');
const { store } = require('../data/store');
const appEvents = require('../utils/events'); // [NEW] นำเข้า Event Emitter สำหรับ Realtime

const router = express.Router();

/**
 * 📡 Kiosk SSE (Server-Sent Events)
 * ท่อรับส่งข้อมูลแบบ Realtime ทางเดียว (Server -> Kiosk) 
 * เพื่อใช้สั่งเปลี่ยนธีมแบบไม่ต้องรีเฟรช
 */
router.get('/events', (req, res) => {
  const { deviceId } = req.query;

  // ถ้าส่ง deviceId มา ให้ตรวจสอบว่าตู้นี้มีจริงไหม
  if (deviceId) {
    const kiosk = store.kiosks.find(k => k.deviceId === deviceId);
    if (!kiosk) {
      return res.status(401).json({ message: 'Unauthorized device' });
    }
  }

  // ตั้งค่า Header ให้เป็น Event Stream
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); // ส่ง Header ไปให้ Client ทันที

  // ส่งข้อความแรกบอกว่าต่อติดแล้ว
  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'SSE Connection Established' })}\n\n`);

  // ฟังก์ชันสำหรับส่งข้อมูลให้ Client เมื่อมีการ Trigger event จากส่วนอื่น
  const onThemeUpdated = (newTheme) => {
    res.write(`data: ${JSON.stringify({ type: 'theme_updated', theme: newTheme })}\n\n`);
  };

  // รับฟังสัญญาณ (Listen) จากเหตุการณ์ theme_updated
  appEvents.on('theme_updated', onThemeUpdated);

  // ทำความสะอาดเมื่อ Client ปิดเว็บ หรือเน็ตหลุด
  req.on('close', () => {
    appEvents.off('theme_updated', onThemeUpdated);
  });
});

/**
 * 🚗 Kiosk Entry (ออกบิลเข้าลานจอด)
 * ตู้ขาเข้าเรียกเส้นนี้เพื่อสร้างรายการจอดรถใหม่
 */
router.post('/entry', async (req, res, next) => {
  try {
    const { deviceId, plateNo, vehicleType } = req.body;

    if (!deviceId) {
      return res.status(400).json({ message: 'deviceId is required' });
    }
    if (!plateNo) {
      return res.status(400).json({ message: 'plateNo is required' });
    }

    const kiosk = store.kiosks.find(k => k.deviceId === deviceId);
    if (!kiosk || kiosk.status === 'maintenance') {
      return res.status(403).json({ message: 'Invalid kiosk or currently under maintenance' });
    }

    // สร้าง Transaction ใหม่
    const newTransaction = await createTransaction({
      plateNo,
      vehicleType: vehicleType || 'car',
      serviceType: 'parking'
    });

    // อัปเดตสถานะการออนไลน์ของตู้
    await updateKioskStatus(deviceId, { ip: req.ip });

    // ส่งคืนข้อมูลบิล พร้อมกับตั้งค่ากระดาษใบเสร็จเพื่อให้ตู้นำไปพิมพ์
    res.status(201).json({
      message: 'Entry bill created successfully',
      transaction: newTransaction,
      receiptConfig: store.systemSettings?.receipt?.entryBill || {}
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 🛰️ Kiosk Check-in (Heartbeat)
 * ตู้ Kiosk เรียกเส้นนี้เพื่อบอกว่ายังออนไลน์อยู่
 */
router.post('/check-in', async (req, res, next) => {
  try {
    const { deviceId, name, location, version } = req.body;
    if (!deviceId) return res.status(400).json({ message: 'deviceId is required' });

    const kiosk = await updateKioskStatus(deviceId, {
      name,
      location,
      version,
      ip: req.ip // เก็บ IP จริงของตู้ไว้ด้วย
    });

    res.json({
      message: 'Check-in successful',
      status: kiosk.status, // [NEW] บอกสถานะตู้กลับไป
      kiosk
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 🔑 Kiosk Activation
 * นำรหัส 6 หลักมาแลกเป็นสิทธิ์การใช้งาน
 */
router.post('/activate', async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: 'Activation code is required' });

    const result = await activateKiosk(code);
    if (!result.success) return res.status(400).json(result);

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * 🎨 Kiosk Config
 * ดึงธีมสีและโลโก้ที่แอดมินตั้งค่าไว้ไปใช้ที่หน้าตู้ (บังคับใช้ deviceId)
 */
router.get('/config', async (req, res, next) => {
  try {
    const { deviceId } = req.query;
    let status = 'unregistered';

    // ถ้าส่ง deviceId มา ให้เช็คสถานะตู้
    if (deviceId) {
      const kiosk = store.kiosks.find(k => k.deviceId === deviceId);
      if (!kiosk) {
        return res.status(401).json({ message: 'Invalid or unregistered deviceId' });
      }
      status = kiosk.status;
    }

    const currentTheme = store.theme || {
      themeColor: '#FFD54F',
      logoUrl: null,
      themeName: 'default',
      updatedAt: null,
    };

    // ส่งออกเฉพาะ field ที่ Kiosk ต้องใช้
    // ไม่ส่ง presets ออกไปใน API นี้
    const kioskTheme = {
      themeColor: currentTheme.themeColor || '#FFD54F',
      logoUrl: currentTheme.logoUrl ?? null,
      themeName: currentTheme.themeName || currentTheme.themeColor || 'default',
      updatedAt: currentTheme.updatedAt || null,
    };

    res.json({
      theme: kioskTheme,
      systemName: 'Smart Carpark Kiosk',
      status,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 🔍 Kiosk Search API
 * ค้นหารถที่ยังจอดอยู่ในอาคาร
 * GET /api/v1/kiosk/search
 * Body:
 * {
 *   "plateNo": "ทน4383"
 * }
 */
router.get('/search', async (req, res, next) => {
  try {
    const { plateNo } = req.body || {};

    if (!plateNo) {
      return res.status(400).json({ message: 'Plate number is required in body' });
    }

    const result = await listTransactions({
      plateNo
    });

    res.json({
      count: result.meta ? result.meta.total : result.data.length,
      items: result.data.map(toTransactionApi)
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 📄 Kiosk Transaction Details
 * ดูรายละเอียดและยอดเงินปัจจุบันของรถคันนั้นๆ
 */
router.get('/transaction/:id', async (req, res, next) => {
  try {
    const transaction = await getTransactionById(req.params.id);
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    // ห้ามดูข้อมูลรถที่ออกไปแล้วผ่านช่องทาง Kiosk เพื่อความเป็นส่วนตัว
    if (transaction.status === 'completed' || transaction.status === 'cancelled') {
      return res.status(403).json({ message: 'This transaction is already processed' });
    }

    res.json(toTransactionApi(transaction));
  } catch (err) {
    next(err);
  }
});

/**
 * 💰 Kiosk Payment API
 * บันทึกการชำระเงินจากตู้ Kiosk (จำลองการรับเงินจากตู้)
 */
router.post('/payment', async (req, res, next) => {
  try {
    const { transactionId, method, amount, deviceId } = req.body;

    // [NEW] ตรวจสอบสถานะตู้ก่อนรับเงิน
    if (deviceId) {
      const kiosk = store.kiosks.find(k => k.deviceId === deviceId);
      if (kiosk && kiosk.status === 'maintenance') {
        return res.status(403).json({
          message: 'This kiosk is currently under maintenance. Payment is disabled.',
          status: 'maintenance'
        });
      }
      await updateKioskStatus(deviceId, { ip: req.ip });
    }

    // บันทึกการจ่ายเงิน โดยระบุช่องทางเป็น 'kiosk'
    const result = await processPayment(transactionId, {
      method: method || 'qr_code',
      channel: 'kiosk',
      amount: amount,
      processedBy: deviceId ? `kiosk_${deviceId}` : 'system_kiosk'
    });

    if (!result) {
      return res.status(400).json({ message: 'Payment processing failed' });
    }

    res.json({
      message: 'Payment received successfully',
      transaction: toTransactionApi(result)
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
