const { WebSocketServer } = require('ws');
const appEvents = require('../utils/events');

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

    sendJson(ws, {
      type: 'connected',
      message: 'Payment websocket connected',
      subscribed: {
        plateNo: subscription.plateNo || null,
        chargeId: subscription.chargeId || null,
      },
    });

    ws.on('message', (message) => {
      try {
        const payload = JSON.parse(String(message));
        if (payload.type === 'subscribe') {
          subscriptions.set(ws, {
            plateNo: normalizePlateNo(payload.plateNo),
            chargeId: payload.chargeId || '',
          });
          sendJson(ws, { type: 'subscribed' });
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
  wss.on('close', () => {
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
