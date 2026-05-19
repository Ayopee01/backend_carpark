// Import Require
const { PrismaClient } = require('@prisma/client');

// Create Prisma client สำหรับเชื่อมต่อ database
const prisma = new PrismaClient();

// Export Prisma client
module.exports = {
  prisma
};
