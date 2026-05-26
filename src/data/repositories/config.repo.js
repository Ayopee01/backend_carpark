// Import Require
const { prisma } = require('../../db/prisma');

// Function ลบ metadata ของ app_config ออกจาก payload ก่อนบันทึกลง data JSON
function stripConfigMeta(value = {}) {
  const { configUpdatedAt, ...data } = value || {};
  return data;
}

// Function ใส่ metadata ที่ frontend ใช้ดูเวลาแก้ไขล่าสุด
function withConfigMeta(data, record) {
  return {
    ...(data || {}),
    configUpdatedAt: record?.updatedAt ? record.updatedAt.toISOString() : null,
  };
}

// Function query record เต็มจาก app_config เพื่ออ่าน data + updatedAt
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

// Function query config พร้อม updatedAt สำหรับส่งให้ frontend
async function getConfigWithMeta(key, fallback) {
  const config = await getConfigRecord(key, fallback);
  return withConfigMeta(config.data, config);
}

// Function update config แบบปกติจาก frontend
async function setConfig(key, value) {
  if (!key) throw new Error('config key is required');

  const config = await prisma.appConfig.upsert({
    where: { key },
    create: { key, data: stripConfigMeta(value) },
    update: {
      data: stripConfigMeta(value),
    },
  });

  return withConfigMeta(config.data, config);
}

// Function update config ภายในระบบแบบ read/merge/write ปกติ
async function updateConfig(key, updater, fallback) {
  const current = await getConfigRecord(key, fallback);
  const nextData = await updater(current.data, current);
  if (nextData === undefined) return withConfigMeta(current.data, current);

  return setConfig(key, nextData);
}

// Export Functions
module.exports = {
  getConfig,
  getConfigRecord,
  getConfigWithMeta,
  setConfig,
  stripConfigMeta,
  updateConfig,
  withConfigMeta,
};
