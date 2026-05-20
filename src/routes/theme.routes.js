// Import Require
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getConfig, setConfig } = require('../data/repositories/config.repo');
const appEvents = require('../utils/events');
const { authorize } = require('../middleware/permission');
const defaults = require('../data/defaults');

const router = express.Router();

// Constant key สำหรับอ้างอิง theme config ใน table app_config
const CONFIG_KEY = 'theme';

// Constant config การเก็บไฟล์ logo ที่ upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `logo-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

// Constant middleware สำหรับ upload logo และตรวจสอบชนิดไฟล์
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|svg|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) return cb(null, true);
    return cb(new Error('Only images (jpg, png, svg, webp) are allowed!'));
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

router.use(authorize(['super_admin', 'staff'], 'theme'));

// Route query theme ปัจจุบัน
router.get('/', async (req, res, next) => {
  try {
    const theme = await getConfig(CONFIG_KEY, defaults.theme);
    res.json(normalizeTheme({ ...DEFAULT_THEME, ...theme }));
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

    const saved = await setConfig(CONFIG_KEY, nextTheme);
    appEvents.emit('theme_updated', saved);
    res.json({ message: 'Theme updated', theme: saved });
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

    if (current.logoUrl) {
      const oldPath = path.join(process.cwd(), current.logoUrl);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    const nextTheme = {
      themeColor: current.themeColor,
      logoUrl,
      themeMode: current.themeMode,
      customThemeColor: current.customThemeColor,
      updatedAt: new Date().toISOString()
    };

    const saved = await setConfig(CONFIG_KEY, nextTheme);
    appEvents.emit('theme_updated', saved);

    return res.json({
      message: 'Logo uploaded successfully',
      logoUrl,
      theme: saved
    });
  } catch (err) {
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

    if (current.logoUrl) {
      const filePath = path.join(process.cwd(), current.logoUrl);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    const nextTheme = {
      themeColor: current.themeColor,
      logoUrl: null,
      themeMode: current.themeMode,
      customThemeColor: current.customThemeColor,
      updatedAt: new Date().toISOString()
    };

    const saved = await setConfig(CONFIG_KEY, nextTheme);
    appEvents.emit('theme_updated', saved);
    return res.json({ message: 'Logo deleted and reset successfully', theme: saved });
  } catch (err) {
    next(err);
  }
});

// Export router
module.exports = router;

