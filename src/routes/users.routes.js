// Import Require
const express = require('express');
const { listAllUsers, createUser, updateUser, deleteUser, isUsernameTaken, getUserById } = require('../data/repositories/users.repo');
const router = express.Router();

// Route query user ทั้งหมด 
router.get('/', async (req, res, next) => {
  try {
    const { keyword } = req.query;
    const users = await listAllUsers({ keyword });
    return res.json({
      message: 'Users fetched',
      data: users
    });
  } catch (err) {
    next(err);
  }
});

// Route create user ใหม่
router.post('/', async (req, res, next) => {
  try {
    const payload = req.body;
    if (!payload.username || !payload.password || !payload.name) {
      return res.status(400).json({ message: 'username, password, and name are required' });
    }
    if (payload.permissions !== undefined && !Array.isArray(payload.permissions)) {
      return res.status(400).json({ message: 'permissions must be an array' });
    }

    if (await isUsernameTaken(payload.username)) {
      return res.status(409).json({ message: 'Username already exists' });
    }

    const user = await createUser(payload);
    return res.status(201).json({
      message: 'User created',
      data: user
    });
  } catch (err) {
    next(err);
  }
});

// Route update user ด้วย id
router.put('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    if (req.body.permissions !== undefined && !Array.isArray(req.body.permissions)) {
      return res.status(400).json({ message: 'permissions must be an array' });
    }

    const existing = await getUserById(id);
    if (!existing) {
      return res.status(404).json({ message: 'User not found' });
    }

    const nextUsername = req.body.username ?? existing.username;
    if (nextUsername !== existing.username && (await isUsernameTaken(nextUsername, { excludeId: id }))) {
      return res.status(409).json({ message: 'Username already exists' });
    }

    const user = await updateUser(id, {
      username: req.body.username ?? undefined,
      password: req.body.password ?? undefined,
      name: req.body.name ?? undefined,
      email: req.body.email ?? undefined,
      phone: req.body.phone ?? undefined,
      role: req.body.role ?? undefined,
      permissions: req.body.permissions ?? undefined,
      status: req.body.status ?? undefined
    });

    return res.json({
      message: 'User updated',
      data: user
    });
  } catch (err) {
    next(err);
  }
});

// Route delete user ด้วย id
router.delete('/:id', async (req, res, next) => {
  try {
    const user = await deleteUser(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.json({
      message: 'User deleted',
      data: user
    });
  } catch (err) {
    next(err);
  }
});

// Export router
module.exports = router;
