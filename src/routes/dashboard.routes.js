// Import Require
const express = require('express');
const { getDashboardSummary } = require('../services/dashboard.service');
const { authorize } = require('../middleware/permission');
const appEvents = require('../utils/events');
const { createSseStream } = require('../utils/sse');

const router = express.Router();
const DASHBOARD_STREAM_INTERVAL_MS = Number(process.env.DASHBOARD_STREAM_INTERVAL_MS || 10000);

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

// Route SSE stream dashboard summary updates.
router.get('/events', async (req, res, next) => {
  try {
    const currentUserId = req.user.id;
    let isSending = false;
    const stream = createSseStream(req, res, {
      connected: { type: 'connected', message: 'Dashboard event stream connected' },
    });

    const sendSummary = async (type = 'dashboard_summary', trigger = null) => {
      if (stream.isClosed() || isSending) return;
      isSending = true;

      try {
        const summary = await getDashboardSummary(currentUserId);
        stream.write({
          type,
          trigger,
          data: summary,
          generatedAt: new Date().toISOString(),
        });
      } catch (err) {
        stream.write({
          type: 'dashboard_error',
          message: err.message || 'Unable to refresh dashboard summary',
          generatedAt: new Date().toISOString(),
        });
      } finally {
        isSending = false;
      }
    };

    await sendSummary('dashboard_snapshot');
    stream.addInterval(() => sendSummary('dashboard_summary', { reason: 'interval' }), DASHBOARD_STREAM_INTERVAL_MS);

    const onDashboardUpdated = (event) => {
      sendSummary('dashboard_updated', event);
    };

    appEvents.on('dashboard_updated', onDashboardUpdated);
    stream.addCleanup(() => appEvents.off('dashboard_updated', onDashboardUpdated));
  } catch (err) {
    next(err);
  }
});

// Export router
module.exports = router;
