// Import Require
const express = require('express');
const {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  isUsernameTaken,
  getUserById
} = require('../data/repositories/users.repo');

const router = express.Router();

// Route query user แบบ pagination
router.get('/', async (req, res, next) => {
  try {
    const { keyword, page = 1, per_page = 10 } = req.query;
    const result = await listUsers({ keyword, page, perPage: per_page });
    return res.json(result);
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

    if (await isUsernameTaken(payload.username)) {
      return res.status(409).json({ message: 'Username already exists' });
    }

    const user = await createUser(payload);
    return res.status(201).json({ message: 'User created', user });
  } catch (err) {
    next(err);
  }
});

// Route update user ด้วย id
router.put('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
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
      role: req.body.role ?? undefined,
      permissions: req.body.permissions ?? undefined,
      status: req.body.status ?? undefined
    });

    return res.json({ message: 'User updated', user });
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
    return res.json({ message: 'User deleted', user });
  } catch (err) {
    next(err);
  }
});

// Export router
module.exports = router;
