// Import Require
const express = require('express');
const { getDashboardSummary } = require('../services/dashboard.service');
const { authorize } = require('../middleware/permission');
const appEvents = require('../utils/events');

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
    let isClosed = false;
    let isSending = false;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const writeEvent = (payload) => {
      if (isClosed) return;
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    const sendSummary = async (type = 'dashboard_summary', trigger = null) => {
      if (isClosed || isSending) return;
      isSending = true;

      try {
        const summary = await getDashboardSummary(currentUserId);
        writeEvent({
          type,
          trigger,
          data: summary,
          generatedAt: new Date().toISOString(),
        });
      } catch (err) {
        writeEvent({
          type: 'dashboard_error',
          message: err.message || 'Unable to refresh dashboard summary',
          generatedAt: new Date().toISOString(),
        });
      } finally {
        isSending = false;
      }
    };

    writeEvent({ type: 'connected', message: 'Dashboard event stream connected' });
    await sendSummary('dashboard_snapshot');

    const keepAlive = setInterval(() => {
      writeEvent({ type: 'ping', at: new Date().toISOString() });
    }, 25 * 1000);

    const refreshInterval = setInterval(() => {
      sendSummary('dashboard_summary', { reason: 'interval' });
    }, DASHBOARD_STREAM_INTERVAL_MS);

    const onDashboardUpdated = (event) => {
      sendSummary('dashboard_updated', event);
    };

    appEvents.on('dashboard_updated', onDashboardUpdated);
    req.on('close', () => {
      isClosed = true;
      clearInterval(keepAlive);
      clearInterval(refreshInterval);
      appEvents.off('dashboard_updated', onDashboardUpdated);
    });
  } catch (err) {
    next(err);
  }
});

// Export router
module.exports = router;
