const express = require('express');
const { listAllTransactions } = require('../data/repositories/transactions.repo');
const { authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(authorize(['super_admin', 'staff'], 'overview'));

const TIME_ZONE_OFFSET = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const CHANNELS = [
  {
    id: 'cashier',
    label: 'เงินสด (Cashier)',
    icon: 'cash',
    match: (payment) => payment.channel === 'cashier',
  },
  {
    id: 'epayment',
    label: 'E-payment',
    icon: 'qr',
    match: (payment) => payment.channel === 'mobile',
  },
  {
    id: 'kiosk',
    label: 'Kiosk',
    icon: 'kiosk',
    match: (payment) => payment.channel === 'kiosk',
  },
  {
    id: 'gate',
    label: 'หน้าทางออก',
    icon: 'gate',
    match: (payment) => payment.channel === 'gate',
  },
];

const DAY_LABELS = [
  'จันทร์',
  'อังคาร',
  'พุธ',
  'พฤหัสบดี',
  'ศุกร์',
  'เสาร์',
  'อาทิตย์',
];

const MONTH_LABELS = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

function pad2(value) {
  return String(value).padStart(2, '0');
}

function getBangkokParts(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return {
      year: 0,
      month: 0,
      day: 0,
    };
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);

  return {
    year,
    month,
    day,
  };
}

function bangkokDateToUtcIso(
  year,
  month,
  day,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0
) {
  return new Date(
    Date.UTC(year, month - 1, day, hour - TIME_ZONE_OFFSET, minute, second, ms)
  ).toISOString();
}

function dateOnlyToUtcIso(value, mode) {
  const [year, month, day] = value.split('-').map(Number);

  if (mode === 'end') {
    return bangkokDateToUtcIso(year, month, day, 23, 59, 59, 999);
  }

  return bangkokDateToUtcIso(year, month, day, 0, 0, 0, 0);
}

function parseDateInput(value, mode) {
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return dateOnlyToUtcIso(value, mode);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function getDefaultRange() {
  const now = new Date();
  const { year, month } = getBangkokParts(now);

  return {
    startDate: bangkokDateToUtcIso(year, month, 1, 0, 0, 0, 0),
    endDate: now.toISOString(),
  };
}

function getRangeFromQuery(query) {
  const queryStart = query.start_date || query.startDate;
  const queryEnd = query.end_date || query.endDate;

  if (!queryStart && !queryEnd) {
    return getDefaultRange();
  }

  const startDate = parseDateInput(queryStart || queryEnd, 'start');
  const endDate = parseDateInput(queryEnd || queryStart, 'end');

  return {
    startDate,
    endDate,
  };
}

function getDateSerialFromYmd(year, month, day) {
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

function getYmdFromSerial(serial) {
  const date = new Date(serial * MS_PER_DAY);

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function getTransactionSerial(transaction) {
  const parts = getBangkokParts(transaction.entryAt);

  return getDateSerialFromYmd(parts.year, parts.month, parts.day);
}

function getRangeSerials(startDate, endDate) {
  const startParts = getBangkokParts(startDate);
  const endParts = getBangkokParts(endDate);

  const startSerial = getDateSerialFromYmd(
    startParts.year,
    startParts.month,
    startParts.day
  );

  const endSerial = getDateSerialFromYmd(
    endParts.year,
    endParts.month,
    endParts.day
  );

  return {
    startParts,
    endParts,
    startSerial,
    endSerial,
    rangeDays: Math.max(0, endSerial - startSerial),
  };
}

function getWeekdayIndexMondayFirst(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayIndex = date.getUTCDay();

  return dayIndex === 0 ? 6 : dayIndex - 1;
}

function isSameBangkokDay(startDate, endDate) {
  const startParts = getBangkokParts(startDate);
  const endParts = getBangkokParts(endDate);

  return (
    startParts.year === endParts.year &&
    startParts.month === endParts.month &&
    startParts.day === endParts.day
  );
}

function getWeekRangeFromDate(value) {
  const parts = getBangkokParts(value);

  const targetSerial = getDateSerialFromYmd(
    parts.year,
    parts.month,
    parts.day
  );

  const weekdayIndex = getWeekdayIndexMondayFirst(
    parts.year,
    parts.month,
    parts.day
  );

  const weekStartSerial = targetSerial - weekdayIndex;
  const weekEndSerial = weekStartSerial + 6;

  const weekStart = getYmdFromSerial(weekStartSerial);
  const weekEnd = getYmdFromSerial(weekEndSerial);

  return {
    startDate: bangkokDateToUtcIso(
      weekStart.year,
      weekStart.month,
      weekStart.day,
      0,
      0,
      0,
      0
    ),
    endDate: bangkokDateToUtcIso(
      weekEnd.year,
      weekEnd.month,
      weekEnd.day,
      23,
      59,
      59,
      999
    ),
  };
}

function getPaymentAmount(payment, transaction = null) {
  const amount = Number(payment?.paidAmount ?? payment?.amount ?? 0);

  if (Number.isFinite(amount) && amount > 0) {
    return amount;
  }

  return Number(transaction?.netAmount ?? transaction?.amount ?? 0);
}

function normalizeChannel(payment) {
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
      channel: normalizeChannel(payment),
      amount: getPaymentAmount(payment, transaction),
      transactionId: transaction.id,
    }));
  }

  if (
    transaction.payment &&
    (transaction.status === 'completed' || transaction.status === 'paid')
  ) {
    return [
      {
        ...transaction.payment,
        channel: normalizeChannel(transaction.payment),
        amount: getPaymentAmount(transaction.payment, transaction),
        transactionId: transaction.id,
      },
    ];
  }

  return [];
}

function isPaidTransaction(transaction) {
  return transaction.status === 'completed' || transaction.status === 'paid';
}

function isPendingTransaction(transaction) {
  return (
    transaction.status === 'pending' ||
    transaction.status === 'partially_paid'
  );
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

function getPercent(amount, total) {
  if (!total) return 0;

  return Math.round((amount / total) * 100);
}

function countTransactionsInSerialRange(transactions, fromSerial, toSerial) {
  return transactions.filter((transaction) => {
    const serial = getTransactionSerial(transaction);

    return serial >= fromSerial && serial <= toSerial;
  }).length;
}

function buildDailyUsageChart(transactions, startDate) {
  const parts = getBangkokParts(startDate);

  const targetSerial = getDateSerialFromYmd(
    parts.year,
    parts.month,
    parts.day
  );

  const weekdayIndex = getWeekdayIndexMondayFirst(
    parts.year,
    parts.month,
    parts.day
  );

  const weekStartSerial = targetSerial - weekdayIndex;

  return {
    mode: 'daily',
    label: 'รายวัน',
    items: DAY_LABELS.map((label, index) => {
      const serial = weekStartSerial + index;

      return {
        label,
        value: countTransactionsInSerialRange(transactions, serial, serial),
      };
    }),
  };
}

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
      value: countTransactionsInSerialRange(transactions, cursor, weekEnd),
    });

    cursor = weekEnd + 1;
    weekIndex += 1;
  }

  return {
    mode: 'weekly',
    label: 'รายสัปดาห์',
    items,
  };
}

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
        value,
      };
    });

  return {
    mode: 'monthly',
    label: 'รายเดือน',
    items,
  };
}

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
      value,
    }));

  return {
    mode: 'yearly',
    label: 'รายปี',
    items,
  };
}

function buildUsageChart(transactions, startDate, endDate) {
  const { rangeDays } = getRangeSerials(startDate, endDate);

  /**
   * เลือกวันเดียว / ช่วงไม่เกิน 7 วัน:
   * แสดงกราฟรายวัน จันทร์ - อาทิตย์
   */
  if (rangeDays <= 7) {
    return buildDailyUsageChart(transactions, startDate);
  }

  /**
   * เลือกมากกว่า 1 สัปดาห์ แต่ไม่เกินประมาณ 2 เดือน:
   * แสดงกราฟรายสัปดาห์ เหมาะกับการเลือกทั้งเดือน
   */
  if (rangeDays <= 62) {
    return buildWeeklyUsageChart(transactions, startDate, endDate);
  }

  /**
   * เลือกหลายเดือน แต่ไม่เกิน 1 ปี:
   * แสดงกราฟรายเดือน
   */
  if (rangeDays <= 366) {
    return buildMonthlyUsageChart(transactions);
  }

  /**
   * เลือกช่วงเกิน 1 ปี:
   * แสดงกราฟรายปี
   */
  return buildYearlyUsageChart(transactions);
}

router.get('/summary', async (req, res, next) => {
  try {
    const { startDate, endDate } = getRangeFromQuery(req.query);

    if (!startDate || !endDate) {
      return res.status(400).json({
        message: 'Invalid start_date or end_date',
      });
    }

    /**
     * Card ทุกใบใช้ช่วงวันที่ที่ user filter จริง
     */
    const transactionsRaw = await listAllTransactions({
      startDate,
      endDate,
    });

    const transactions = transactionsRaw.filter((transaction) => {
      return transaction && transaction.status && !transaction.isOverstay;
    });

    const paidTransactions = transactions.filter(isPaidTransaction);
    const pendingTransactions = transactions.filter(isPendingTransaction);

    const paidPayments = paidTransactions.flatMap(getTransactionPayments);

    const paidRevenue = paidTransactions.reduce((sum, transaction) => {
      return sum + getTransactionRevenue(transaction);
    }, 0);

    const cashierPayments = paidPayments.filter((payment) => {
      return payment.channel === 'cashier';
    });

    const scanPayments = paidPayments.filter((payment) => {
      return payment.channel !== 'cashier';
    });

    const cashierAmount = cashierPayments.reduce((sum, payment) => {
      return sum + getPaymentAmount(payment);
    }, 0);

    const scanAmount = scanPayments.reduce((sum, payment) => {
      return sum + getPaymentAmount(payment);
    }, 0);

    const revenueGroups = [
      {
        id: 'staff',
        label: 'เจ้าหน้าที่ช่วยเหลือ',
        amount: cashierAmount,
        percent: getPercent(cashierAmount, paidRevenue),
      },
      {
        id: 'scan',
        label: 'สแกนจ่าย',
        amount: scanAmount,
        percent: getPercent(scanAmount, paidRevenue),
      },
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
        icon: channel.icon,
      };
    });

    /**
     * Chart:
     * - ถ้าเลือกวันเดียว หรือช่วงไม่เกิน 7 วัน จะดึงทั้งสัปดาห์ของวันเริ่มต้นมาแสดง จันทร์ - อาทิตย์
     * - ถ้าเลือกทั้งเดือนหรือช่วงมากกว่า 7 วัน จะใช้ช่วง filter จริง
     */
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
        : await listAllTransactions({
          startDate: chartStartDate,
          endDate: chartEndDate,
        });

    const chartTransactions = chartTransactionsRaw.filter((transaction) => {
      return transaction && transaction.status && !transaction.isOverstay;
    });

    const usageChartResult = buildUsageChart(
      chartTransactions,
      chartStartDate,
      chartEndDate
    );

    res.json({
      filters: {
        startDate,
        endDate,
      },
      chartFilters: {
        startDate: chartStartDate,
        endDate: chartEndDate,
      },
      summaryCards: {
        totalTickets: transactions.length,
        paidCount: paidTransactions.length,
        paidRevenue,
        pendingCount: pendingTransactions.length,
        avgWait: '10 min',
      },
      revenueGroups,
      usageChartMode: usageChartResult.mode,
      usageChartLabel: usageChartResult.label,
      usageChart: usageChartResult.items,
      serviceSummary,
      totalSummaryCalculated: serviceSummary.reduce((sum, item) => {
        return sum + item.amount;
      }, 0),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;