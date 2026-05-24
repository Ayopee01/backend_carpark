// Import Require
const express = require('express');
const { getDashboardSummary } = require('../services/dashboard.service');
const { authorize } = require('../middleware/permission');

const router = express.Router();

// Apply permission check สำหรับหน้า dashboard
router.use(authorize('dashboard'));

// Route query dashboard summary ของวันนี้
router.get('/', async (req, res, next) => {
  try {
    const currentUserId = req.user.id;
    const summary = await getDashboardSummary(currentUserId);
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

// Export router
module.exports = router;
