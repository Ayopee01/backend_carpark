// Import Require
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const {
  getConfig,
  getConfigWithMeta,
  getExpectedConfigVersion,
  setConfig,
} = require('../data/repositories/config.repo');
const appEvents = require('../utils/events');
const { authorize } = require('../middleware/permission');
const defaults = require('../data/defaults');

const router = express.Router();

// Constant key สำหรับอ้างอิง theme config ใน table app_config
const CONFIG_KEY = 'theme';
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Constant config การเก็บไฟล์ logo ที่ upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    cb(null, `logo-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

// Constant middleware สำหรับ upload logo และตรวจสอบชนิดไฟล์
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedExt = new Set(['.jpeg', '.jpg', '.png', '.webp']);
    const allowedMime = new Set(['image/jpeg', 'image/png', 'image/webp']);
    const extname = allowedExt.has(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedMime.has(file.mimetype);
    if (extname && mimetype) return cb(null, true);
    return cb(new Error('Only images (jpg, png, webp) are allowed!'));
  }
});

// Constant ค่า default ของ theme
const DEFAULT_THEME = {
  themeColor: null,
  logoUrl: null,
  themeMode: '',
  customThemeColor: null
};

// Function ทำให้ theme response มีรูปแบบคงที่
function normalizeTheme(theme) {
  return {
    themeColor: theme?.themeColor ?? null,
    logoUrl: theme?.logoUrl ?? null,
    themeMode: theme?.themeMode ?? '',
    customThemeColor: theme?.customThemeColor ?? null,
    updatedAt: theme?.updatedAt
  };
}

function normalizeThemeWithMeta(theme) {
  return {
    ...normalizeTheme(theme),
    version: theme?.version ?? 0,
    configUpdatedAt: theme?.configUpdatedAt ?? null,
  };
}

// Function ลบไฟล์ logo เฉพาะที่อยู่ใน uploads เพื่อกัน path traversal จากค่า config
function deleteUploadedLogo(logoUrl) {
  if (!logoUrl || !String(logoUrl).startsWith('/uploads/')) return;
  const filePath = path.join(UPLOAD_DIR, path.basename(logoUrl));
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

// Apply permission check สำหรับจัดการ theme
router.use(authorize('theme'));

// Route query theme ปัจจุบัน
router.get('/', async (req, res, next) => {
  try {
    const theme = await getConfigWithMeta(CONFIG_KEY, defaults.theme);
    res.json(normalizeThemeWithMeta({ ...DEFAULT_THEME, ...theme }));
  } catch (err) {
    next(err);
  }
});

// Route update themeColor หรือ logoUrl
router.put('/', async (req, res, next) => {
  try {
    const current = normalizeTheme({
      ...DEFAULT_THEME,
      ...(await getConfig(CONFIG_KEY, defaults.theme))
    });
    const body = req.body || {};
    const hasThemeColor = Object.prototype.hasOwnProperty.call(body, 'themeColor');
    const hasLogoUrl = Object.prototype.hasOwnProperty.call(body, 'logoUrl');
    const hasThemeMode = Object.prototype.hasOwnProperty.call(body, 'themeMode');
    const hasCustomThemeColor = Object.prototype.hasOwnProperty.call(body, 'customThemeColor');

    const themeMode = hasThemeMode ? body.themeMode : current.themeMode;
    const customThemeColor = hasCustomThemeColor
      ? body.customThemeColor
      : themeMode === 'custom' && hasThemeColor
        ? body.themeColor
        : current.customThemeColor;
    const themeColor = hasThemeColor
      ? body.themeColor
      : themeMode === 'custom' && customThemeColor
        ? customThemeColor
        : current.themeColor;

    const nextTheme = {
      themeColor,
      logoUrl: hasLogoUrl ? body.logoUrl : current.logoUrl,
      themeMode,
      customThemeColor,
      updatedAt: new Date().toISOString()
    };

    const saved = await setConfig(CONFIG_KEY, nextTheme, { expectedVersion: getExpectedConfigVersion(req) });
    appEvents.emit('theme_updated', saved);
    res.json({ message: 'Theme updated', theme: normalizeThemeWithMeta(saved) });
  } catch (err) {
    next(err);
  }
});

// Route upload logo และ save logoUrl ใน theme config
router.post('/upload-logo', upload.single('logo'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload a file' });
    }

    const logoUrl = `/uploads/${req.file.filename}`;
    const current = normalizeTheme({
      ...DEFAULT_THEME,
      ...(await getConfig(CONFIG_KEY, defaults.theme))
    });

    const nextTheme = {
      themeColor: current.themeColor,
      logoUrl,
      themeMode: current.themeMode,
      customThemeColor: current.customThemeColor,
      updatedAt: new Date().toISOString()
    };

    const saved = await setConfig(CONFIG_KEY, nextTheme, { expectedVersion: getExpectedConfigVersion(req) });
    if (current.logoUrl) {
      deleteUploadedLogo(current.logoUrl);
    }
    appEvents.emit('theme_updated', saved);

    return res.json({
      message: 'Logo uploaded successfully',
      logoUrl,
      theme: normalizeThemeWithMeta(saved)
    });
  } catch (err) {
    if (req.file) {
      deleteUploadedLogo(`/uploads/${req.file.filename}`);
    }
    next(err);
  }
});

// Route delete logo และ reset logoUrl เป็น null
router.delete('/logo', async (req, res, next) => {
  try {
    const current = normalizeTheme({
      ...DEFAULT_THEME,
      ...(await getConfig(CONFIG_KEY, defaults.theme))
    });

    const nextTheme = {
      themeColor: current.themeColor,
      logoUrl: null,
      themeMode: current.themeMode,
      customThemeColor: current.customThemeColor,
      updatedAt: new Date().toISOString()
    };

    const saved = await setConfig(CONFIG_KEY, nextTheme, { expectedVersion: getExpectedConfigVersion(req) });
    if (current.logoUrl) {
      deleteUploadedLogo(current.logoUrl);
    }
    appEvents.emit('theme_updated', saved);
    return res.json({ message: 'Logo deleted and reset successfully', theme: normalizeThemeWithMeta(saved) });
  } catch (err) {
    next(err);
  }
});

// Export router
module.exports = router;

