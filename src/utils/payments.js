// Function อ่านยอดเงินจาก payment หรือ fallback จาก transaction
function getPaymentAmount(payment, transaction = null) {
  const amount = Number(payment?.paidAmount ?? payment?.amount ?? 0);

  if (Number.isFinite(amount) && amount > 0) {
    return amount;
  }

  return Number(transaction?.netAmount ?? transaction?.amount ?? 0);
}

// Function normalize payment channel ให้ dashboard/overview ใช้กติกาเดียวกัน
function normalizePaymentChannel(payment) {
  const channel = payment?.channel;

  if (['cashier', 'mobile', 'kiosk', 'gate'].includes(channel)) return channel;

  const method = payment?.method;
  if (method === 'cash') return 'cashier';
  if (['qr', 'qr_code', 'epay', 'transfer'].includes(method)) return 'mobile';

  return 'cashier';
}

// Function ดึงรายการ payment ทั้งหมดจาก transaction
function getTransactionPayments(transaction) {
  if (Array.isArray(transaction.payments) && transaction.payments.length > 0) {
    return transaction.payments.map((payment) => ({
      ...payment,
      channel: normalizePaymentChannel(payment),
      amount: getPaymentAmount(payment, transaction),
      transactionId: transaction.id,
    }));
  }

  if (transaction.payment && (transaction.status === 'completed' || transaction.status === 'paid' || transaction.status === 'paid_waiting_exit')) {
    return [
      {
        ...transaction.payment,
        channel: normalizePaymentChannel(transaction.payment),
        amount: getPaymentAmount(transaction.payment, transaction),
        transactionId: transaction.id,
      },
    ];
  }

  return [];
}

// Function ตรวจสอบ paid status
function isPaidTransaction(transaction) {
  return transaction.status === 'completed' || transaction.status === 'paid' || transaction.status === 'paid_waiting_exit';
}

// Function ตรวจสอบ pending status
function isPendingTransaction(transaction) {
  return transaction.status === 'pending' || transaction.status === 'partially_paid';
}

// Function คำนวณรายได้ของ transaction
function getTransactionRevenue(transaction) {
  const payments = getTransactionPayments(transaction);

  if (payments.length > 0) {
    return payments.reduce((sum, payment) => {
      return sum + getPaymentAmount(payment, transaction);
    }, 0);
  }

  return Number(transaction.netAmount ?? transaction.amount ?? 0);
}

// Export Functions
module.exports = {
  getPaymentAmount,
  getTransactionPayments,
  getTransactionRevenue,
  isPaidTransaction,
  isPendingTransaction,
  normalizePaymentChannel,
};
