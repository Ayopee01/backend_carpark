// Import Require
const { listAllTransactions } = require('../data/repositories/transactions.repo');
const {
  getPaymentChannel,
  getPaymentAmount,
  getTransactionPayments,
  getTransactionRevenue,
  isPaidTransaction,
  isPendingTransaction,
  isScanPayment,
} = require('../utils/payments');

// Constant timezone และการคำนวณวัน
const TIME_ZONE_OFFSET = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Constant รายการช่องทางบริการสำหรับ summary
const CHANNELS = [
  {
    id: 'cashier',
    label: 'เงินสด (Cashier)',
    icon: 'cash',
    match: (payment) => getPaymentChannel(payment) === 'cashier'
  },
  {
    id: 'epayment',
    label: 'E-payment',
    icon: 'qr',
    match: (payment) => getPaymentChannel(payment) === 'mobile'
  },
  {
    id: 'kiosk',
    label: 'Kiosk',
    icon: 'kiosk',
    match: (payment) => getPaymentChannel(payment) === 'kiosk'
  },
  {
    id: 'gate',
    label: 'หน้าทางออก',
    icon: 'gate',
    match: (payment) => getPaymentChannel(payment) === 'gate'
  }
];

// Constant label วันและเดือนสำหรับกราฟ
const DAY_LABELS = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
const MONTH_LABELS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

// Function เติมเลข 0 ด้านหน้าถ้าเลขมีหลักเดียว
function pad2(value) {
  return String(value).padStart(2, '0');
}

// Function แปลง date เป็น year/month/day ตาม timezone Asia/Bangkok
function getBangkokParts(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return { year: 0, month: 0, day: 0 };
  }

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
    Date.UTC(year, month - 1, day, hour - TIME_ZONE_OFFSET, minute, second, ms)
  ).toISOString();
}

// Function แปลง date-only string เป็น UTC ISO ตาม mode start/end
function dateOnlyToUtcIso(value, mode) {
  const [year, month, day] = value.split('-').map(Number);

  if (mode === 'end') {
    return bangkokDateToUtcIso(year, month, day, 23, 59, 59, 999);
  }

  return bangkokDateToUtcIso(year, month, day, 0, 0, 0, 0);
}

// Function parse query date ให้เป็น ISO string
function parseDateInput(value, mode) {
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return dateOnlyToUtcIso(value, mode);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

// Function สร้าง default range ตั้งแต่ต้นเดือนถึงเวลาปัจจุบัน
function getDefaultRange() {
  const now = new Date();
  const { year, month } = getBangkokParts(now);

  return {
    startDate: bangkokDateToUtcIso(year, month, 1, 0, 0, 0, 0),
    endDate: now.toISOString()
  };
}

// Function อ่านช่วงวันที่จาก query
function getRangeFromQuery(query) {
  const queryStart = query.start_date || query.startDate;
  const queryEnd = query.end_date || query.endDate;

  if (!queryStart && !queryEnd) {
    return getDefaultRange();
  }

  return {
    startDate: parseDateInput(queryStart || queryEnd, 'start'),
    endDate: parseDateInput(queryEnd || queryStart, 'end')
  };
}

// Function แปลง y/m/d เป็น serial number ของวัน
function getDateSerialFromYmd(year, month, day) {
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

// Function แปลง serial number กลับเป็น y/m/d
function getYmdFromSerial(serial) {
  const date = new Date(serial * MS_PER_DAY);

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

// Function อ่าน serial number จาก transaction entryAt
function getTransactionSerial(transaction) {
  const parts = getBangkokParts(transaction.entryAt);
  return getDateSerialFromYmd(parts.year, parts.month, parts.day);
}

// Function คำนวณ serial range และจำนวนวันของช่วงวันที่
function getRangeSerials(startDate, endDate) {
  const startParts = getBangkokParts(startDate);
  const endParts = getBangkokParts(endDate);
  const startSerial = getDateSerialFromYmd(startParts.year, startParts.month, startParts.day);
  const endSerial = getDateSerialFromYmd(endParts.year, endParts.month, endParts.day);

  return {
    startParts,
    endParts,
    startSerial,
    endSerial,
    rangeDays: Math.max(0, endSerial - startSerial)
  };
}

// Function คำนวณ index วันในสัปดาห์แบบเริ่มวันจันทร์
function getWeekdayIndexMondayFirst(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayIndex = date.getUTCDay();

  return dayIndex === 0 ? 6 : dayIndex - 1;
}

// Function ตรวจสอบว่า start/end อยู่วันเดียวกันตามเวลา Bangkok หรือไม่
function isSameBangkokDay(startDate, endDate) {
  const startParts = getBangkokParts(startDate);
  const endParts = getBangkokParts(endDate);

  return (
    startParts.year === endParts.year &&
    startParts.month === endParts.month &&
    startParts.day === endParts.day
  );
}

// Function สร้างช่วงวันที่ทั้งสัปดาห์จากวันที่ที่ส่งเข้ามา
function getWeekRangeFromDate(value) {
  const parts = getBangkokParts(value);
  const targetSerial = getDateSerialFromYmd(parts.year, parts.month, parts.day);
  const weekdayIndex = getWeekdayIndexMondayFirst(parts.year, parts.month, parts.day);
  const weekStartSerial = targetSerial - weekdayIndex;
  const weekEndSerial = weekStartSerial + 6;
  const weekStart = getYmdFromSerial(weekStartSerial);
  const weekEnd = getYmdFromSerial(weekEndSerial);

  return {
    startDate: bangkokDateToUtcIso(weekStart.year, weekStart.month, weekStart.day, 0, 0, 0, 0),
    endDate: bangkokDateToUtcIso(weekEnd.year, weekEnd.month, weekEnd.day, 23, 59, 59, 999)
  };
}

// Function คำนวณ percent จากยอดรวม
function getPercent(amount, total) {
  if (!total) return 0;
  return Math.round((amount / total) * 100);
}

// Function นับ transaction ในช่วง serial date
function countTransactionsInSerialRange(transactions, fromSerial, toSerial) {
  return transactions.filter((transaction) => {
    const serial = getTransactionSerial(transaction);
    return serial >= fromSerial && serial <= toSerial;
  }).length;
}

// Function สร้างกราฟรายวัน
function buildDailyUsageChart(transactions, startDate) {
  const parts = getBangkokParts(startDate);
  const targetSerial = getDateSerialFromYmd(parts.year, parts.month, parts.day);
  const weekdayIndex = getWeekdayIndexMondayFirst(parts.year, parts.month, parts.day);
  const weekStartSerial = targetSerial - weekdayIndex;

  return {
    mode: 'daily',
    label: 'รายวัน',
    items: DAY_LABELS.map((label, index) => {
      const serial = weekStartSerial + index;

      return {
        label,
        value: countTransactionsInSerialRange(transactions, serial, serial)
      };
    })
  };
}

// Function สร้างกราฟรายสัปดาห์
function buildWeeklyUsageChart(transactions, startDate, endDate) {
  const { startSerial, endSerial } = getRangeSerials(startDate, endDate);
  const items = [];
  let cursor = startSerial;
  let weekIndex = 1;

  while (cursor <= endSerial) {
    const weekEnd = Math.min(cursor + 6, endSerial);
    const ymd = getYmdFromSerial(cursor);

    items.push({
      label: `สัปดาห์ ${weekIndex} (${ymd.day}/${ymd.month})`,
      value: countTransactionsInSerialRange(transactions, cursor, weekEnd)
    });

    cursor = weekEnd + 1;
    weekIndex += 1;
  }

  return {
    mode: 'weekly',
    label: 'รายสัปดาห์',
    items
  };
}

// Function สร้างกราฟรายเดือน
function buildMonthlyUsageChart(transactions) {
  const monthMap = new Map();

  transactions.forEach((transaction) => {
    if (!transaction.entryAt) return;

    const parts = getBangkokParts(transaction.entryAt);
    const key = `${parts.year}-${pad2(parts.month)}`;
    monthMap.set(key, (monthMap.get(key) || 0) + 1);
  });

  const items = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => {
      const [year, month] = key.split('-').map(Number);

      return {
        label: `${MONTH_LABELS[month - 1]} ${year}`,
        value
      };
    });

  return {
    mode: 'monthly',
    label: 'รายเดือน',
    items
  };
}

// Function สร้างกราฟรายปี
function buildYearlyUsageChart(transactions) {
  const yearMap = new Map();

  transactions.forEach((transaction) => {
    if (!transaction.entryAt) return;

    const parts = getBangkokParts(transaction.entryAt);
    const key = String(parts.year);
    yearMap.set(key, (yearMap.get(key) || 0) + 1);
  });

  const items = Array.from(yearMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, value]) => ({
      label: year,
      value
    }));

  return {
    mode: 'yearly',
    label: 'รายปี',
    items
  };
}

// Function เลือกรูปแบบกราฟตามช่วงวันที่
function buildUsageChart(transactions, startDate, endDate) {
  const { rangeDays } = getRangeSerials(startDate, endDate);

  if (rangeDays <= 7) return buildDailyUsageChart(transactions, startDate);
  if (rangeDays <= 62) return buildWeeklyUsageChart(transactions, startDate, endDate);
  if (rangeDays <= 366) return buildMonthlyUsageChart(transactions);

  return buildYearlyUsageChart(transactions);
}

// Function สร้าง overview summary response
async function getOverviewSummary(query = {}) {
  const { startDate, endDate } = getRangeFromQuery(query);
  if (!startDate || !endDate) {
    return { ok: false, reason: 'invalid_date' };
  }

  const transactionsRaw = await listAllTransactions({ startDate, endDate });
  const transactions = transactionsRaw.filter((transaction) => {
    return transaction && transaction.status && !transaction.isOverstay;
  });

  const paidTransactions = transactions.filter(isPaidTransaction);
  const pendingTransactions = transactions.filter(isPendingTransaction);
  const paidPayments = paidTransactions.flatMap(getTransactionPayments);
  const paidRevenue = paidTransactions.reduce((sum, transaction) => {
    return sum + getTransactionRevenue(transaction);
  }, 0);

  const cashierPayments = paidPayments.filter((payment) => getPaymentChannel(payment) === 'cashier' && !isScanPayment(payment));
  const scanPayments = paidPayments.filter(isScanPayment);
  const cashierAmount = cashierPayments.reduce((sum, payment) => sum + getPaymentAmount(payment), 0);
  const scanAmount = scanPayments.reduce((sum, payment) => sum + getPaymentAmount(payment), 0);

  const revenueGroups = [
    {
      id: 'staff',
      label: 'เจ้าหน้าที่ช่วยเหลือ',
      amount: cashierAmount,
      percent: getPercent(cashierAmount, paidRevenue)
    },
    {
      id: 'scan',
      label: 'สแกนจ่าย',
      amount: scanAmount,
      percent: getPercent(scanAmount, paidRevenue)
    }
  ];

  const serviceSummary = CHANNELS.map((channel) => {
    const channelPayments = paidPayments.filter(channel.match);
    const amount = channelPayments.reduce((sum, payment) => {
      return sum + getPaymentAmount(payment);
    }, 0);

    return {
      id: channel.id,
      label: channel.label,
      amount,
      count: channelPayments.length,
      percent: getPercent(amount, paidRevenue),
      icon: channel.icon
    };
  });

  const shouldUseWeekForChart =
    isSameBangkokDay(startDate, endDate) ||
    getRangeSerials(startDate, endDate).rangeDays <= 7;

  let chartStartDate = startDate;
  let chartEndDate = endDate;

  if (shouldUseWeekForChart) {
    const weekRange = getWeekRangeFromDate(startDate);
    chartStartDate = weekRange.startDate;
    chartEndDate = weekRange.endDate;
  }

  const chartTransactionsRaw =
    chartStartDate === startDate && chartEndDate === endDate
      ? transactionsRaw
      : await listAllTransactions({ startDate: chartStartDate, endDate: chartEndDate });

  const chartTransactions = chartTransactionsRaw.filter((transaction) => {
    return transaction && transaction.status && !transaction.isOverstay;
  });

  const usageChartResult = buildUsageChart(chartTransactions, chartStartDate, chartEndDate);

  return {
    ok: true,
    data: {
      filters: {
        startDate,
        endDate
      },
      chartFilters: {
        startDate: chartStartDate,
        endDate: chartEndDate
      },
      summaryCards: {
        totalTickets: transactions.length,
        paidCount: paidTransactions.length,
        paidRevenue,
        pendingCount: pendingTransactions.length,
        avgWait: '10 min'
      },
      revenueGroups,
      usageChartMode: usageChartResult.mode,
      usageChartLabel: usageChartResult.label,
      usageChart: usageChartResult.items,
      serviceSummary,
      totalSummaryCalculated: serviceSummary.reduce((sum, item) => {
        return sum + item.amount;
      }, 0)
    }
  };
}

// Export Functions
module.exports = {
  getOverviewSummary
};
