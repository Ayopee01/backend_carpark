// Import Require
const express = require('express');
const {
  calculatePricing,
  createPricingRule,
  deletePricingRule,
  getPricingConfig,
  updatePricingConfig,
  updatePricingRule
} = require('../data/repositories/servicePricing.repo');
const { authorize } = require('../middleware/permission');

const router = express.Router();

router.use(authorize(['super_admin', 'staff'], 'pricing'));

// Route query pricing config
router.get('/config', async (req, res, next) => {
  try {
    const config = await getPricingConfig();
    res.json(config);
  } catch (err) {
    next(err);
  }
});

// Route update pricing config
router.put('/config', async (req, res, next) => {
  try {
    const config = await updatePricingConfig(req.body || {});
    res.json({ message: 'Pricing config updated', config });
  } catch (err) {
    next(err);
  }
});

// Route preview pricing calculation from current rules
router.post('/calculate', async (req, res, next) => {
  try {
    const payload = req.body || {};
    if (!payload.entryAt) {
      return res.status(400).json({ message: 'entryAt is required' });
    }

    const result = await calculatePricing(payload);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Route create pricing rule
router.post('/rules', async (req, res, next) => {
  try {
    const payload = req.body || {};
    if (!payload.serviceType || !payload.vehicleType || payload.price === undefined) {
      return res.status(400).json({ message: 'serviceType, vehicleType, and price are required' });
    }

    const rule = await createPricingRule(payload);
    res.status(201).json({ message: 'Pricing rule created', rule });
  } catch (err) {
    next(err);
  }
});

// Route update pricing rule
router.patch('/rules/:id', async (req, res, next) => {
  try {
    const rule = await updatePricingRule(req.params.id, req.body || {});
    if (!rule) return res.status(404).json({ message: 'Pricing rule not found' });

    res.json({ message: 'Pricing rule updated', rule });
  } catch (err) {
    next(err);
  }
});

// Route delete pricing rule
router.delete('/rules/:id', async (req, res, next) => {
  try {
    const rule = await deletePricingRule(req.params.id);
    if (!rule) return res.status(404).json({ message: 'Pricing rule not found' });

    res.json({ message: 'Pricing rule deleted', rule });
  } catch (err) {
    next(err);
  }
});

// Export router
module.exports = router;
