// Import Require
const express = require('express');
const { getOverviewSummary } = require('../services/overview.service');
const { authorize } = require('../middleware/permission');
const appEvents = require('../utils/events');

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

    const sendSummary = async (type = 'overview_summary', trigger = null, preloadedData = null) => {
      if (isClosed || isSending) return;
      isSending = true;

      try {
        const data = preloadedData || (await getOverviewSummary(req.query)).data;
        writeEvent({
          type,
          trigger,
          data,
          generatedAt: new Date().toISOString(),
        });
      } catch (err) {
        writeEvent({
          type: 'overview_error',
          message: err.message || 'Unable to refresh overview summary',
          generatedAt: new Date().toISOString(),
        });
      } finally {
        isSending = false;
      }
    };

    writeEvent({ type: 'connected', message: 'Overview event stream connected' });
    await sendSummary('overview_snapshot', null, initialResult.data);

    const keepAlive = setInterval(() => {
      writeEvent({ type: 'ping', at: new Date().toISOString() });
    }, 25 * 1000);

    const refreshInterval = setInterval(() => {
      sendSummary('overview_summary', { reason: 'interval' });
    }, OVERVIEW_STREAM_INTERVAL_MS);

    const onOverviewUpdated = (event) => {
      sendSummary('overview_updated', event);
    };

    appEvents.on('dashboard_updated', onOverviewUpdated);
    req.on('close', () => {
      isClosed = true;
      clearInterval(keepAlive);
      clearInterval(refreshInterval);
      appEvents.off('dashboard_updated', onOverviewUpdated);
    });
  } catch (err) {
    next(err);
  }
});

// Export router
module.exports = router;
