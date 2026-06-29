const paymentGatewayRepo = require('../data/repositories/paymentGateway.repo');
const transactionsRepo = require('../data/repositories/transactions.repo');

const REPLAYABLE_GATEWAY_STATUSES = new Set(['successful', 'failed', 'expired', 'reversed']);

async function buildPaymentUpdateSnapshot(chargeId) {
  const gatewayCharge = await paymentGatewayRepo.getGatewayChargeByChargeId(chargeId);
  if (!gatewayCharge) return null;
  if (!gatewayCharge.processedAt && !REPLAYABLE_GATEWAY_STATUSES.has(gatewayCharge.status)) return null;

  let transaction = null;
  if (gatewayCharge.transactionId) {
    transaction = await transactionsRepo.getTransactionApiById(gatewayCharge.transactionId);
  }

  return {
    type: 'payment_updated',
    provider: gatewayCharge.provider,
    chargeId: gatewayCharge.chargeId,
    plateNo: transaction?.plateNo || gatewayCharge.plateNo,
    transactionId: transaction?.id || gatewayCharge.transactionId,
    paymentStatus: gatewayCharge.status,
    transactionStatus: transaction?.status || null,
    remainingAmount: transaction?.remainingAmount ?? null,
    exitTimeLimit: transaction?.exitTimeLimit || null,
    gatewayCharge,
    replayed: true,
    emittedAt: new Date().toISOString(),
  };
}

module.exports = {
  buildPaymentUpdateSnapshot,
};
