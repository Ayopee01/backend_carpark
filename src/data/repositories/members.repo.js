// Import Require
const { createUser, deleteUser, getUserById, isUsernameTaken, listAllUsers, updateUser } = require('./users.repo');

// Function แบ่ง Fullname ออกเป็น FirstName และ LastName
function splitName(name = '') {
  const [firstName = '', ...rest] = String(name).trim().split(/\s+/);
  return { firstName, lastName: rest.join(' ') };
}

// Function แปลง user record ให้เป็นรูปแบบ member API
function toMemberApi(row) {
  if (!row) return null;
  const names = splitName(row.name);
  return {
    id: row.id,
    username: row.username,
    firstName: row.firstName || names.firstName,
    lastName: row.lastName || names.lastName,
    email: row.email,
    phone: row.phone || '',
    role: row.role,
    status: row.status,
    permissions: row.permissions || [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// Function query รายการ member ทั้งหมดและ filter ตาม keyword, status, role
async function listMembers({ keyword, status, role } = {}) {
  let rows = await listAllUsers({ keyword });
  rows = rows.filter((user) => user.role !== 'system');

  if (status) rows = rows.filter((row) => row.status === status);
  if (role) rows = rows.filter((row) => row.role === role);

  return rows.map(toMemberApi);
}

// Function คำนวณสถิติของ member ทั้งหมด
async function getMemberStats() {
  const rows = (await listAllUsers()).filter((user) => user.role !== 'system');

  return {
    totalMembers: rows.length,
    activeMembers: rows.filter((user) => user.status === 'active').length,
    totalAdmins: rows.filter((user) => user.role === 'super_admin').length,
  };
}

// Function create member ใหม่โดย create user record ในระบบ
async function createMember(data) {
  const username = data.username || data.email?.split('@')[0];
  const name = data.name || `${data.firstName || ''} ${data.lastName || ''}`.trim();
  if (!username) {
    const err = new Error('username or email is required');
    err.statusCode = 400;
    throw err;
  }
  if (!data.password) {
    const err = new Error('password is required');
    err.statusCode = 400;
    throw err;
  }
  if (!name) {
    const err = new Error('name, firstName, or lastName is required');
    err.statusCode = 400;
    throw err;
  }
  if (data.permissions !== undefined && !Array.isArray(data.permissions)) {
    const err = new Error('permissions must be an array');
    err.statusCode = 400;
    throw err;
  }
  if (await isUsernameTaken(username)) {
    const err = new Error('Username already exists');
    err.statusCode = 409;
    throw err;
  }

  const user = await createUser({
    username,
    password: data.password,
    name,
    email: data.email,
    role: data.role || 'staff',
    status: data.status || 'active',
    permissions: data.permissions || ['dashboard', 'transactions'],
  });

  return toMemberApi(user);
}

// Function update ข้อมูล member ด้วย id
async function updateMember(id, data) {
  const existing = await getUserById(id);
  if (!existing) return null;

  const patch = {
    ...data,
    name: data.name || (data.firstName || data.lastName
      ? `${data.firstName || ''} ${data.lastName || ''}`.trim()
      : undefined),
  };
  if (!patch.name) delete patch.name;

  const updated = await updateUser(id, patch);
  return toMemberApi(updated);
}

// Function delete member ด้วย id
async function deleteMember(id) {
  const removed = await deleteUser(id);
  return Boolean(removed);
}

// Export Functions
module.exports = {
  listMembers,
  getMemberStats,
  createMember,
  updateMember,
  deleteMember,
};
