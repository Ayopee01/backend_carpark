const express = require('express');
const { authorize } = require('../middleware/permission');
const { createOmiseChargeForAdmin, getOmiseQrImage } = require('../services/paymentGateway.service');

const router = express.Router();

router.use(authorize('transactions'));

router.post('/omise/charge', async (req, res, next) => {
  try {
    const result = await createOmiseChargeForAdmin({
      transactionId: req.body?.transactionId,
      plateNo: req.body?.plateNo,
      source: req.body?.source,
      token: req.body?.token,
      sourceType: req.body?.sourceType,
      method: req.body?.method,
      channel: req.body?.channel || 'cashier',
      amount: req.body?.amount,
      processedBy: req.user?.id,
      returnUri: req.body?.returnUri,
    });

    return res.status(201).json({
      message: 'created',
      charge: result,
    });
  } catch (err) {
    if (err.provider === 'omise') {
      return res.status(err.statusCode || 502).json({
        message: err.message,
        provider: err.provider,
        code: err.code,
        location: err.location,
      });
    }
    if (err.statusCode === 409 && err.candidates) {
      return res.status(409).json({
        message: err.message,
        matchType: 'multiple',
        requiresSelection: true,
        candidates: err.candidates,
      });
    }
    next(err);
  }
});

router.get('/omise/qr', async (req, res, next) => {
  try {
    const image = await getOmiseQrImage({
      chargeId: req.query.chargeId,
      documentPath: req.query.documentPath,
    });
    res.setHeader('Content-Type', image.contentType || 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(image.body);
  } catch (err) {
    if (err.provider === 'omise') {
      return res.status(err.statusCode || 502).json({
        message: err.message,
        provider: err.provider,
        code: err.code,
        location: err.location,
      });
    }
    next(err);
  }
});

module.exports = router;
