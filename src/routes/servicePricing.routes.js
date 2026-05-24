// Import Require
const express = require('express');
const {
  createPricingConfigItem,
  deletePricingConfigItem,
  getPricingConfigWithMeta,
  updatePricingConfig,
  updatePricingConfigItem,
} = require('../data/repositories/servicePricing.repo');
const { getExpectedConfigVersion } = require('../data/repositories/config.repo');
const { authorize } = require('../middleware/permission');

const router = express.Router();

// Service pricing config is an admin area and requires auth + pricing permission.
router.use(authorize('pricing'));

// Route query all pricing config.
router.get('/config', async (req, res, next) => {
  try {
    const configWithMeta = await getPricingConfigWithMeta();
    res.json(configWithMeta);
  } catch (err) {
    next(err);
  }
});

// Route update pricing config as one config object.
router.put('/config', async (req, res, next) => {
  try {
    const config = await updatePricingConfig(req.body || {}, getExpectedConfigVersion(req));
    res.json({ message: 'Pricing config updated', config });
  } catch (err) {
    next(err);
  }
});

// Route add one pricing config item.
router.post('/config', async (req, res, next) => {
  try {
    const payload = req.body || {};
    if (payload.price === undefined) {
      return res.status(400).json({ message: 'price is required' });
    }

    const config = await createPricingConfigItem(payload, getExpectedConfigVersion(req));
    res.status(201).json({ message: 'Pricing config item created', config });
  } catch (err) {
    next(err);
  }
});

// Route update one pricing config item by id.
router.patch('/config/:id', async (req, res, next) => {
  try {
    const config = await updatePricingConfigItem(req.params.id, req.body || {}, getExpectedConfigVersion(req));
    if (!config) return res.status(404).json({ message: 'Pricing config item not found' });

    res.json({ message: 'Pricing config item updated', config });
  } catch (err) {
    next(err);
  }
});

// Route delete one pricing config item by id.
router.delete('/config/:id', async (req, res, next) => {
  try {
    const config = await deletePricingConfigItem(req.params.id, getExpectedConfigVersion(req));
    if (!config) return res.status(404).json({ message: 'Pricing config item not found' });

    res.json({
      success: true,
      status: 'delete_success',
      message: 'Pricing config item deleted successfully',
      config,
    });
  } catch (err) {
    next(err);
  }
});

// Export router
module.exports = router;
