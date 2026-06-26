const express = require('express');
const omiseService = require('../services/omise.service');
const { isPaymentSimulationEnabled, processOmiseWebhookEvent, simulateOmiseChargePaid, verifyPaymentSimulationToken } = require('../services/paymentGateway.service');

const router = express.Router();

// GET ค่า Config Public Config ของ Omise ให้ Frontend ใช้สร้าง source ผ่าน Omise.js
router.get('/omise/config', (req, res) => {
  const publicKey = process.env.OMISE_PUBLIC_KEY || null;
  res.json({
    provider: 'omise',
    publicKey,
    currency: process.env.OMISE_CURRENCY || 'thb',
  });
});

// Endpoint รับ Webhook จาก Omise เมื่อสถานะการชำระเงินเปลี่ยน และอัปเดต payment ในระบบ
router.post('/omise/webhook', async (req, res, next) => {
  try {
    const verified = omiseService.verifyWebhookSignature(req.rawBody, req.headers);
    if (!verified) return res.status(401).json({ message: 'Invalid Omise webhook signature' });

    const result = await processOmiseWebhookEvent(req.body);
    return res.json({
      received: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

// Endpoint สำหรับทดสอบเท่านั้น ใช้จำลอง Omise charge เป็นจ่ายสำเร็จ
router.post('/omise/simulate-paid', async (req, res, next) => {
  try {
    if (!isPaymentSimulationEnabled()) {
      return res.status(403).json({ message: 'Payment simulation is disabled' });
    }

    const token = req.get('x-simulation-token') || req.body?.simulationToken || '';
    if (!verifyPaymentSimulationToken(token)) {
      return res.status(401).json({ message: 'Invalid payment simulation token' });
    }

    const chargeId = req.body?.chargeId === undefined || req.body?.chargeId === null
      ? ''
      : String(req.body.chargeId).trim();
    const result = await simulateOmiseChargePaid(chargeId);

    return res.json({
      simulated: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
