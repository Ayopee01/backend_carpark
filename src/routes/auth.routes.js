// Import Require
const express = require('express');
const { createId } = require('../data/store');
const { findActiveUserByCredentials, getUserById } = require('../data/repositories/users.repo');
const {
  createSession,
  REFRESH_TOKEN_TTL_SECONDS,
  revokeSession,
  rotateRefreshToken
} = require('../data/repositories/authSessions.repo');
const { createToken, verifyToken } = require('../utils/auth');

const router = express.Router();

// Constant อายุ access token เป็น 1 ชั่วโมง
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;

// Function แปลง user object ให้ปลอดภัยก่อนส่งกลับ frontend
function toSafeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: user.permissions,
    status: user.status
  };
}

// Function สร้าง access token จาก user id และ session id
function createAccessToken(userId, sessionId) {
  return createToken({ type: 'access', sub: userId, sid: sessionId }, ACCESS_TOKEN_TTL_SECONDS);
}

// Function สร้าง refresh token จาก user id และ session id
function createRefreshToken(userId, sessionId) {
  return createToken({ type: 'refresh', sub: userId, sid: sessionId }, REFRESH_TOKEN_TTL_SECONDS);
}

// Route login เพื่อสร้าง access token, refresh token และ session
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const user = await findActiveUserByCredentials(username, password);

    if (!user) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const sessionId = createId('sess');
    const refreshToken = createRefreshToken(user.id, sessionId);
    const session = await createSession({
      id: sessionId,
      userId: user.id,
      refreshToken,
      userAgent: req.get('user-agent'),
      ipAddress: req.ip
    });

    const token = createAccessToken(user.id, session.id);

    return res.json({
      token,
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user: toSafeUser(user)
    });
  } catch (err) {
    next(err);
  }
});

// Route logout เพื่อ revoke session ปัจจุบัน
router.post('/logout', async (req, res, next) => {
  try {
    await revokeSession(req.sessionId);
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

// Route อ่านข้อมูล user ปัจจุบันจาก token
router.get('/me', (req, res) => {
  res.json({ user: req.user });
});

// Route refresh token เพื่อออก token ชุดใหม่และ rotate refresh token
router.post('/refresh', async (req, res, next) => {
  const { refreshToken } = req.body || {};
  try {
    const payload = verifyToken(refreshToken);
    if (!payload || payload.type !== 'refresh' || !payload.sub || !payload.sid) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    const user = await getUserById(payload.sub);
    if (!user || user.status !== 'active') {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    const nextRefreshToken = createRefreshToken(user.id, payload.sid);
    const result = await rotateRefreshToken({
      sessionId: payload.sid,
      refreshToken,
      nextRefreshToken
    });

    if (!result.ok) {
      const message = result.reason === 'expired'
        ? 'Session expired'
        : 'Invalid refresh token';
      return res.status(401).json({ message });
    }

    return res.json({
      token: createAccessToken(user.id, payload.sid),
      refreshToken: nextRefreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user
    });
  } catch (err) {
    next(err);
  }
});

// Export router
module.exports = router;
