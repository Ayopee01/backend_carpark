const express = require('express');
const router = express.Router();
const paymentRepo = require('../data/repositories/paymentSettings.repo');
const { authorize } = require('../middleware/permission');

// Payment settings access is driven by members.permissions.
router.use(authorize('pricing'));

// Global payment methods.
router.get('/methods', async (req, res, next) => {
  try {
    const methods = await paymentRepo.listMethodsWithMeta();
    res.json(methods);
  } catch (err) {
    next(err);
  }
});

router.patch('/methods/:id', async (req, res, next) => {
  try {
    const method = await paymentRepo.updateMethod(req.params.id, req.body);
    if (!method) return res.status(404).json({ message: 'Method not found' });
    res.json({ success: true, message: 'Payment method updated' });
  } catch (err) {
    next(err);
  }
});

router.delete('/methods/:id', async (req, res, next) => {
  try {
    const deleted = await paymentRepo.deleteMethod(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Method not found' });
    res.json({ success: true, message: 'Payment method deleted' });
  } catch (err) {
    next(err);
  }
});

// Service channel mappings.
router.get('/channels', async (req, res, next) => {
  try {
    const channels = await paymentRepo.listChannelsWithMeta();
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
    res.json({ success: true, message: 'Channel mapping updated' });
  } catch (err) {
    next(err);
  }
});

router.delete('/channels/:id', async (req, res, next) => {
  try {
    const deleted = await paymentRepo.deleteChannel(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Channel not found' });
    res.json({ success: true, message: 'Payment channel deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
