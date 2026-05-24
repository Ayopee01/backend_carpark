const express = require('express');
const router = express.Router();
const paymentRepo = require('../data/repositories/paymentSettings.repo');
const { getExpectedConfigVersion } = require('../data/repositories/config.repo');
const { authorize } = require('../middleware/permission');

// Payment settings access is driven by members.permissions.
router.use(authorize('pricing'));

// หมวดวิธีการชำระเงิน (Global Payment Methods)
router.get('/methods', async (req, res, next) => {
  try {
    const methods = await paymentRepo.listMethodsWithMeta();
    res.json(methods);
  } catch (err) {
    next(err);
  }
});

// Route update payment method ตาม id
router.patch('/methods/:id', async (req, res, next) => {
  try {
    const method = await paymentRepo.updateMethod(req.params.id, req.body, getExpectedConfigVersion(req));
    if (!method) return res.status(404).json({ message: 'Method not found' });
    res.json({ message: 'Payment method updated', method });
  } catch (err) {
    next(err);
  }
});

// หมวดช่องทางบริการ (Service Channels Mapping)
router.get('/channels', async (req, res, next) => {
  try {
    const channels = await paymentRepo.listChannelsWithMeta();
    res.json(channels);
  } catch (err) {
    next(err);
  }
});

// Route update mapping วิธีชำระเงินที่อนุญาตในแต่ละ service channel
router.patch('/channels/:id', async (req, res, next) => {
  try {
    const { allowedMethods } = req.body;
    const channel = await paymentRepo.updateChannelMapping(req.params.id, allowedMethods, getExpectedConfigVersion(req));
    if (!channel) return res.status(404).json({ message: 'Channel not found or invalid methods' });
    res.json({ message: 'Channel mapping updated', channel });
  } catch (err) {
    next(err);
  }
});

// Export router
module.exports = router;

