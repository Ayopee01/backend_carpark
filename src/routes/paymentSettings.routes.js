const express = require('express');
const router = express.Router();
const paymentRepo = require('../data/repositories/paymentSettings.repo');
const { authorize } = require('../middleware/permission');

// Payment settings are restricted to super_admin or staff with pricing permission
router.use(authorize(['super_admin', 'staff'], 'pricing'));

// หมวดวิธีการชำระเงิน (Global Payment Methods)
router.get('/methods', async (req, res, next) => {
  try {
    const methods = await paymentRepo.listMethods();
    res.json(methods);
  } catch (err) {
    next(err);
  }
});

router.patch('/methods/:id', async (req, res, next) => {
  try {
    const method = await paymentRepo.updateMethod(req.params.id, req.body);
    if (!method) return res.status(404).json({ message: 'Method not found' });
    res.json({ message: 'Payment method updated', method });
  } catch (err) {
    next(err);
  }
});

// หมวดช่องทางบริการ (Service Channels Mapping)
router.get('/channels', async (req, res, next) => {
  try {
    const channels = await paymentRepo.listChannels();
    res.json(channels);
  } catch (err) {
    next(err);
  }
});

router.patch('/channels/:id', async (req, res, next) => {
  try {
    const { allowedMethods } = req.body;
    const channel = await paymentRepo.updateChannelMapping(req.params.id, allowedMethods);
    if (!channel) return res.status(404).json({ message: 'Channel not found or invalid methods' });
    res.json({ message: 'Channel mapping updated', channel });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

