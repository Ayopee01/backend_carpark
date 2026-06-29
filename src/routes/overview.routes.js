// Import Require
const express = require('express');
const { getOverviewSummary } = require('../services/overview.service');
const { authorize } = require('../middleware/permission');
const appEvents = require('../utils/events');
const { createSseStream } = require('../utils/sse');

const router = express.Router();
const OVERVIEW_STREAM_INTERVAL_MS = Number(process.env.OVERVIEW_STREAM_INTERVAL_MS || 10000);

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

// Route SSE stream overview summary updates ตามช่วงวันที่ที่ frontend ส่งมา
router.get('/events', async (req, res, next) => {
  try {
    const initialResult = await getOverviewSummary(req.query);
    if (!initialResult.ok && initialResult.reason === 'invalid_date') {
      return res.status(400).json({ message: 'Invalid start_date or end_date' });
    }

    let isSending = false;
    const stream = createSseStream(req, res, {
      connected: { type: 'connected', message: 'Overview event stream connected' },
    });

    const sendSummary = async (type = 'overview_summary', trigger = null, preloadedData = null) => {
      if (stream.isClosed() || isSending) return;
      isSending = true;

      try {
        const data = preloadedData || (await getOverviewSummary(req.query)).data;
        stream.write({
          type,
          trigger,
          data,
          generatedAt: new Date().toISOString(),
        });
      } catch (err) {
        stream.write({
          type: 'overview_error',
          message: err.message || 'Unable to refresh overview summary',
          generatedAt: new Date().toISOString(),
        });
      } finally {
        isSending = false;
      }
    };

    await sendSummary('overview_snapshot', null, initialResult.data);
    stream.addInterval(() => sendSummary('overview_summary', { reason: 'interval' }), OVERVIEW_STREAM_INTERVAL_MS);

    const onOverviewUpdated = (event) => {
      sendSummary('overview_updated', event);
    };

    appEvents.on('dashboard_updated', onOverviewUpdated);
    stream.addCleanup(() => appEvents.off('dashboard_updated', onOverviewUpdated));
  } catch (err) {
    next(err);
  }
});

// Export router
module.exports = router;
