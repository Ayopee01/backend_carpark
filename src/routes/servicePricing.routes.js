// Import Require
const express = require('express');
const {
  createPricingConfigItem,
  deletePricingConfigItem,
  getPricingRulesConfigWithMeta,
  updatePricingConfig,
  updatePricingConfigItem,
} = require('../data/repositories/servicePricing.repo');
const { authorize } = require('../middleware/permission');

const router = express.Router();

// Apply permission check สำหรับ service pricing
router.use(authorize('pricing'));

// Route query pricing config ทั้งหมด
router.get('/config', async (req, res, next) => {
  try {
    const config = await getPricingRulesConfigWithMeta();
    res.json(config);
  } catch (err) {
    next(err);
  }
});

// Route update pricing config ทั้งชุด
router.put('/config', async (req, res, next) => {
  try {
    await updatePricingConfig(req.body || {});
    res.json({ success: true, message: 'Pricing config updated' });
  } catch (err) {
    next(err);
  }
});

// Route add pricing config item
router.post('/config', async (req, res, next) => {
  try {
    const payload = req.body || {};
    if (payload.price === undefined) {
      return res.status(400).json({ message: 'price is required' });
    }

    await createPricingConfigItem(payload);
    res.status(201).json({ success: true, message: 'Pricing config item created' });
  } catch (err) {
    next(err);
  }
});

// Route update pricing config item ด้วย id
router.patch('/config/:id', async (req, res, next) => {
  try {
    const config = await updatePricingConfigItem(req.params.id, req.body || {});
    if (!config) return res.status(404).json({ message: 'Pricing config item not found' });

    res.json({ success: true, message: 'Pricing config item updated' });
  } catch (err) {
    next(err);
  }
});

// Route delete pricing config item ด้วย id
router.delete('/config/:id', async (req, res, next) => {
  try {
    const config = await deletePricingConfigItem(req.params.id);
    if (!config) return res.status(404).json({ message: 'Pricing config item not found' });

    res.json({
      success: true,
      message: 'Pricing config item deleted',
    });
  } catch (err) {
    next(err);
  }
});

// Export Router
module.exports = router;
