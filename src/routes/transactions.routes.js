const express = require('express');
const { listTransactions, getTransactionApiById, processPayment, updateTransaction, deleteTransaction, createTransaction } = require('../data/repositories/transactions.repo');
const { authorize } = require('../middleware/permission');

const router = express.Router();

// Apply permission check to all routes in this file
// All roles (super_admin, staff) can access, but staff must have 'transactions' permission
router.use(authorize(['super_admin', 'staff'], 'transactions'));

router.get('/', async (req, res, next) => {
  try {
    const { keyword, plate_no: plateNo, bill_no: billNo, page = 1, per_page = 10 } = req.query;
    
    // Page 3: Operation list (Usually shows all or searchable)
    const result = await listTransactions({
      keyword,
      plateNo,
      billNo,
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

router.post('/', async (req, res, next) => {
  try {
    const { plateNo, vehicleType, serviceType, entryAt } = req.body;
    
    if (!plateNo) {
      return res.status(400).json({ message: 'plateNo is required' });
    }

    const newTransaction = await createTransaction({ 
      plateNo, 
      vehicleType, 
      serviceType, 
      entryAt 
    });

    res.status(201).json({ 
      message: 'Entry bill created successfully', 
      transaction: newTransaction 
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const transaction = await getTransactionApiById(req.params.id);
    if (!transaction) return res.status(404).json({ message: 'Not found' });
    res.json(transaction);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/payment', async (req, res, next) => {
  try {
    const { method, channel, amount } = req.body;
    const processedBy = req.user?.id || 'u1';
    
    const updated = await processPayment(req.params.id, { 
      method, 
      channel, 
      amount, 
      processedBy 
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

router.patch('/:id', async (req, res, next) => {
  try {
    const updated = await updateTransaction(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Updated successfully', transaction: updated });
  } catch (err) {
    next(err);
  }
});

// Backward compatibility for /status endpoint
router.patch('/:id/status', async (req, res, next) => {
  try {
    const updated = await updateTransaction(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Updated successfully (legacy endpoint)', transaction: updated });
  } catch (err) {
    next(err);
  }
});


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

