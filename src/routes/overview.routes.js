// Import Require
const express = require('express');
const { getOverviewSummary } = require('../services/overview.service');
const { authorize } = require('../middleware/permission');

const router = express.Router();

// Apply permission check สำหรับหน้า overview
router.use(authorize('overview'));

// Route query overview summary ตามช่วงวันที่
router.get('/summary', async (req, res, next) => {
  try {
    const result = await getOverviewSummary(req.query);
    if (!result.ok && result.reason === 'invalid_date') {
      return res.status(400).json({ message: 'Invalid start_date or end_date' });
    }

    return res.json(result.data);
  } catch (err) {
    next(err);
  }
});

// Export router
module.exports = router;
