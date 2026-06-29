const express = require('express');
const {
  listTransactions,
  lookupTransactionApiByPlateNo,
  processPaymentByPlateNo,
  updateTransactionByPlateNo,
  deleteTransactionByPlateNo,
} = require('../data/repositories/transactions.repo');
const { authorize } = require('../middleware/permission');
const { createTransactionFromCamera } = require('../services/transactions.service');
const { validateCameraTransactionPayload } = require('../validators/transactions.validator');
const { validateCameraGateBinding } = require('../data/repositories/barrierGates.repo');
const appEvents = require('../utils/events');
const { createSseStream } = require('../utils/sse');

const router = express.Router();
const TRANSACTIONS_STREAM_INTERVAL_MS = Number(process.env.TRANSACTIONS_STREAM_INTERVAL_MS || 10000);

// Function แปลง transaction เป็น response หลัง admin payment
function toAdminPaymentResponse(transaction) {
  const latestPayment = Array.isArray(transaction.payments) && transaction.payments.length
    ? transaction.payments[transaction.payments.length - 1]
    : null;

  return {
    transaction: {
      transactionId: transaction.id,
      billNo: transaction.billNo,
      plateNo: transaction.plateNo,
      vehicleType: transaction.vehicleType,
      status: transaction.status,
    },
    payment: latestPayment ? {
      paymentId: latestPayment.id,
      method: latestPayment.method,
      channel: latestPayment.channel,
      paidAmount: latestPayment.paidAmount,
      paidAt: latestPayment.paidAt,
      processedBy: latestPayment.processedBy,
    } : null,
    amount: {
      netAmount: transaction.netAmount,
      paidAmount: transaction.totalPaid,
      remainingAmount: transaction.remainingAmount,
    },
    parking: {
      entryAt: transaction.entryAt,
      exitTimeLimit: transaction.exitTimeLimit,
      isOverstay: transaction.isOverstay,
      durationDisplay: transaction.serviceDisplay,
      totalMinutes: transaction.totalMinutes,
    },
  };
}

// Function แปลง transaction เป็น item สำหรับ list
function toTransactionListItem(transaction) {
  const latestPayment = Array.isArray(transaction.payments) && transaction.payments.length
    ? transaction.payments[transaction.payments.length - 1]
    : null;

  return {
    id: transaction.id,
    billNo: transaction.billNo,
    plateNo: transaction.plateNo,
    vehicleType: transaction.vehicleType,
    status: transaction.status,
    entryAt: transaction.entryAt,
    exitAt: transaction.exitAt,
    exitTimeLimit: transaction.exitTimeLimit,
    isOverstay: transaction.isOverstay,
    amount: {
      net: transaction.netAmount,
      paid: transaction.totalPaid,
      remaining: transaction.remainingAmount,
    },
    duration: {
      display: transaction.serviceDisplay,
      hours: transaction.durationHour,
      totalMinutes: transaction.totalMinutes,
    },
    latestPayment: latestPayment ? {
      paymentId: latestPayment.id,
      method: latestPayment.method,
      channel: latestPayment.channel,
      paidAmount: latestPayment.paidAmount,
      paidAt: latestPayment.paidAt,
    } : null,
    updatedAt: transaction.updatedAt,
  };
}

// Function อ่าน filter list transaction จาก query
function getTransactionListFilters(query = {}) {
  const { keyword, plate_no: plateNo, bill_no: billNo, page = 1, per_page = 10, all } = query;
  return {
    keyword,
    plateNo,
    billNo,
    all: all === 'true' || all === '1',
    page: parseInt(page),
    perPage: parseInt(per_page)
  };
}

// Function สร้าง response list transaction พร้อม meta
async function getTransactionListResponse(query = {}) {
  const result = await listTransactions(getTransactionListFilters(query));
  return {
    data: result.data.map(toTransactionListItem),
    meta: {
      ...result.meta,
      realtime: true,
    },
  };
}

// Apply permission check สำหรับ transactions
router.use(authorize('transactions'));

// Route list/search transactions พร้อม pagination จาก query
router.get('/', async (req, res, next) => {
  try {
    res.json(await getTransactionListResponse(req.query));
  } catch (err) {
    next(err);
  }
});

// Route SSE stream สำหรับ transaction list
router.get('/events', async (req, res, next) => {
  try {
    let isSending = false;
    const stream = createSseStream(req, res, {
      connected: { type: 'connected', message: 'Transactions event stream connected' },
    });

    const sendTransactions = async (type = 'transactions_list', trigger = null) => {
      if (stream.isClosed() || isSending) return;
      isSending = true;

      try {
        const data = await getTransactionListResponse(req.query);
        stream.write({
          type,
          trigger,
          data,
          generatedAt: new Date().toISOString(),
        });
      } catch (err) {
        stream.write({
          type: 'transactions_error',
          message: err.message || 'Unable to refresh transactions list',
          generatedAt: new Date().toISOString(),
        });
      } finally {
        isSending = false;
      }
    };

    await sendTransactions('transactions_snapshot');
    stream.addInterval(() => sendTransactions('transactions_list', { reason: 'interval' }), TRANSACTIONS_STREAM_INTERVAL_MS);

    const onTransactionsUpdated = (event) => {
      sendTransactions('transactions_updated', event);
    };

    appEvents.on('dashboard_updated', onTransactionsUpdated);
    stream.addCleanup(() => appEvents.off('dashboard_updated', onTransactionsUpdated));
  } catch (err) {
    next(err);
  }
});

// Route handler สำหรับ payload จาก camera/LPR
// Request body รับ plateNo, cameraId, gateId, direction, capturedAt, imageUrl
async function handleCameraTransactionRequest(req, res, next) {
  try {
    const validation = validateCameraTransactionPayload(req.body);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        action: 'VALIDATION_ERROR',
        message: 'ข้อมูลไม่ถูกต้อง',
        errors: validation.errors,
      });
    }

    if (req.device?.deviceType === 'camera' && validation.dto.cameraId !== req.device.deviceId) {
      return res.status(400).json({
        success: false,
        action: 'CAMERA_ID_MISMATCH',
        message: 'cameraId must match authenticated camera deviceId',
      });
    }

    const binding = await validateCameraGateBinding(validation.dto);
    if (!binding.ok) {
      return res.status(binding.statusCode || 400).json({
        success: false,
        action: 'CAMERA_GATE_VALIDATION_ERROR',
        message: binding.message,
        reason: binding.reason,
      });
    }

    const result = await createTransactionFromCamera(validation.dto);

    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
}

router.post('/', handleCameraTransactionRequest);

// Route get one transaction by plateNo.
router.get('/:plateNo', async (req, res, next) => {
  try {
    const lookup = await lookupTransactionApiByPlateNo(req.params.plateNo);
    if (lookup.matchType === 'invalid') return res.status(400).json({ message: lookup.message });
    if (lookup.matchType === 'multiple') return res.json(lookup);

    const transaction = lookup.transaction;
    if (!transaction) return res.status(404).json({ message: 'Not found' });
    res.json(transaction);
  } catch (err) {
    next(err);
  }
});

// Route confirm payment by plateNo from path.
router.post('/:plateNo/payment', async (req, res, next) => {
  try {
    const { plateNo, method, channel, amount, deviceId, deviceType, deviceName, deviceLocation } = req.body;
    const processedBy = req.user.id;
    const pathPlateNo = req.params.plateNo;
    
    const updated = await processPaymentByPlateNo(pathPlateNo, {
      plateNo,
      method, 
      channel, 
      amount, 
      processedBy,
      device: deviceId ? {
        deviceId,
        deviceType: deviceType || (channel === 'gate' ? 'barrier_gate' : channel) || 'unknown',
        deviceName,
        deviceLocation,
      } : null,
    });

    if (!updated) return res.status(404).json({ message: 'Transaction not found' });
    
    res.json({
      message: 'Payment confirmed successfully',
      data: toAdminPaymentResponse(updated),
    });
  } catch (err) {
    next(err);
  }
});

// Route update transaction fields by plateNo.
router.patch('/:plateNo', async (req, res, next) => {
  try {
    const updated = await updateTransactionByPlateNo(req.params.plateNo, req.body);
    if (!updated) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Updated successfully', transaction: updated });
  } catch (err) {
    next(err);
  }
});

// Route update transaction status by plateNo.
router.patch('/:plateNo/status', async (req, res, next) => {
  try {
    const updated = await updateTransactionByPlateNo(req.params.plateNo, req.body);
    if (!updated) return res.status(404).json({ message: 'Not found' });
    res.json({
      success: true,
      message: 'Transaction status updated successfully',
      status: updated.status,
    });
  } catch (err) {
    next(err);
  }
});


// Route delete transaction by plateNo.
router.delete('/:plateNo', async (req, res, next) => {
  try {
    const success = await deleteTransactionByPlateNo(req.params.plateNo);
    if (!success) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    next(err);
  }
});

// Export Router
module.exports = router;
// Export handler สำหรับ camera route ก่อน admin auth
module.exports.handleCameraTransactionRequest = handleCameraTransactionRequest;

