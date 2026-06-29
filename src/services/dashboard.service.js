// Import Require
const { listAllTransactions } = require('../data/repositories/transactions.repo');
const { listChannels } = require('../data/repositories/paymentSettings.repo');
const { getPaymentAmount, getPaymentChannel, getTransactionPayments, isCashierCashPayment, isScanPayment } = require('../utils/payments');

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

// Function อ่าน channel code จาก payment channel
function getChannelCode(channel) {
  const rawCode = channel?.code || channel?.channel || channel?.id || channel?.name || '';
  const code = String(rawCode).trim().toLowerCase();
  if (code.startsWith('ch_')) return code.slice(3);
  if (code === 'exit gate' || code === 'barrier_gate' || code === 'barrier gate') return 'gate';
  if (code === 'cashier' || code === 'admin') return 'cashier';
  if (['kiosk', 'gate', 'mobile'].includes(code)) return code;
  return code;
}

// Function normalize channel สำหรับ summary
function normalizeChannel(channel) {
  const code = getChannelCode(channel);
  return {
    ...channel,
    code,
    label: channel?.label || channel?.name || channel?.code || code,
    subLabel: channel?.subLabel || channel?.description || '',
  };
}

// Function สร้าง dashboard summary response
async function getDashboardSummary(currentUserId = 'u1') {
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

  const myCashToday = cashierPayments
    .filter((payment) => payment.processedBy === currentUserId)
    .reduce((sum, payment) => {
      return sum + getPaymentAmount(payment);
    }, 0);

  const epayPayments = paidPayments.filter(isScanPayment);

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

  const configuredChannels = await listChannels();
  const channels = (configuredChannels && configuredChannels.length ? configuredChannels : FALLBACK_CHANNELS)
    .map(normalizeChannel)
    .filter((channel) => ['cashier', 'kiosk', 'gate', 'mobile'].includes(channel.code));

  const channelBreakdown = channels.map((channel) => {
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
      percent: totalRevenueToday > 0 ? Math.round((amount / totalRevenueToday) * 100) : 0
    };
  });

  return {
    summaryCards: {
      totalTickets: dailyTransactions.length,
      paidCount: new Set(paidPayments.map((payment) => payment.transactionId)).size,
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
