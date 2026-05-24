// Import Require
const { prisma } = require('../../db/prisma');

class ConfigConflictError extends Error {
  constructor(key, latest = null) {
    super('Config has already been updated. Please reload the latest config before saving again.');
    this.name = 'ConfigConflictError';
    this.statusCode = 409;
    this.key = key;
    this.latest = latest;
  }
}

class ConfigVersionRequiredError extends Error {
  constructor() {
    super('config version is required');
    this.name = 'ConfigVersionRequiredError';
    this.statusCode = 400;
  }
}

// Function แปลง version ที่ frontend ส่งมาให้เป็น integer ที่ปลอดภัย
function normalizeConfigVersion(value) {
  const version = Number(value);
  return Number.isInteger(version) && version > 0 ? version : null;
}

// Function อ่าน version จาก body/query/header สำหรับ optimistic locking
function getExpectedConfigVersion(req) {
  const rawVersion =
    req.get?.('x-config-version') ??
    req.get?.('if-match')?.replace(/"/g, '') ??
    req.query?.version ??
    req.body?.version;
  const version = normalizeConfigVersion(rawVersion);
  if (!version) throw new ConfigVersionRequiredError();
  return version;
}

// Function ลบ metadata ของ app_config ออกจาก payload ก่อนบันทึกลง data JSON
function stripConfigMeta(value = {}) {
  const { version, configUpdatedAt, ...data } = value || {};
  return data;
}

// Function ใส่ metadata ของ app_config เข้า response โดยไม่เปลี่ยนรูปข้อมูลหลักมากเกินไป
function withConfigMeta(data, record) {
  return {
    ...(data || {}),
    version: record?.version ?? 0,
    configUpdatedAt: record?.updatedAt ? record.updatedAt.toISOString() : null,
  };
}

// Function query record เต็มจาก app_config เพื่ออ่าน data + version + updatedAt
async function getConfigRecord(key, fallback) {
  if (!key) throw new Error('config key is required');

  const config = await prisma.appConfig.findUnique({
    where: { key },
  });

  if (!config) {
    if (fallback !== undefined) {
      return {
        key,
        data: fallback,
        version: 0,
        updatedAt: null,
      };
    }
    throw new Error(`Missing app_config key "${key}". Run Prisma seed first.`);
  }

  return config;
}

// Function query ข้อมูล config จาก table app_config ด้วย key ที่กำหนด
async function getConfig(key, fallback) {
  const config = await getConfigRecord(key, fallback);
  return config.data;
}

// Function query config พร้อม version สำหรับส่งให้ frontend ใช้ตอน update
async function getConfigWithMeta(key, fallback) {
  const config = await getConfigRecord(key, fallback);
  return withConfigMeta(config.data, config);
}

// Function update config แบบ optimistic locking ด้วย version ที่ frontend ส่งมา
async function setConfig(key, value, { expectedVersion } = {}) {
  if (!key) throw new Error('config key is required');

  if (expectedVersion !== undefined) {
    const version = normalizeConfigVersion(expectedVersion);
    if (!version) throw new ConfigVersionRequiredError();

    const updated = await prisma.appConfig.updateMany({
      where: { key, version },
      data: {
        data: stripConfigMeta(value),
        version: { increment: 1 },
      },
    });

    if (updated.count === 0) {
      const latest = await getConfigRecord(key, undefined).catch(() => null);
      throw new ConfigConflictError(key, latest ? withConfigMeta(latest.data, latest) : null);
    }

    return getConfigWithMeta(key);
  }

  const config = await prisma.appConfig.upsert({
    where: { key },
    create: { key, data: stripConfigMeta(value), version: 1 },
    update: {
      data: stripConfigMeta(value),
      version: { increment: 1 },
    },
  });

  return withConfigMeta(config.data, config);
}

// Function update config ภายในระบบ โดย retry เมื่อ version เปลี่ยนระหว่าง read/write
async function updateConfig(key, updater, fallback, { retries = 3 } = {}) {
  let lastConflict = null;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    const current = await getConfigRecord(key, fallback);
    const nextData = await updater(current.data, current);
    if (nextData === undefined) return withConfigMeta(current.data, current);

    try {
      const options = current.version > 0 ? { expectedVersion: current.version } : {};
      return await setConfig(key, nextData, options);
    } catch (err) {
      if (err instanceof ConfigConflictError) {
        lastConflict = err;
        continue;
      }
      throw err;
    }
  }

  throw lastConflict || new ConfigConflictError(key);
}

// Export Functions
module.exports = {
  ConfigConflictError,
  ConfigVersionRequiredError,
  getConfig,
  getConfigRecord,
  getConfigWithMeta,
  getExpectedConfigVersion,
  setConfig,
  stripConfigMeta,
  updateConfig,
  withConfigMeta,
};
