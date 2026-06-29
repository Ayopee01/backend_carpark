const { WebSocketServer } = require('ws');
const appEvents = require('../utils/events');
const paymentGatewayRepo = require('../data/repositories/paymentGateway.repo');
const transactionsRepo = require('../data/repositories/transactions.repo');

const HEARTBEAT_INTERVAL_MS = 25000;

function normalizePlateNo(plateNo) {
  return plateNo ? String(plateNo).trim().replace(/[\s-]/g, '').toLowerCase() : '';
}

function matchesSubscription(subscription, event) {
  if (subscription.chargeId && subscription.chargeId === event.chargeId) return true;
  if (subscription.plateNo && subscription.plateNo === normalizePlateNo(event.plateNo)) return true;
  return false;
}

function sendJson(ws, payload) {
  if (ws.readyState !== 1) return;
  ws.send(JSON.stringify(payload));
}

async function buildChargeSnapshot(chargeId) {
  const gatewayCharge = await paymentGatewayRepo.getGatewayChargeByChargeId(chargeId);
  if (!gatewayCharge) return null;
  if (!gatewayCharge.processedAt && !['successful', 'failed', 'expired', 'reversed'].includes(gatewayCharge.status)) {
    return null;
  }

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

async function sendCurrentChargeStatus(ws, subscription) {
  if (!subscription.chargeId) return;
  try {
    const snapshot = await buildChargeSnapshot(subscription.chargeId);
    if (snapshot) sendJson(ws, snapshot);
  } catch (err) {
    sendJson(ws, { type: 'error', message: 'Unable to load payment status' });
  }
}

function createPaymentWebSocketServer(server, path) {
  const wss = new WebSocketServer({
    server,
    path,
  });
  const subscriptions = new Map();

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const subscription = {
      plateNo: normalizePlateNo(url.searchParams.get('plateNo')),
      chargeId: url.searchParams.get('chargeId') || '',
    };
    subscriptions.set(ws, subscription);
    ws.isAlive = true;

    sendJson(ws, {
      type: 'connected',
      message: 'Payment websocket connected',
      subscribed: {
        plateNo: subscription.plateNo || null,
        chargeId: subscription.chargeId || null,
      },
    });
    sendCurrentChargeStatus(ws, subscription);

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (message) => {
      try {
        const payload = JSON.parse(String(message));
        if (payload.type === 'subscribe') {
          const nextSubscription = {
            plateNo: normalizePlateNo(payload.plateNo),
            chargeId: payload.chargeId || '',
          };
          subscriptions.set(ws, nextSubscription);
          sendJson(ws, { type: 'subscribed' });
          sendCurrentChargeStatus(ws, nextSubscription);
        }
      } catch (err) {
        sendJson(ws, { type: 'error', message: 'Invalid websocket message' });
      }
    });

    ws.on('close', () => {
      subscriptions.delete(ws);
    });
  });

  const onPaymentUpdated = (event) => {
    for (const [ws, subscription] of subscriptions.entries()) {
      if (matchesSubscription(subscription, event)) sendJson(ws, event);
    }
  };

  appEvents.on('payment_updated', onPaymentUpdated);
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        subscriptions.delete(ws);
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref?.();

  wss.on('close', () => {
    clearInterval(heartbeat);
    appEvents.off('payment_updated', onPaymentUpdated);
  });

  return wss;
}

function attachPaymentWebSocket(server) {
  return {
    client: createPaymentWebSocketServer(server, '/api/v1/client/payment/ws'),
    admin: createPaymentWebSocketServer(server, '/api/v1/admin/payment/ws'),
  };
}

module.exports = {
  attachPaymentWebSocket,
};
