// Import Require
const crypto = require('crypto');

// กำหนด Algorithm ที่ใช้สำหรับ Hash Password
const HASH_ALGORITHM = 'sha256';
// กำหนดจำนวนรอบในการ Hash Password
const HASH_ITERATIONS = 100000;
// กำหนดความยาวของ key/hash ที่ต้องการ หน่วยเป็น byte
const HASH_KEY_LENGTH = 32;

// TOKEN_SECRET สำหรับสร้างค่าตรวจสอบ Token
const TOKEN_SECRET =
  process.env.AUTH_TOKEN_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'dev-token-secret-change-me';

if (
  process.env.NODE_ENV === 'production' &&
  !process.env.AUTH_TOKEN_SECRET &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY
) {
  throw new Error('AUTH_TOKEN_SECRET is required in production');
}

// Function Hash Password ก่อนบันทึกลงฐานข้อมูล
function hashPassword(password) {
  // สร้าง salt แบบสุ่ม ความยาว 16 bytes แล้วแปลงเป็น hex
  const salt = crypto.randomBytes(16).toString('hex');

  // Hash password ด้วย PBKDF2
  const hash = crypto
    .pbkdf2Sync(
      String(password),       // password ที่ต้องการ hash
      salt,                   // salt ที่สุ่มขึ้นมา
      HASH_ITERATIONS,        // จำนวนรอบในการ hash
      HASH_KEY_LENGTH,        // ความยาวของ hash
      HASH_ALGORITHM          // algorithm ที่ใช้ เช่น sha256
    )
    .toString('hex');

  // Return ค่าเป็น string format:pbkdf2_sha256:iterations:salt:hash
  return `pbkdf2_sha256:${HASH_ITERATIONS}:${salt}:${hash}`;
}

// Function ตรวจสอบ Password
function verifyPassword(password, encoded) {
  // ตรวจสอบว่ามี password หรือ encoded hash
  if (!password || !encoded) return false;

  // แยกข้อมูล hash ที่เก็บไว้ใน database
  const [scheme, iterationsRaw, salt, expectedHash] = String(encoded).split(':');

  // ตรวจสอบ format 
  if (scheme !== 'pbkdf2_sha256' || !iterationsRaw || !salt || !expectedHash) {
    return false;
  }

  // แปลงจำนวนรอบจาก string เป็น number
  const iterations = Number(iterationsRaw);

  // ตรวจสอบว่า iterations เป็นเลขจำนวนเต็ม และมากกว่า 0
  if (!Number.isInteger(iterations) || iterations <= 0) return false;

  // นำ password ที่ user กรอกมา hash ใหม่
  const actualHash = crypto
    .pbkdf2Sync(
      String(password),       // password ที่ user กรอก
      salt,                   // salt เดิม
      iterations,             // iterations เดิม
      HASH_KEY_LENGTH,        // ความยาว hash
      HASH_ALGORITHM          // algorithm เดิม
    )
    .toString('hex');

  const actualBuffer = Buffer.from(actualHash, 'hex');
  const expectedBuffer = Buffer.from(expectedHash, 'hex');
  if (actualBuffer.length !== expectedBuffer.length) return false;

  // เปรียบเทียบ hash ด้วย timingSafeEqual
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

// Function แปลง object เป็น JSON string แล้วแปลงต่อเป็น base64url
function base64Url(input) {
  return Buffer.from(JSON.stringify(input)).toString('base64url');
}

// Function Create ค่า signature ของ payload ด้วย HMAC SHA256
function signPayload(payload) {
  return crypto
    .createHmac('sha256', TOKEN_SECRET) // สร้าง HMAC ด้วย secret
    .update(payload)                    // ใส่ข้อมูลที่ต้องการ sign
    .digest('base64url');               // แปลงผลลัพธ์เป็น base64url
}

// Function Hash Token ก่อนบันทึกลง Database
function hashToken(token) {
  return crypto
    .createHash('sha256')
    .update(String(token))
    .digest('hex');
}

// Function Create Token  
function createToken(payload, ttlSeconds) {
  // สร้าง body ของ token
  const body = {
    ...payload, // ข้อมูลที่ต้องการเก็บใน token เช่น userId, role

    // เวลาหมดอายุของ token ได้ค่าเป็น milliseconds จึงต้องหาร 1000 ให้เป็น seconds
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,

    // เวลาที่สร้าง token
    iat: Math.floor(Date.now() / 1000),

    // ค่าสุ่มเพื่อให้ token แต่ละอันไม่ซ้ำกัน
    nonce: crypto.randomBytes(12).toString('hex'),
  };

  // แปลง body เป็น base64url
  const encoded = base64Url(body);

  // คืนค่า token ในรูปแบบ encoded.signature
  return `${encoded}.${signPayload(encoded)}`;
}

// Function ตรวจสอบ Token 
function verifyToken(token) {
  // ตรวจสอบว่า token มีค่า เป็น string และมีจุดคั่นระหว่าง encoded กับ signature
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;

  // แยก token ออกเป็น 2 ส่วน
  // encoded = payload ที่ถูกเข้ารหัส base64url
  // signature = ลายเซ็นที่ใช้ตรวจสอบความถูกต้อง
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encoded, signature] = parts;
  if (!encoded || !signature) return null;

  // สร้าง signature ใหม่จาก encoded payload
  const expected = signPayload(encoded);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  // ถ้าไม่มี signature หรือ signature ไม่ตรง ให้ถือว่า token ไม่ถูกต้อง
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  let payload;
  try {
    // Decode payload กลับมาเป็น object
    payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    );
  } catch (err) {
    return null;
  }

  if (!payload || typeof payload !== 'object') return null;

  // ตรวจสอบวันหมดอายุ token หากไม่มี exp หรือ exp น้อยกว่าเวลาปัจจุบัน แปลว่าหมดอายุแล้ว
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  // ถ้าทุกอย่างถูกต้อง ให้คืนค่า payload กลับไปใช้งาน
  return payload;
}

// Export Function
module.exports = {
  createToken,     // สร้าง token
  hashToken,       // hash token ก่อนบันทึก database
  hashPassword,   // hash password ก่อนบันทึก database
  verifyPassword, // ตรวจสอบ password ตอน login
  verifyToken,    // ตรวจสอบ token
};
