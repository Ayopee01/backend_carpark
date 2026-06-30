// Import Require
const { listAllTransactions } = require('../data/repositories/transactions.repo');
const { getPaymentAmount, getPaymentChannel, getTransactionPayments, isCashierCashPayment, isScanPayment } = require('../utils/payments');

// Constant ช่องทางชำระเงินที่แสดงบน dashboard
const DASHBOARD_CHANNELS = [
  {
    id: 'ch_cashier',
    code: 'cashier',
    icon: 'user',
    name: 'Cashier',
    label: 'Cashier',
    subLabel: '',
    allowedMethods: ['cash', 'qr', 'promptpay'],
  },
  {
    id: 'ch_kiosk',
    code: 'kiosk',
    icon: 'vending',
    name: 'Kiosk',
    label: 'Kiosk',
    subLabel: '',
    allowedMethods: ['qr', 'promptpay'],
  },
  {
    id: 'ch_mobile',
    code: 'mobile',
    icon: 'qr',
    name: 'Mobile',
    label: 'Mobile',
    subLabel: '',
    allowedMethods: ['qr', 'promptpay'],
  },
  {
    id: 'ch_gate',
    code: 'gate',
    icon: 'gate',
    name: 'Barrier Gate',
    label: 'Barrier Gate',
    subLabel: '',
    allowedMethods: ['qr', 'promptpay'],
  },
];

// Function แปลง date เป็น year/month/day ตาม timezone Bangkok
function getBangkokParts(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return { year: 0, month: 0, day: 0 };

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === 'year')?.value),
    month: Number(parts.find((part) => part.type === 'month')?.value),
    day: Number(parts.find((part) => part.type === 'day')?.value)
  };
}

// Function แปลงวันเวลา Bangkok เป็น UTC ISO
function bangkokDateToUtcIso(year, month, day, hour = 0, minute = 0, second = 0, ms = 0) {
  return new Date(
    Date.UTC(year, month - 1, day, hour - 7, minute, second, ms)
  ).toISOString();
}

// Function สร้างช่วงเวลาเริ่มต้นและสิ้นสุดของวันนี้ตามเวลา Bangkok
function getTodayRange() {
  const { year, month, day } = getBangkokParts(new Date());

  return {
    startDate: bangkokDateToUtcIso(year, month, day, 0, 0, 0, 0),
    endDate: bangkokDateToUtcIso(year, month, day, 23, 59, 59, 999)
  };
}

// Function ตรวจว่า date อยู่ในช่วงที่กำหนดหรือไม่
function isDateInRange(value, startDate, endDate) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date >= new Date(startDate) && date <= new Date(endDate);
}

// Function สร้าง dashboard summary response
async function getDashboardSummary() {
  const { startDate, endDate } = getTodayRange();
  const [transactionsRaw, paymentTransactionsRaw] = await Promise.all([
    listAllTransactions({ startDate, endDate }),
    listAllTransactions()
  ]);

  const cleanTransactions = transactionsRaw.filter((transaction) => {
    return transaction && transaction.status;
  });

  const dailyTransactions = cleanTransactions.filter((transaction) => {
    return !transaction.isOverstay;
  });

  const unpaidToday = dailyTransactions.filter((transaction) => {
    return transaction.status === 'pending' || transaction.status === 'partially_paid';
  });

  const paidPayments = paymentTransactionsRaw
    .filter((transaction) => transaction && transaction.status && !transaction.isOverstay)
    .flatMap(getTransactionPayments)
    .filter((payment) => isDateInRange(payment.paidAt, startDate, endDate));

  const totalRevenueToday = paidPayments.reduce((sum, payment) => {
    return sum + getPaymentAmount(payment);
  }, 0);

  const cashierPayments = paidPayments.filter(isCashierCashPayment);

  const totalCashToday = cashierPayments.reduce((sum, payment) => {
    return sum + getPaymentAmount(payment);
  }, 0);

  const epayPayments = paidPayments.filter(isScanPayment);

  const totalEpayToday = epayPayments.reduce((sum, payment) => {
    return sum + getPaymentAmount(payment);
  }, 0);

  const revenueGroups = [
    {
      id: 'staff',
      amount: totalCashToday,
      percent: totalRevenueToday > 0 ? Math.round((totalCashToday / totalRevenueToday) * 100) : 0
    },
    {
      id: 'scan',
      amount: totalEpayToday,
      percent: totalRevenueToday > 0 ? Math.round((totalEpayToday / totalRevenueToday) * 100) : 0
    }
  ];

  const paidTransactionIdsToday = new Set(
    dailyTransactions
      .filter((transaction) => ['paid_waiting_exit', 'completed'].includes(transaction.status))
      .map((transaction) => transaction.id)
  );

  const channelRows = DASHBOARD_CHANNELS.map((channel) => {
    const filteredPayments = paidPayments.filter((payment) => {
      return getPaymentChannel(payment) === channel.code;
    });

    const amount = filteredPayments.reduce((sum, payment) => {
      return sum + getPaymentAmount(payment);
    }, 0);

    return {
      ...channel,
      amount,
      count: filteredPayments.length,
      percent: 0
    };
  });

  const channelRevenueTotal = channelRows.reduce((sum, channel) => sum + channel.amount, 0);
  const channelBreakdown = channelRows.map((channel) => ({
    ...channel,
    percent: channelRevenueTotal > 0 ? Math.round((channel.amount / channelRevenueTotal) * 100) : 0,
  }));

  return {
    summaryCards: {
      totalTickets: dailyTransactions.length,
      paidCount: paidTransactionIdsToday.size,
      paidRevenue: totalRevenueToday,
      pendingCount: unpaidToday.length,
    },
    revenueGroups,
    channelBreakdown,
    isRealtime: true
  };
}

// Export Functions
module.exports = {
  getDashboardSummary
};
