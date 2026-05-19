// Import Require
const { createId } = require('../store');
const { prisma } = require('../../db/prisma');
const { hashToken } = require('../../utils/auth');

// Function กำหนดอายุ Refresh Token เป็น 3600 วินาที หรือ 1 ชั่วโมง
const REFRESH_TOKEN_TTL_SECONDS = 3600;

// Function แปลง seconds เป็น milliseconds แล้วบวกกับเวลาปัจจุบันคืนค่า new Date 
function addSeconds(date, seconds) {
  return new Date(date.getTime() + seconds * 1000);
}

// Function คำนวณเวลาหมดอายุของ Session
function getSessionExpiryDates(now = new Date()) {
  const expiresAt = addSeconds(now, REFRESH_TOKEN_TTL_SECONDS);
  return {
    idleExpiresAt: expiresAt,
    expiresAt
  };
}

// Function สร้าง Session ใหม่ใน Database หลัง Login สำเร็จ
async function createSession({ id, userId, refreshToken, userAgent, ipAddress }) {
  const now = new Date();
  const { idleExpiresAt, expiresAt } = getSessionExpiryDates(now);

  return prisma.authSession.create({
    data: {
      id: id || createId('sess'),
      userId,
      refreshTokenHash: hashToken(refreshToken),
      userAgent: userAgent || null,
      ipAddress: ipAddress || null,
      lastUsedAt: now,
      idleExpiresAt,
      expiresAt
    }
  });
}

// Function ตรวจสอบว่า Session ยังมีอยู่ ไม่ถูก Revoke และยังไม่หมดอายุ
async function validateAccessSession(sessionId, now = new Date()) {
  if (!sessionId) return null;

  const session = await prisma.authSession.findUnique({
    where: { id: sessionId }
  });

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt <= now) return null;

  return session;
}

// Function เปลี่ยน Refresh Token Hash ที่เก็บไว้สำหรับ Session ที่ยังใช้งานได้
async function rotateRefreshToken({ sessionId, refreshToken, nextRefreshToken }) {
  const now = new Date();
  const session = await validateAccessSession(sessionId, now);

  if (!session) {
    return { ok: false, reason: 'expired' };
  }

  if (session.refreshTokenHash !== hashToken(refreshToken)) {
    await revokeSession(sessionId);
    return { ok: false, reason: 'invalid' };
  }

  const updated = await prisma.authSession.update({
    where: { id: sessionId },
    data: {
      refreshTokenHash: hashToken(nextRefreshToken),
      lastUsedAt: now
    }
  });

  return { ok: true, session: updated };
}

// Function Revoke Session เพื่อไม่ให้ Token ของ Session นี้ใช้งานต่อได้
async function revokeSession(sessionId) {
  if (!sessionId) return null;

  const existing = await prisma.authSession.findUnique({
    where: { id: sessionId }
  });
  if (!existing || existing.revokedAt) return existing;

  return prisma.authSession.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() }
  });
}

// Export Functions
module.exports = {
  REFRESH_TOKEN_TTL_SECONDS,
  createSession,
  rotateRefreshToken,
  revokeSession,
  validateAccessSession
};
