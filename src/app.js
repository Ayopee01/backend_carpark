const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');

const authMiddleware = require('./middleware/auth');
const { authorize } = require('./middlewares/auth.middleware');

const authRoutes = require('./routes/auth.routes');
const dashboardRoutes = require('./routes/dashboard.routes');

console.log("✅ APP LOADED");
console.log("📌 dashboard route path:", require.resolve('./routes/dashboard.routes'));
console.log("📌 store path:", require.resolve('./data/store'));
console.log(
  "📌 dashboard routes stack:",
  dashboardRoutes.stack?.map((layer, index) => ({
    index,
    path: layer.route?.path,
    methods: layer.route?.methods,
  }))
);

console.log(
  "📌 dashboard routes detail:",
  dashboardRoutes.stack?.map((layer, index) => ({
    index,
    name: layer.name,
    path: layer.route?.path,
    methods: layer.route?.methods,
    regexp: layer.regexp?.toString(),
    handlePreview: layer.handle?.toString?.().slice(0, 300),
  }))
);
const overviewRoutes = require('./routes/overview.routes');
const transactionRoutes = require('./routes/transactions.routes');
const usersRoutes = require('./routes/users.routes');
const memberRoutes = require('./routes/members.routes');
const servicePricingRoutes = require('./routes/servicePricing.routes');
const paymentSettingsRouter = require('./routes/paymentSettings.routes');
const kioskRoutes = require('./routes/kiosk.routes'); // [NEW] Kiosk Routes

const devicesRoutes = require('./routes/devices.routes');
const themeRoutes = require('./routes/theme.routes');
const systemSettingsRoutes = require('./routes/systemSettings.routes');
const { supabase, isSupabaseEnabled } = require('./db/supabase');
const openapi = require('./docs/openapi');

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use('/uploads', express.static('uploads'));

// --- 🌐 Public Routes (No Token Required) ---
app.get('/', (req, res) => {
  res.json({
    name: 'smart-carpark-api',
    version: '1.0.0',
    docs: '/docs',
    openapi: '/docs/openapi.json'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'smart-carpark-api' });
});

app.get('/docs/openapi.json', (req, res) => {
  res.json(openapi);
});

app.use('/api/v1/kiosk', kioskRoutes); // [NEW] เปิดทางให้ตู้ Kiosk

// --- 🔐 Authentication Middleware ---
app.use(authMiddleware);

app.use('/api/v1/auth', authRoutes);

// --- 🔐 Private Routes (Auth Required) ---
app.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(null, {
    customSiteTitle: 'Smart Carpark API Docs',
    swaggerOptions: { url: '/docs/openapi.json' }
  })
);

app.get('/health/db', async (req, res) => {
  if (!isSupabaseEnabled) {
    return res.json({
      status: 'ok',
      db: { provider: 'supabase', enabled: false, message: 'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY)' }
    });
  }

  const startedAt = Date.now();
  const { error } = await supabase.from('app_config').select('key').limit(1);

  if (error) {
    return res.status(500).json({
      status: 'error',
      db: {
        provider: 'supabase',
        enabled: true,
        message: error.message,
        details: error.details || null,
        hint: error.hint || null
      },
      durationMs: Date.now() - startedAt
    });
  }

  return res.json({
    status: 'ok',
    db: { provider: 'supabase', enabled: true },
    durationMs: Date.now() - startedAt
  });
});

app.use('/api/v1/dashboard', (req, res, next) => {
  console.log("🟡 APP HIT /api/v1/dashboard before router", {
    method: req.method,
    originalUrl: req.originalUrl,
    path: req.path,
  });

  next();
}, dashboardRoutes);

app.use('/api/v1/overview', overviewRoutes);
app.use('/api/v1/transactions', transactionRoutes);
app.use('/api/v1/users', authorize(['super_admin']), usersRoutes);
app.use('/api/v1/members', memberRoutes);
app.use('/api/v1/service-pricing', authorize(['super_admin', 'staff']), servicePricingRoutes);
app.use('/api/v1/payment-settings', paymentSettingsRouter);

app.use('/api/v1/devices', devicesRoutes);
app.use('/api/v1/theme', themeRoutes);
app.use('/api/v1/system-settings', systemSettingsRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

module.exports = app;
