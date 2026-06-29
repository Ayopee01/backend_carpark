const DEFAULT_PING_INTERVAL_MS = 25000;

function createSseStream(req, res, { connected, pingIntervalMs = DEFAULT_PING_INTERVAL_MS } = {}) {
  let closed = false;
  const cleanups = [];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const write = (payload) => {
    if (closed) return;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const addCleanup = (cleanup) => {
    if (typeof cleanup === 'function') cleanups.push(cleanup);
  };

  const addInterval = (callback, intervalMs) => {
    const interval = setInterval(callback, intervalMs);
    cleanups.push(() => clearInterval(interval));
    return interval;
  };

  if (connected) write(connected);
  if (pingIntervalMs > 0) {
    addInterval(() => write({ type: 'ping', at: new Date().toISOString() }), pingIntervalMs);
  }

  req.on('close', () => {
    closed = true;
    while (cleanups.length) {
      const cleanup = cleanups.pop();
      cleanup();
    }
  });

  return {
    write,
    addCleanup,
    addInterval,
    isClosed: () => closed,
  };
}

module.exports = {
  createSseStream,
};
