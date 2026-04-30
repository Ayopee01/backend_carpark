const express = require('express');
const { listAllTransactions } = require('../data/repositories/transactions.repo');
const { authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(authorize(['super_admin', 'staff'], 'dashboard'));

const CHANNELS = [
  {
    code: 'cashier',
    label: 'แคเชียร์',
    subLabel: 'เจ้าหน้าที่หน้างานช่วยเหลือ',
    icon: 'user',
  },
  {
    code: 'mobile',
    label: 'พร้อมเพย์',
    subLabel: 'Mobile App & QR Code',
    icon: 'qr',
  },
  {
    code: 'kiosk',
    label: 'Kiosk',
    subLabel: 'สถานีบริการด้วยตัวเอง',
    icon: 'kiosk',
  },
  {
    code: 'gate',
    label: 'หน้าทางออก',
    subLabel: 'การชำระเงินผ่านประตูอัตโนมัติ',
    icon: 'gate',
  },
];

function getPaymentAmount(payment, transaction = null) {
  const amount = Number(payment?.paidAmount ?? payment?.amount ?? 0);

  if (Number.isFinite(amount) && amount > 0) {
    return amount;
  }

  return Number(transaction?.netAmount ?? transaction?.amount ?? 0);
}

function getPaymentChannel(payment) {
  const channel = payment?.channel;

  if (channel === 'cashier') return 'cashier';
  if (channel === 'mobile') return 'mobile';
  if (channel === 'kiosk') return 'kiosk';
  if (channel === 'gate') return 'gate';

  const method = payment?.method;

  if (method === 'cash') return 'cashier';
  if (method === 'qr') return 'mobile';
  if (method === 'epay') return 'mobile';
  if (method === 'transfer') return 'mobile';

  return 'cashier';
}

function getTransactionPayments(transaction) {
  if (Array.isArray(transaction.payments) && transaction.payments.length > 0) {
    return transaction.payments.map((payment) => ({
      ...payment,
      channel: getPaymentChannel(payment),
      amount: getPaymentAmount(payment, transaction),
      transactionId: transaction.id,
    }));
  }

  if (transaction.payment && transaction.status === 'completed') {
    return [
      {
        ...transaction.payment,
        channel: getPaymentChannel(transaction.payment),
        amount: getPaymentAmount(transaction.payment, transaction),
        transactionId: transaction.id,
      },
    ];
  }

  return [];
}

function getTransactionRevenue(transaction) {
  const payments = getTransactionPayments(transaction);

  if (payments.length > 0) {
    return payments.reduce((sum, payment) => {
      return sum + getPaymentAmount(payment, transaction);
    }, 0);
  }

  return Number(transaction.netAmount ?? transaction.amount ?? 0);
}

function getTodayRange() {
  const now = new Date();

  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0
  );

  const endOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999
  );

  return {
    startDate: startOfToday.toISOString(),
    endDate: endOfToday.toISOString(),
  };
}

router.get('/', async (req, res, next) => {
  try {
    const { startDate, endDate } = getTodayRange();

    const transactionsRaw = await listAllTransactions({
      startDate,
      endDate,
    });

    const currentUserId = req.user?.id || 'u1';

    const cleanTransactions = transactionsRaw.filter((transaction) => {
      return transaction && transaction.status;
    });

    const dailyTransactions = cleanTransactions.filter((transaction) => {
      return !transaction.isOverstay;
    });

    const paidToday = dailyTransactions.filter((transaction) => {
      return transaction.status === 'completed' || transaction.status === 'paid';
    });

    const unpaidToday = dailyTransactions.filter((transaction) => {
      return (
        transaction.status === 'pending' ||
        transaction.status === 'partially_paid'
      );
    });

    const paidPayments = paidToday.flatMap(getTransactionPayments);

    const totalRevenueToday = paidToday.reduce((sum, transaction) => {
      return sum + getTransactionRevenue(transaction);
    }, 0);

    const cashierPayments = paidPayments.filter((payment) => {
      return payment.channel === 'cashier';
    });

    const totalCashToday = cashierPayments.reduce((sum, payment) => {
      return sum + getPaymentAmount(payment);
    }, 0);

    const myCashToday = cashierPayments
      .filter((payment) => payment.processedBy === currentUserId)
      .reduce((sum, payment) => {
        return sum + getPaymentAmount(payment);
      }, 0);

    const epayPayments = paidPayments.filter((payment) => {
      return payment.channel !== 'cashier';
    });

    const totalEpayToday = epayPayments.reduce((sum, payment) => {
      return sum + getPaymentAmount(payment);
    }, 0);

    const revenueGroups = [
      {
        id: 'staff',
        label: 'เจ้าหน้าที่ช่วยเหลือ',
        amount: totalCashToday,
        personalAmount: myCashToday,
        percent:
          totalRevenueToday > 0
            ? Math.round((totalCashToday / totalRevenueToday) * 100)
            : 0,
      },
      {
        id: 'scan',
        label: 'สแกนจ่าย',
        amount: totalEpayToday,
        percent:
          totalRevenueToday > 0
            ? Math.round((totalEpayToday / totalRevenueToday) * 100)
            : 0,
      },
    ];

    const channelBreakdown = CHANNELS.map((channel) => {
      const filteredPayments = paidPayments.filter((payment) => {
        return payment.channel === channel.code;
      });

      const amount = filteredPayments.reduce((sum, payment) => {
        return sum + getPaymentAmount(payment);
      }, 0);

      return {
        ...channel,
        amount,
        count: filteredPayments.length,
        percent:
          totalRevenueToday > 0
            ? Math.round((amount / totalRevenueToday) * 100)
            : 0,
      };
    });

    res.json({
      summaryCards: {
        totalTickets: dailyTransactions.length,
        paidCount: paidToday.length,
        paidRevenue: totalRevenueToday,
        pendingCount: unpaidToday.length,
        avgWaitTime: '12 min',
      },
      revenueGroups,
      channelBreakdown,
      isRealtime: true,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;