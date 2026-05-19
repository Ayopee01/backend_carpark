// Import Require
const express = require('express');
const { getDashboardSummary } = require('../services/dashboard.service');
const { authorize } = require('../middleware/permission');

const router = express.Router();

router.use(authorize(['super_admin', 'staff'], 'dashboard'));

// Route query dashboard summary ของวันนี้
router.get('/', async (req, res, next) => {
  try {
    const currentUserId = req.user?.id || 'u1';
    const summary = await getDashboardSummary(currentUserId);
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

// Export router
module.exports = router;
