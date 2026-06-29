// Constant source การชำระเงินที่ระบบรองรับ
const VALID_PAYMENT_SOURCES = new Set(['kiosk', 'barrier_gate', 'mobile', 'admin']);

// Constant map source กลางไปยัง payment channel
const SOURCE_TO_PAYMENT_CHANNEL = {
  kiosk: 'kiosk',
  barrier_gate: 'gate',
  mobile: 'mobile',
  admin: 'cashier'
};

// Constant alias สำหรับชื่อ source/channel ที่รับจากหลาย flow
const SOURCE_ALIASES = {
  gate: 'barrier_gate',
  barrier: 'barrier_gate',
  barrier_gate: 'barrier_gate',
  kiosk: 'kiosk',
  client: 'mobile',
  mobile: 'mobile',
  omise: 'mobile',
  cashier: 'admin',
  counter: 'admin',
  admin: 'admin'
};

// Function normalize ค่า source/channel ให้เป็นรูปแบบเดียวกัน
function normalizeSourceLikeValue(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toLowerCase().replace(/[\s-]+/g, '_');
  return normalized || null;
}

// Function normalize payment source ให้เหลือค่าที่ระบบรองรับ
function normalizePaymentSource(value) {
  const normalized = normalizeSourceLikeValue(value);
  if (!normalized) return null;

  const source = SOURCE_ALIASES[normalized] || normalized;
  return VALID_PAYMENT_SOURCES.has(source) ? source : null;
}

// Function normalize ข้อมูล device ที่จะบันทึกกับ payment
function normalizeDeviceForPayment(device = {}) {
  if (!device || typeof device !== 'object') return null;

  const deviceId = device.deviceId || device.id || null;
  const deviceType = normalizePaymentSource(device.deviceType || device.type);
  const deviceName = device.deviceName || device.name || null;
  const deviceLocation = device.deviceLocation || device.location || null;

  if (!deviceId && !deviceType && !deviceName && !deviceLocation) return null;

  return {
    ...(deviceId ? { deviceId } : {}),
    ...(deviceType ? { deviceType } : {}),
    ...(deviceName ? { deviceName } : {}),
    ...(deviceLocation ? { deviceLocation } : {})
  };
}

// Function resolve channel ที่ใช้ตรวจ payment settings
function resolvePaymentChannel(source, requestedChannel) {
  const normalizedChannel = normalizeSourceLikeValue(requestedChannel);

  if (normalizedChannel === 'admin') return SOURCE_TO_PAYMENT_CHANNEL.admin;
  if (normalizedChannel === 'barrier_gate' || normalizedChannel === 'barrier') {
    return SOURCE_TO_PAYMENT_CHANNEL.barrier_gate;
  }

  if (normalizedChannel) return normalizedChannel;

  return SOURCE_TO_PAYMENT_CHANNEL[source] || SOURCE_TO_PAYMENT_CHANNEL.admin;
}

// Function สร้าง context ไว้ตรวจสอบที่มาของ payment ย้อนหลัง
function buildPaymentSourceContext({
  source,
  inferredFrom,
  routeType,
  channel,
  processedBy,
  device,
  sourceContext
}) {
  const context = sourceContext && typeof sourceContext === 'object' && !Array.isArray(sourceContext)
    ? { ...sourceContext }
    : {};

  const normalizedDevice = normalizeDeviceForPayment(device);

  return {
    ...context,
    source,
    inferredFrom,
    ...(routeType ? { routeType } : {}),
    ...(channel ? { requestedChannel: channel } : {}),
    ...(processedBy ? { actorId: processedBy } : {}),
    ...(normalizedDevice ? { device: normalizedDevice } : {})
  };
}

// Function resolve source/channel จาก request, device, หรือ actor
function resolvePaymentSource({
  source,
  paymentSource,
  routeType,
  channel,
  processedBy,
  device,
  sourceContext
} = {}) {
  const normalizedDevice = normalizeDeviceForPayment(device);

  const candidates = [
    { value: source, inferredFrom: 'source' },
    { value: paymentSource, inferredFrom: 'paymentSource' },
    { value: normalizedDevice?.deviceType, inferredFrom: 'device.deviceType' },
    { value: routeType, inferredFrom: 'routeType' },
    { value: channel, inferredFrom: 'channel' },
    {
      value: processedBy && processedBy !== 'system' ? 'admin' : null,
      inferredFrom: 'processedBy'
    }
  ];

  const matched = candidates
    .map((candidate) => ({
      source: normalizePaymentSource(candidate.value),
      inferredFrom: candidate.inferredFrom
    }))
    .find((candidate) => candidate.source);

  const resolvedSource = matched?.source || 'mobile';
  const resolvedChannel = resolvePaymentChannel(resolvedSource, channel);

  return {
    source: resolvedSource,
    channel: resolvedChannel,
    sourceContext: buildPaymentSourceContext({
      source: resolvedSource,
      inferredFrom: matched?.inferredFrom || 'default_no_device',
      routeType,
      channel,
      processedBy,
      device,
      sourceContext
    }),
    device: normalizedDevice
  };
}

// Function ตรวจว่า payment มาจาก Barrier Gate หรือไม่
function isGatePaymentSource(source) {
  return normalizePaymentSource(source) === 'barrier_gate';
}

// Export Functions
module.exports = {
  isGatePaymentSource,
  normalizePaymentSource,
  resolvePaymentSource,
};
