// Import Require
const { createId } = require('../store');
const { prisma } = require('../../db/prisma');
const { pick } = require('../../utils/helpers');
const { normalizePagination, buildMeta } = require('../../utils/pagination');
const { hashPassword, verifyPassword } = require('../../utils/auth');

// Function แปลง user record จาก database ให้อยู่ในรูปแบบ API
function toUserApi(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.passwordHash,
    name: row.name,
    email: row.email ?? null,
    phone: row.phone ?? null,
    role: row.role,
    permissions: row.permissions || [],
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

// Function ลบข้อมูล password ออกจาก object user ก่อนส่งออก
function withoutPassword(user) {
  if (!user) return null;
  const safe = { ...user };
  delete safe.password;
  delete safe.passwordHash;
  return safe;
}

// Function สร้าง Prisma where สำหรับ search user จาก keyword
function buildKeywordFilter(keyword) {
  if (!keyword) return undefined;
  const contains = String(keyword);
  return {
    OR: [
      { name: { contains, mode: 'insensitive' } },
      { email: { contains, mode: 'insensitive' } },
      { username: { contains, mode: 'insensitive' } },
      { role: { contains, mode: 'insensitive' } }
    ]
  };
}

// Function query user แบบ pagination พร้อม meta
async function listUsers({ keyword, page = 1, perPage = 10 } = {}) {
  const { page: safePage, perPage: safePerPage, from } = normalizePagination(page, perPage);
  const where = buildKeywordFilter(keyword);

  const [rows, count] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: from,
      take: safePerPage
    }),
    prisma.user.count({ where })
  ]);

  return {
    data: rows.map((row) => withoutPassword(toUserApi(row))),
    meta: buildMeta(safePage, safePerPage, count)
  };
}

// Function query user 
async function listAllUsers({ keyword } = {}) {
  const where = buildKeywordFilter(keyword);
  const rows = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'desc' }
  });

  return rows.map((row) => withoutPassword(toUserApi(row)));
}

// Function หา active user จาก username และ password สำหรับ login
async function findActiveUserByCredentials(username, password) {
  if (!username || !password) return null;

  const user = await prisma.user.findFirst({
    where: { username, status: 'active' }
  });

  if (!user || !verifyPassword(password, user.passwordHash)) return null;
  return toUserApi(user);
}

// Function query user ด้วย id
async function getUserById(id) {
  if (!id) return null;

  const user = await prisma.user.findUnique({
    where: { id }
  });

  return withoutPassword(toUserApi(user));
}

// Function ตรวจสอบว่า username ถูกใช้งานแล้วหรือยัง
async function isUsernameTaken(username, { excludeId } = {}) {
  if (!username) return false;

  const user = await prisma.user.findFirst({
    where: {
      username,
      ...(excludeId ? { id: { not: excludeId } } : {})
    },
    select: { id: true }
  });

  return Boolean(user);
}

// Function create user ใหม่ใน database
async function createUser(payload) {
  const user = await prisma.user.create({
    data: {
      id: createId('u'),
      username: payload.username,
      passwordHash: hashPassword(payload.password),
      name: payload.name,
      email: payload.email || null,
      phone: payload.phone || null,
      role: payload.role || 'staff',
      permissions: payload.permissions || [],
      status: payload.status || 'active'
    }
  });

  return withoutPassword(toUserApi(user));
}

// Function update user ด้วย id
async function updateUser(id, patch = {}) {
  const existing = await getUserById(id);
  if (!existing) return null;

  const updates = pick(patch, ['username', 'name', 'email', 'phone', 'role', 'permissions', 'status']);
  if (patch.password) updates.passwordHash = hashPassword(patch.password);

  const user = await prisma.user.update({
    where: { id },
    data: updates
  });

  return withoutPassword(toUserApi(user));
}

// Function delete user ด้วย id
async function deleteUser(id) {
  const existing = await getUserById(id);
  if (!existing) return null;

  const user = await prisma.user.delete({
    where: { id }
  });

  return withoutPassword(toUserApi(user));
}

// Export Functions
module.exports = {
  listUsers,
  listAllUsers,
  findActiveUserByCredentials,
  getUserById,
  isUsernameTaken,
  createUser,
  updateUser,
  deleteUser
};
