// Import Require
const { prisma } = require('../../db/prisma');

// Function ลบ configUpdatedAt ออกจาก config data
function stripConfigMeta(value = {}) {
  const { configUpdatedAt, ...data } = value || {};
  return data;
}

// Function เพิ่ม configUpdatedAt เข้าไปใน config data
function withConfigMeta(data, record) {
  return {
    ...(data || {}),
    configUpdatedAt: record?.updatedAt ? record.updatedAt.toISOString() : null,
  };
}

// Function query record config จาก app_config ตาม key ที่กำหนด
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

// Function query ข้อมูล config จาก app_config ด้วย key ที่กำหนด
async function getConfig(key, fallback) {
  const config = await getConfigRecord(key, fallback);
  return config.data;
}

// Function query config พร้อม updatedAt จาก app_config ด้วย key ที่กำหนด
async function getConfigWithMeta(key, fallback) {
  const config = await getConfigRecord(key, fallback);
  return withConfigMeta(config.data, config);
}

// Function update config ลง app_config
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

// Function update config ด้วย updater โดยอิงจากข้อมูลเดิม
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
