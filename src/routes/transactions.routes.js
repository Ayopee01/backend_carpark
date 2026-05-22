const express = require('express');
const { listTransactions, getTransactionApiByIdOrPlateNo, processPayment, updateTransaction, deleteTransaction } = require('../data/repositories/transactions.repo');
const { authorize } = require('../middleware/permission');
const { createTransactionFromCamera } = require('../services/transactions.service');
const { validateCameraTransactionPayload } = require('../validators/transactions.validator');

const router = express.Router();

// Apply permission check to all transaction routes.
// All roles (super_admin, staff) can access, but staff must have 'transactions' permission.
router.use(authorize(['super_admin', 'staff'], 'transactions'));

// Route list/search transactions with pagination controlled by frontend query params.
router.get('/', async (req, res, next) => {
  try {
    const { keyword, plate_no: plateNo, bill_no: billNo, page = 1, per_page = 10, all } = req.query;
    const shouldReturnAll = all === 'true' || all === '1';
    
    // Page 3: Operation list (Usually shows all or searchable)
    const result = await listTransactions({
      keyword,
      plateNo,
      billNo,
      all: shouldReturnAll,
      page: parseInt(page),
      perPage: parseInt(per_page)
    });

    res.json({
      title: 'ตรวจสอบและชำระเงิน',
      subtitle: 'แอดมินบริการ',
      meta: {
        totalFound: result.meta.total,
        realtime: true
      },

      ...result
    });
  } catch (err) {
    next(err);
  }
});

// Route create transaction from camera/LPR body payload.
// Request body receives plateNo, cameraId, gateId, direction, capturedAt, confidence, imageUrl.
router.post('/', async (req, res, next) => {
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

    const result = await createTransactionFromCamera(validation.dto);

    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
});

// Route confirm payment by plateNo from body. Kept for backwards compatibility.
router.post('/payment', async (req, res, next) => {
  try {
    const { plateNo, method, channel, amount, deviceId, deviceType, deviceName, deviceLocation } = req.body;
    if (!plateNo) return res.status(400).json({ message: 'plateNo is required' });

    const processedBy = req.user?.id || 'u1';
    const updated = await processPayment(null, {
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

    if (!updated) return res.status(404).json({ message: 'Transaction not found for plateNo' });

    res.json({
      message: 'Payment confirmed successfully',
      transaction: updated
    });
  } catch (err) {
    next(err);
  }
});

// Route get one transaction by transaction id or plateNo.
router.get('/:id', async (req, res, next) => {
  try {
    const transaction = await getTransactionApiByIdOrPlateNo(req.params.id);
    if (!transaction) return res.status(404).json({ message: 'Not found' });
    res.json(transaction);
  } catch (err) {
    next(err);
  }
});

// Route confirm payment by transaction id or plateNo from path.
router.post('/:id/payment', async (req, res, next) => {
  try {
    const { plateNo, method, channel, amount, deviceId, deviceType, deviceName, deviceLocation } = req.body;
    const processedBy = req.user?.id || 'u1';
    
    const updated = await processPayment(req.params.id, { 
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
      transaction: updated 
    });
  } catch (err) {
    next(err);
  }
});

// Route update transaction fields by transaction id or plateNo.
router.patch('/:id', async (req, res, next) => {
  try {
    const updated = await updateTransaction(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Updated successfully', transaction: updated });
  } catch (err) {
    next(err);
  }
});

// Route update transaction status by transaction id or plateNo.
router.patch('/:id/status', async (req, res, next) => {
  try {
    const updated = await updateTransaction(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Updated successfully (legacy endpoint)', transaction: updated });
  } catch (err) {
    next(err);
  }
});


// Route delete transaction by transaction id or plateNo.
router.delete('/:id', async (req, res, next) => {
  try {
    const success = await deleteTransaction(req.params.id);
    if (!success) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

