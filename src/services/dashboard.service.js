// Import Require
const { listAllTransactions } = require('../data/repositories/transactions.repo');
const { listChannels } = require('../data/repositories/paymentSettings.repo');
const { getPaymentAmount, getTransactionPayments, getTransactionRevenue } = require('../utils/payments');

// Constant รายการช่องทางรับชำระเงินที่ใช้สรุปหน้า dashboard
const FALLBACK_CHANNELS = [
  {
    code: 'cashier',
    label: 'แคชเชียร์',
    subLabel: 'เจ้าหน้าที่หน้างานช่วยเหลือ',
    icon: 'user'
  },
  {
    code: 'mobile',
    label: 'พร้อมเพย์',
    subLabel: 'Mobile App & QR Code',
    icon: 'qr'
  },
  {
    code: 'kiosk',
    label: 'Kiosk',
    subLabel: 'สถานีบริการด้วยตัวเอง',
    icon: 'kiosk'
  },
  {
    code: 'gate',
    label: 'หน้าทางออก',
    subLabel: 'การชำระเงินผ่านประตูอัตโนมัติ',
    icon: 'gate'
  }
];

// Function สร้างช่วงเวลาเริ่มต้นและสิ้นสุดของวันนี้
function getTodayRange() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  return {
    startDate: startOfToday.toISOString(),
    endDate: endOfToday.toISOString()
  };
}

// Function สร้าง dashboard summary response
async function getDashboardSummary(currentUserId = 'u1') {
  const { startDate, endDate } = getTodayRange();
  const transactionsRaw = await listAllTransactions({ startDate, endDate });

  const cleanTransactions = transactionsRaw.filter((transaction) => {
    return transaction && transaction.status;
  });

  const dailyTransactions = cleanTransactions.filter((transaction) => {
    return !transaction.isOverstay;
  });

  const paidToday = dailyTransactions.filter((transaction) => {
    return transaction.status === 'completed' || transaction.status === 'paid' || transaction.status === 'paid_waiting_exit';
  });

  const unpaidToday = dailyTransactions.filter((transaction) => {
    return transaction.status === 'pending' || transaction.status === 'partially_paid';
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
      percent: totalRevenueToday > 0 ? Math.round((totalCashToday / totalRevenueToday) * 100) : 0
    },
    {
      id: 'scan',
      label: 'สแกนจ่าย',
      amount: totalEpayToday,
      percent: totalRevenueToday > 0 ? Math.round((totalEpayToday / totalRevenueToday) * 100) : 0
    }
  ];

  const channels = await listChannels() || FALLBACK_CHANNELS;
  
  const channelBreakdown = channels.map((channel) => {
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
      percent: totalRevenueToday > 0 ? Math.round((amount / totalRevenueToday) * 100) : 0
    };
  });

  return {
    summaryCards: {
      totalTickets: dailyTransactions.length,
      paidCount: paidToday.length,
      paidRevenue: totalRevenueToday,
      pendingCount: unpaidToday.length,
      avgWaitTime: '12 min'
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
