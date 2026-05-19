// Import Require
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');

const authMiddleware = require('./middleware/auth');
const { authorize } = require('./middleware/permission');

const authRoutes = require('./routes/auth.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const overviewRoutes = require('./routes/overview.routes');
const transactionRoutes = require('./routes/transactions.routes');
const usersRoutes = require('./routes/users.routes');
const memberRoutes = require('./routes/members.routes');
const servicePricingRoutes = require('./routes/servicePricing.routes');
const paymentSettingsRouter = require('./routes/paymentSettings.routes');
const kioskRoutes = require('./routes/kiosk.routes');
const devicesRoutes = require('./routes/devices.routes');
const themeRoutes = require('./routes/theme.routes');
const systemSettingsRoutes = require('./routes/systemSettings.routes');
const { prisma } = require('./db/prisma');
const openapi = require('./docs/openapi');

// Function ใช้ CORS origins จาก .env
function getCorsOrigins() {
  const origins = process.env.CORS_ORIGINS;
  if (!origins || origins === '*') return true;

  return origins.split(',').map((origin) => origin.trim());
}

// Create Express app
const app = express();

// Middleware พื้นฐานสำหรับ request body, cors, log และ static uploads
app.use(cors({
  origin: getCorsOrigins(),
  credentials: true
}));
app.use(express.json());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use('/uploads', express.static('uploads'));

// Route ตรวจสอบข้อมูลพื้นฐานของ API
app.get('/', (req, res) => {
  res.json({
    name: 'smart-carpark-api',
    version: '1.0.0',
    docs: '/docs',
    openapi: '/docs/openapi.json',
  });
});

// Route health check สำหรับตรวจสอบว่า API ทำงานอยู่
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'smart-carpark-api' });
});

// Route ส่ง OpenAPI schema เป็น JSON
app.get('/docs/openapi.json', (req, res) => {
  res.json(openapi);
});

// Route สำหรับ kiosk ที่ต้องเข้าถึงได้ก่อน auth middleware
app.use('/api/v1/kiosk', kioskRoutes);
app.use(authMiddleware);
app.use('/api/v1/auth', authRoutes);

// Route Swagger UI สำหรับอ่าน API docs
app.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(null, {
    customSiteTitle: 'Smart Carpark API Docs',
    swaggerOptions: { url: '/docs/openapi.json' },
  })
);

// Route health check สำหรับตรวจสอบการเชื่อมต่อ database
app.get('/health/db', async (req, res) => {
  const startedAt = Date.now();
  try {
    await prisma.appConfig.findFirst({ select: { key: true } });
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      db: {
        provider: 'postgresql',
        enabled: true,
        message: err.message,
      },
      durationMs: Date.now() - startedAt,
    });
  }

  return res.json({
    status: 'ok',
    db: { provider: 'postgresql', enabled: true },
    durationMs: Date.now() - startedAt,
  });
});

// Register API routes หลังผ่าน auth middleware
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/overview', overviewRoutes);
app.use('/api/v1/transactions', transactionRoutes);
app.use('/api/v1/users', authorize(['super_admin']), usersRoutes);
app.use('/api/v1/members', memberRoutes);
app.use('/api/v1/service-pricing', authorize(['super_admin', 'staff']), servicePricingRoutes);
app.use('/api/v1/payment-settings', paymentSettingsRouter);
app.use('/api/v1/devices', devicesRoutes);
app.use('/api/v1/theme', themeRoutes);
app.use('/api/v1/system-settings', systemSettingsRoutes);

// Middleware จัดการ route ที่ไม่พบ
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Middleware จัดการ error กลางของระบบ
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: err.message || 'Internal server error' });
});

// Export Express app
module.exports = app;
