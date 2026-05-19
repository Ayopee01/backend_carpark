// Import Require
const { prisma } = require('../../db/prisma');

// Function query ข้อมูล config จาก table "app_config" ด้วย key ที่กำหนด
async function getConfig(key, fallback) {
  if (!key) throw new Error('config key is required');

  const config = await prisma.appConfig.findUnique({
    where: { key }
  });

  if (!config) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing app_config key "${key}". Run Prisma seed first.`);
  }

  return config.data;
}

// Function upsert ข้อมูล config ใน table app_config
async function setConfig(key, value) {
  if (!key) throw new Error('config key is required');

  const config = await prisma.appConfig.upsert({
    where: { key },
    create: { key, data: value },
    update: { data: value }
  });

  return config.data ?? value;
}

// Export Functions
module.exports = {
  getConfig,
  setConfig
};
