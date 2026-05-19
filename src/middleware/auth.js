// Import Require
const { getUserById } = require('../data/repositories/users.repo');
const { validateAccessSession } = require('../data/repositories/authSessions.repo');
const { verifyToken } = require('../utils/auth');

// Function middleware ตรวจสอบ access token และ session ก่อนเข้า protected route
async function authMiddleware(req, res, next) {
  if (
    req.path === '/' ||
    req.path.startsWith('/health') ||
    req.path.startsWith('/docs') ||
    req.path.startsWith('/api/v1/auth/login') ||
    req.path.startsWith('/api/v1/auth/refresh')
  ) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const token = authHeader.replace('Bearer ', '').trim();
  try {
    const payload = verifyToken(token);
    if (!payload || payload.type !== 'access' || !payload.sub || !payload.sid) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    const [session, user] = await Promise.all([
      validateAccessSession(payload.sid),
      getUserById(payload.sub)
    ]);
    if (!session || session.userId !== payload.sub) {
      return res.status(401).json({ message: 'Invalid or expired session' });
    }
    if (!user || user.status !== 'active') {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    req.user = user;
    req.token = token;
    req.sessionId = payload.sid;
    next();
  } catch (err) {
    next(err);
  }
}

// Export middleware
module.exports = authMiddleware;
