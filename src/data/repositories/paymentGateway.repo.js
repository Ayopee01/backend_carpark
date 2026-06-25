const { prisma } = require('../../db/prisma');
const { createId } = require('../store');

function toIsoOrNull(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function toApi(row) {
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    chargeId: row.chargeId,
    transactionId: row.transactionId,
    plateNo: row.plateNo,
    amount: row.amount,
    currency: row.currency,
    method: row.method,
    channel: row.channel,
    status: row.status,
    paidAt: toIsoOrNull(row.paidAt),
    processedAt: toIsoOrNull(row.processedAt),
    raw: row.raw,
    createdAt: toIsoOrNull(row.createdAt),
    updatedAt: toIsoOrNull(row.updatedAt),
  };
}

async function createGatewayCharge(data) {
  const saved = await prisma.paymentGatewayCharge.create({
    data: {
      id: createId('pgc'),
      provider: data.provider || 'omise',
      chargeId: data.chargeId,
      transactionId: data.transactionId,
      plateNo: data.plateNo,
      amount: data.amount,
      currency: data.currency,
      method: data.method,
      channel: data.channel,
      status: data.status || 'pending',
      raw: data.raw || null,
    },
  });

  return toApi(saved);
}

async function getGatewayChargeByChargeId(chargeId) {
  if (!chargeId) return null;
  return toApi(await prisma.paymentGatewayCharge.findUnique({ where: { chargeId } }));
}

async function updateGatewayCharge(chargeId, updates) {
  if (!chargeId) return null;

  const data = {};
  if (updates.status !== undefined) data.status = updates.status;
  if (updates.raw !== undefined) data.raw = updates.raw;
  if (updates.paidAt !== undefined) data.paidAt = updates.paidAt ? new Date(updates.paidAt) : null;
  if (updates.processedAt !== undefined) data.processedAt = updates.processedAt ? new Date(updates.processedAt) : null;

  const saved = await prisma.paymentGatewayCharge.update({
    where: { chargeId },
    data,
  });

  return toApi(saved);
}

module.exports = {
  createGatewayCharge,
  getGatewayChargeByChargeId,
  updateGatewayCharge,
};
