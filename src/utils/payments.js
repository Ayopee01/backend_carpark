// Function อ่านจำนวนเงินจาก payment หรือ fallback จาก transaction
function getPaymentAmount(payment, transaction = null) {
  const amount = Number(payment?.paidAmount ?? payment?.amount ?? 0);
  if (Number.isFinite(amount) && amount > 0) return amount;
  return Number(transaction?.netAmount ?? transaction?.amount ?? 0);
}

// Function normalize payment method ให้เป็นตัวพิมพ์เล็ก
function normalizePaymentMethod(method) {
  return String(method || '').trim().toLowerCase();
}

// Function normalize channel จาก payment method หรือ channel ที่ส่งมา
function normalizePaymentChannel(payment) {
  const channel = String(payment?.channel || '').trim().toLowerCase();
  if (['cashier', 'mobile', 'kiosk', 'gate'].includes(channel)) return channel;

  const method = normalizePaymentMethod(payment?.method);
  if (method === 'cash') return 'cashier';
  if (['promptpay', 'qr', 'qr_code', 'epay', 'transfer'].includes(method)) return 'mobile';

  return 'cashier';
}

// Function อ่าน channel สุดท้ายที่ใช้ใน dashboard/overview
function getPaymentChannel(payment) {
  const channel = normalizePaymentChannel(payment);
  if (channel === 'cashier') return 'cashier';
  if (payment?.deviceType === 'kiosk' || channel === 'kiosk') return 'kiosk';
  if (payment?.deviceType === 'barrier_gate' || channel === 'gate') return 'gate';
  return 'mobile';
}

// Function ตรวจว่าเป็น payment เงินสดหรือไม่
function isCashPayment(payment) {
  return normalizePaymentMethod(payment?.method) === 'cash';
}

// Function ตรวจว่าเป็นเงินสดจาก cashier หรือไม่
function isCashierCashPayment(payment) {
  return getPaymentChannel(payment) === 'cashier' && isCashPayment(payment);
}

// Function ตรวจว่าเป็น payment แบบ scan/QR หรือไม่
function isScanPayment(payment) {
  return ['promptpay', 'qr', 'qr_code'].includes(normalizePaymentMethod(payment?.method));
}

// Function ดึง payments ของ transaction ให้อยู่ในรูปแบบกลาง
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

// Function ตรวจว่า transaction อยู่ในกลุ่มจ่ายแล้วหรือไม่
function isPaidTransaction(transaction) {
  return transaction.status === 'completed' || transaction.status === 'paid' || transaction.status === 'paid_waiting_exit';
}

// Function ตรวจว่า transaction ยังรอชำระหรือไม่
function isPendingTransaction(transaction) {
  return transaction.status === 'pending' || transaction.status === 'partially_paid';
}

// Function คำนวณรายได้ของ transaction จาก payments
function getTransactionRevenue(transaction) {
  const payments = getTransactionPayments(transaction);
  if (payments.length > 0) {
    return payments.reduce((sum, payment) => sum + getPaymentAmount(payment, transaction), 0);
  }

  return Number(transaction.netAmount ?? transaction.amount ?? 0);
}

// Export Functions
module.exports = {
  getPaymentAmount,
  getPaymentChannel,
  getTransactionPayments,
  getTransactionRevenue,
  isCashPayment,
  isCashierCashPayment,
  isPaidTransaction,
  isPendingTransaction,
  isScanPayment,
  normalizePaymentChannel,
  normalizePaymentMethod,
};
