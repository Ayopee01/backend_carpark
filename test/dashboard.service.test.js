const test = require('node:test');
const assert = require('node:assert/strict');

const transactionsRepoPath = require.resolve('../src/data/repositories/transactions.repo');
const paymentSettingsRepoPath = require.resolve('../src/data/repositories/paymentSettings.repo');
const dashboardServicePath = require.resolve('../src/services/dashboard.service');
const transactionsRepo = require(transactionsRepoPath);
const paymentSettingsRepo = require(paymentSettingsRepoPath);

function getBangkokTodayRange() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === 'year').value);
  const month = Number(parts.find((part) => part.type === 'month').value);
  const day = Number(parts.find((part) => part.type === 'day').value);

  return {
    startDate: new Date(Date.UTC(year, month - 1, day, -7, 0, 0, 0)).toISOString(),
    midday: new Date(Date.UTC(year, month - 1, day, 5, 0, 0, 0)).toISOString(),
    endDate: new Date(Date.UTC(year, month - 1, day, 16, 59, 59, 999)).toISOString(),
    yesterday: new Date(Date.UTC(year, month - 1, day - 1, 5, 0, 0, 0)).toISOString(),
  };
}

function transaction(id, { entryAt, status = 'completed', isOverstay = false, payments = [] }) {
  return {
    id,
    billNo: id,
    plateNo: id,
    status,
    entryAt,
    isOverstay,
    payments,
  };
}

function payment(id, { method, channel, amount, paidAt, processedBy = 'system', deviceType }) {
  return {
    id,
    method,
    channel,
    paidAmount: amount,
    amount,
    paidAt,
    processedBy,
    ...(deviceType ? { deviceType } : {}),
  };
}

function loadDashboardService({ transactions, channels }) {
  const originals = {
    listAllTransactions: transactionsRepo.listAllTransactions,
    listChannels: paymentSettingsRepo.listChannels,
  };

  transactionsRepo.listAllTransactions = async (filters = {}) => {
    if (!filters.startDate && !filters.endDate) return structuredClone(transactions);

    return structuredClone(transactions).filter((item) => {
      const entryAt = new Date(item.entryAt);
      return entryAt >= new Date(filters.startDate) && entryAt <= new Date(filters.endDate);
    });
  };
  paymentSettingsRepo.listChannels = async () => structuredClone(channels);

  delete require.cache[dashboardServicePath];
  const service = require(dashboardServicePath);

  return {
    service,
    restore() {
      transactionsRepo.listAllTransactions = originals.listAllTransactions;
      paymentSettingsRepo.listChannels = originals.listChannels;
      delete require.cache[dashboardServicePath];
    },
  };
}

test('dashboard uses entry date for tickets and paidAt date for payment totals', async () => {
  const today = getBangkokTodayRange();
  const channels = [
    { id: 'ch_cashier', name: 'Cashier', icon: 'user' },
    { id: 'ch_kiosk', name: 'Kiosk', icon: 'kiosk' },
    { id: 'ch_gate', name: 'Exit Gate', icon: 'gate' },
    { id: 'ch_mobile', name: 'Mobile', icon: 'qr' },
  ];
  const transactions = [
    transaction('pending_today', { entryAt: today.midday, status: 'pending' }),
    transaction('partial_today', {
      entryAt: today.midday,
      status: 'partially_paid',
      payments: [payment('old_partial', { method: 'cash', channel: 'cashier', amount: 10, paidAt: today.yesterday, processedBy: 'u1' })],
    }),
    transaction('cashier_cash_today', {
      entryAt: today.midday,
      payments: [payment('cash_today', { method: 'cash', channel: 'cashier', amount: 50, paidAt: today.midday, processedBy: 'u1' })],
    }),
    transaction('cashier_promptpay_today', {
      entryAt: today.midday,
      payments: [payment('admin_qr_today', { method: 'promptpay', channel: 'cashier', amount: 25, paidAt: today.midday, processedBy: 'u2' })],
    }),
    transaction('kiosk_promptpay_today', {
      entryAt: today.midday,
      payments: [payment('kiosk_qr_today', { method: 'promptpay', channel: 'kiosk', amount: 40, paidAt: today.midday, deviceType: 'kiosk' })],
    }),
    transaction('gate_card_today', {
      entryAt: today.midday,
      payments: [payment('gate_card_today', { method: 'card', channel: 'gate', amount: 30, paidAt: today.midday, deviceType: 'barrier_gate' })],
    }),
    transaction('mobile_promptpay_yesterday_entry', {
      entryAt: today.yesterday,
      payments: [payment('mobile_qr_today', { method: 'promptpay', channel: 'mobile', amount: 100, paidAt: today.midday })],
    }),
    transaction('mobile_promptpay_old_payment', {
      entryAt: today.midday,
      payments: [payment('old_qr', { method: 'promptpay', channel: 'mobile', amount: 999, paidAt: today.yesterday })],
    }),
    transaction('overstay_paid_today', {
      entryAt: today.midday,
      isOverstay: true,
      payments: [payment('overstay_cash', { method: 'cash', channel: 'cashier', amount: 999, paidAt: today.midday })],
    }),
  ];

  const fixture = loadDashboardService({ transactions, channels });

  try {
    const summary = await fixture.service.getDashboardSummary('u1');

    assert.equal(summary.summaryCards.totalTickets, 7);
    assert.equal(summary.summaryCards.pendingCount, 2);
    assert.equal(summary.summaryCards.paidCount, 5);
    assert.equal(summary.summaryCards.paidRevenue, 245);

    assert.equal(summary.revenueGroups.find((group) => group.id === 'staff').amount, 50);
    assert.equal(summary.revenueGroups.find((group) => group.id === 'staff').personalAmount, 50);
    assert.equal(summary.revenueGroups.find((group) => group.id === 'scan').amount, 165);

    const breakdown = Object.fromEntries(summary.channelBreakdown.map((item) => [item.code, item]));
    assert.equal(breakdown.cashier.amount, 75);
    assert.equal(breakdown.cashier.count, 2);
    assert.equal(breakdown.kiosk.amount, 40);
    assert.equal(breakdown.gate.amount, 30);
    assert.equal(breakdown.mobile.amount, 100);
  } finally {
    fixture.restore();
  }
});
