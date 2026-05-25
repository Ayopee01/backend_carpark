// OpenAPI schema synchronized with the Express routes in src/routes.
// Keep this file as the human-facing contract for Swagger UI.

const json = (schema, example) => ({
  'application/json': {
    schema,
    ...(example !== undefined ? { example } : {}),
  },
});

const bearer = [{ bearerAuth: [] }];
const deviceAuth = [{ deviceIdHeader: [], deviceTokenHeader: [] }, { deviceBearerAuth: [] }];
const publicRoute = [];

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });

const body = (schema, example, required = true) => ({
  required,
  content: json(schema, example),
});

const ok = (description = 'OK', schema = ref('AnyObject'), example) => ({
  description,
  content: json(schema, example),
});

const error = (description) => ({
  description,
  content: json(ref('ErrorResponse')),
});

const idParam = (name = 'id', example = 't_123') => ({
  in: 'path',
  name,
  required: true,
  schema: { type: 'string' },
  example,
});

const query = (name, schema, example, required = false) => ({
  in: 'query',
  name,
  required,
  schema,
  ...(example !== undefined ? { example } : {}),
});

const configVersionHeader = {
  in: 'header',
  name: 'X-Config-Version',
  required: false,
  schema: { type: 'integer', minimum: 0 },
  example: 1,
  description: 'Optional optimistic-lock version header. Config write endpoints also accept If-Match, query version, or body.version. Use the latest version returned by the matching GET endpoint.',
};

const configVersionQuery = query('version', { type: 'integer', minimum: 0 }, 1, true);

const bearer403 = {
  401: error('Missing, invalid, expired, or revoked access token'),
  403: error('Authenticated user does not have the required permission'),
};

const configWriteResponses = {
  400: error('Missing required fields or version'),
  401: error('Missing, invalid, expired, or revoked access token'),
  403: error('Authenticated user does not have the required permission'),
  409: ok('Config version conflict', ref('ConfigConflictResponse')),
};

const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'Smart Carpark API',
    version: '1.0.0',
    description: [
      'Current API contract for the Smart Carpark backend.',
      'Admin endpoints use Bearer access tokens. Device endpoints use X-Device-Id plus X-Device-Token, or Authorization: Device <token>.',
      'Public/client endpoints are grouped under /api/v1/client and /api/v1/devices/config. Admin device management is grouped under /api/v1/devices.',
    ].join('\n'),
  },
  servers: [
    { url: '/', description: 'Same origin' },
  ],
  tags: [
    { name: 'Auth', description: 'Login, refresh token, logout, and current user endpoints.' },
    { name: 'Dashboard', description: 'Admin dashboard. Requires dashboard permission.' },
    { name: 'Overview', description: 'Admin overview reports. Requires overview permission.' },
    { name: 'Transactions', description: 'Admin transaction operations. Every endpoint in this group requires Auth Bearer token and transactions permission.' },
    { name: 'Members', description: 'Member and permission management. Requires settings permission.' },
    { name: 'Service Pricing', description: 'Pricing configuration. Requires pricing permission.' },
    { name: 'Payment Settings', description: 'Payment methods and channel mapping. Requires pricing permission.' },
    { name: 'Devices', description: 'Unified admin management for kiosk, barrier gate, and other devices. Requires devices permission.' },
    { name: 'Client Events', description: 'Shared public/device endpoints for kiosk, barrier gate, and mobile clients.' },
    { name: 'Theme', description: 'Theme and logo configuration. Requires theme permission.' },
    { name: 'System Settings', description: 'General, receipt, and printer settings. Requires settings permission.' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT-like signed access token',
      },
      deviceIdHeader: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Device-Id',
        description: 'Registered deviceId returned after kiosk or barrier-gate activation.',
      },
      deviceTokenHeader: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Device-Token',
        description: 'Device token returned once during activation.',
      },
      deviceBearerAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'Authorization',
        description: 'Alternative device credential format: Device <token>.',
      },
    },
    schemas: {
      AnyObject: {
        type: 'object',
        additionalProperties: true,
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          reason: { type: 'string' },
          requiredPermission: { type: 'string' },
        },
      },
      ConfigConflictResponse: {
        type: 'object',
        properties: {
          message: { type: 'string', example: 'Config has already been updated. Please reload the latest config before saving again.' },
          code: { type: 'string', example: 'CONFIG_VERSION_CONFLICT' },
          latest: {
            type: 'object',
            properties: {
              version: { type: 'integer', example: 17 },
              configUpdatedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'u_123' },
          username: { type: 'string', example: 'admin1' },
          name: { type: 'string', example: 'Admin One' },
          email: { type: 'string', nullable: true, example: 'admin@example.com' },
          phone: { type: 'string', nullable: true, example: '0812345678' },
          role: { type: 'string', example: 'staff' },
          permissions: {
            type: 'array',
            items: { type: 'string' },
            example: ['dashboard', 'overview', 'transactions', 'pricing', 'devices', 'theme', 'settings'],
          },
          status: { type: 'string', example: 'active' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', example: 'admin1' },
          password: { type: 'string', example: '123' },
        },
      },
      LoginResponse: {
        type: 'object',
        properties: {
          token: { type: 'string' },
          refreshToken: { type: 'string' },
          expiresIn: { type: 'integer', example: 3600 },
          user: { $ref: '#/components/schemas/User' },
        },
      },
      RefreshRequest: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string' },
        },
      },
      UserCreateRequest: {
        type: 'object',
        required: ['username', 'password', 'name'],
        properties: {
          username: { type: 'string', example: 'staff1' },
          password: { type: 'string', example: '123456' },
          name: { type: 'string', example: 'Staff One' },
          email: { type: 'string', example: 'staff1@example.com' },
          phone: { type: 'string', example: '0812345678' },
          role: { type: 'string', example: 'staff' },
          permissions: { type: 'array', items: { type: 'string' }, example: ['dashboard', 'transactions'] },
          status: { type: 'string', example: 'active' },
        },
      },
      UserUpdateRequest: {
        type: 'object',
        properties: {
          username: { type: 'string' },
          password: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string' },
          role: { type: 'string' },
          permissions: { type: 'array', items: { type: 'string' } },
          status: { type: 'string' },
        },
      },
      MemberCreateRequest: {
        type: 'object',
        required: ['password'],
        properties: {
          username: { type: 'string', example: 'cashier1', description: 'Required when email is not supplied.' },
          password: { type: 'string', example: '123456' },
          firstName: { type: 'string', example: 'Cashier' },
          lastName: { type: 'string', example: 'One' },
          name: { type: 'string', example: 'Cashier One', description: 'Required when firstName/lastName are not supplied.' },
          email: { type: 'string', example: 'cashier1@example.com' },
          role: { type: 'string', example: 'staff' },
          status: { type: 'string', example: 'active' },
          permissions: { type: 'array', items: { type: 'string' }, example: ['transactions'] },
        },
      },
      Transaction: {
        type: 'object',
        additionalProperties: true,
        properties: {
          id: { type: 'string', example: 't_123' },
          billNo: { type: 'string', example: 'PK20260524-120000' },
          plateNo: { type: 'string', example: '1ABC1234' },
          vehicleType: { type: 'string', enum: ['car', 'motorcycle'], example: 'car' },
          entryAt: { type: 'string', format: 'date-time' },
          exitAt: { type: 'string', format: 'date-time', nullable: true },
          status: { type: 'string', enum: ['pending', 'partially_paid', 'completed', 'cancelled'] },
          netAmount: { type: 'number', example: 40 },
          totalPaid: { type: 'number', example: 0 },
          remainingAmount: { type: 'number', example: 40 },
        },
      },
      CameraTransactionRequest: {
        type: 'object',
        required: ['plateNo', 'cameraId', 'gateId', 'direction'],
        properties: {
          plateNo: { type: 'string', example: '3งจ9012' },
          vehicleType: { type: 'string', enum: ['car', 'motorcycle'], default: 'car' },
          cameraId: { type: 'string', example: 'CAM-IN-01' },
          gateId: { type: 'string', example: 'GATE-A' },
          direction: { type: 'string', enum: ['IN', 'OUT'], example: 'IN' },
          capturedAt: { type: 'string', format: 'date-time', example: '2026-05-25T10:30:00+07:00' },
          confidence: { type: 'number', example: 0.92 },
          imageUrl: { type: 'string', example: 'https://example.com/plate.jpg' },
        },
      },
      TransactionUpdateRequest: {
        type: 'object',
        additionalProperties: true,
        properties: {
          plateNo: { type: 'string', example: '3งจ9012' },
          vehicleType: { type: 'string', enum: ['car', 'motorcycle'] },
          status: { type: 'string', enum: ['pending', 'partially_paid', 'completed', 'cancelled'] },
          exitAt: { type: 'string', format: 'date-time' },
          note: { type: 'string' },
        },
      },
      PaymentRequest: {
        type: 'object',
        properties: {
          transactionId: { type: 'string', example: 't_123' },
          plateNo: { type: 'string', example: '3งจ9012' },
          method: { type: 'string', enum: ['cash', 'qr', 'bank1', 'wallet', 'other'], example: 'cash', description: 'Must be active in payment_settings.methods and allowed by the selected channel.' },
          channel: { type: 'string', enum: ['cashier', 'mobile', 'kiosk', 'gate'], example: 'cashier' },
          amount: { type: 'number', example: 40 },
          deviceId: { type: 'string', example: 'K-20260524-001' },
          deviceType: { type: 'string', example: 'kiosk' },
          deviceName: { type: 'string', example: 'Kiosk A' },
          deviceLocation: { type: 'string', example: 'Main Lobby' },
        },
      },
      VersionedConfigWrite: {
        type: 'object',
        required: ['version'],
        additionalProperties: true,
        properties: {
          version: { type: 'integer', example: 1 },
        },
      },
      PricingRule: {
        type: 'object',
        required: ['price'],
        properties: {
          id: { type: 'string', example: 'pr_123' },
          name: { type: 'string', example: 'Car first hour' },
          feeType: { type: 'string', enum: ['base_hour', 'next_hour', 'overnight_day', 'overnight_week', 'overnight_month', 'overnight_year'] },
          vehicleType: { type: 'string', enum: ['car', 'motorcycle'], example: 'car' },
          price: { type: 'number', example: 20 },
          baseHours: { type: 'number', example: 1 },
          hourStart: { type: 'number', example: 1 },
          hourEnd: { type: 'number', nullable: true, example: 2 },
          periodUnit: { type: 'string', nullable: true, example: 'day' },
          periodStart: { type: 'number', example: 1 },
          periodEnd: { type: 'number', nullable: true },
          status: { type: 'string', example: 'active' },
          version: { type: 'integer', example: 1 },
        },
      },
      PaymentMethodUpdateRequest: {
        type: 'object',
        additionalProperties: true,
        properties: {
          isActive: { type: 'boolean', example: true },
        },
      },
      ChannelMappingUpdateRequest: {
        type: 'object',
        required: ['allowedMethods'],
        properties: {
          allowedMethods: { type: 'array', items: { type: 'string' }, example: ['cash', 'qr', 'wallet'] },
        },
      },
      DeviceActivationCodeCreateRequest: {
        type: 'object',
        required: ['deviceName', 'deviceType'],
        properties: {
          deviceName: { type: 'string', example: 'Test Kiosk 1' },
          deviceType: { type: 'string', enum: ['kiosk', 'barrier_gate'], example: 'kiosk', description: 'Controls which frontend role/screen the activation code belongs to.' },
          deviceCode: { type: 'string', example: 'KIOSK-A' },
          name: { type: 'string', example: 'Test Kiosk 1' },
          location: { type: 'string', example: 'Main Lobby' },
          connectionType: { type: 'string', example: 'lan' },
          note: { type: 'string' },
        },
      },
      DeviceActivationCodeCreateResponse: {
        type: 'object',
        properties: {
          CodeActivate: { type: 'string', example: '839725' },
          deviceName: { type: 'string', example: 'Test Kiosk 1' },
          deviceType: { type: 'string', example: 'kiosk' },
          status: { type: 'string', example: 'active' },
          isOnline: { type: 'boolean', example: true },
        },
      },
      DeviceUpdateRequest: {
        type: 'object',
        additionalProperties: false,
        properties: {
          deviceCode: { type: 'string', example: 'KIOSK-A' },
          deviceName: { type: 'string', example: 'Kiosk A' },
          name: { type: 'string', example: 'Kiosk A', description: 'Alias for deviceName.' },
          deviceType: { type: 'string', enum: ['kiosk', 'barrier_gate', 'camera'], example: 'kiosk' },
          connectionType: { type: 'string', example: 'lan' },
          ipAddress: { type: 'string', nullable: true, example: '192.168.1.20' },
          ip: { type: 'string', nullable: true, example: '192.168.1.20', description: 'Alias for ipAddress.' },
          location: { type: 'string', nullable: true, example: 'Main Lobby' },
          status: { type: 'string', enum: ['pending_activation', 'active', 'offline', 'maintenance'], example: 'maintenance' },
          isOnline: { type: 'boolean', example: false },
          note: { type: 'string', example: 'Temporarily disabled for maintenance' },
        },
      },
      ActivationErrorResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'error' },
          message: { type: 'string', example: 'deviceType must be kiosk or barrier_gate' },
        },
      },
      ActivationRequest: {
        type: 'object',
        required: ['code'],
        properties: {
          code: { type: 'string', example: '123456' },
        },
      },
      ActivationResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Activation successful' },
          deviceId: { type: 'string', example: 'K-20260524-001' },
          deviceType: { type: 'string', example: 'kiosk' },
          deviceToken: { type: 'string', description: 'Returned only once during activation.' },
        },
      },
      CheckInRequest: {
        type: 'object',
        required: ['deviceId'],
        properties: {
          deviceId: { type: 'string', example: 'K-20260524-001' },
          name: { type: 'string', example: 'Kiosk A' },
          location: { type: 'string', example: 'Main Lobby' },
        },
      },
      ThemeUpdateRequest: {
        type: 'object',
        required: ['version'],
        properties: {
          version: { type: 'integer', example: 1 },
          themeColor: { type: 'string', nullable: true, example: '#2563eb' },
          logoUrl: { type: 'string', nullable: true, example: '/uploads/logo.png' },
          themeMode: { type: 'string', example: 'custom' },
          customThemeColor: { type: 'string', nullable: true, example: '#2563eb' },
        },
      },
      PrinterSettingsUpdateRequest: {
        type: 'object',
        required: ['version'],
        additionalProperties: true,
        properties: {
          version: { type: 'integer', example: 1 },
          fontSize: { type: 'number', example: 12 },
          billNumberFontSize: { type: 'number', example: 18 },
          paperWidth: { type: 'number', example: 80 },
        },
      },
    },
  },
  security: bearer,
  paths: {
    '/api/v1/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login',
        security: publicRoute,
        requestBody: body(ref('LoginRequest')),
        responses: { 200: ok('Login success', ref('LoginResponse')), 401: error('Invalid username or password'), 429: error('Too many login attempts') },
      },
    },
    '/api/v1/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Refresh access token',
        security: publicRoute,
        requestBody: body(ref('RefreshRequest')),
        responses: { 200: ok('Token refreshed', ref('LoginResponse')), 401: error('Invalid refresh token or expired session') },
      },
    },
    '/api/v1/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Logout current session',
        responses: { 200: ok('Logged out'), ...bearer403 },
      },
    },
    '/api/v1/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Get current user from access token',
        responses: { 200: ok('Current user', { type: 'object', properties: { user: ref('User') } }), ...bearer403 },
      },
    },

    '/api/v1/dashboard': {
      get: {
        tags: ['Dashboard'],
        summary: 'Get today dashboard summary',
        description: 'Requires permission: dashboard.',
        responses: { 200: ok('Dashboard summary'), ...bearer403 },
      },
    },
    '/api/v1/overview/summary': {
      get: {
        tags: ['Overview'],
        summary: 'Get overview summary by date range',
        description: 'Requires permission: overview.',
        parameters: [
          query('start_date', { type: 'string', description: 'YYYY-MM-DD or date-time' }, '2026-05-01'),
          query('end_date', { type: 'string', description: 'YYYY-MM-DD or date-time' }, '2026-05-25'),
        ],
        responses: { 200: ok('Overview summary'), 400: error('Invalid start_date or end_date'), ...bearer403 },
      },
    },

    '/api/v1/transactions': {
      get: {
        tags: ['Transactions'],
        summary: 'List transactions by page',
        description: 'Admin flow. Requires Bearer token and transactions permission. Backend supports page=?&per_page=?; frontend controls the page/per_page values. Example: /api/v1/transactions?page=1&per_page=10, then /api/v1/transactions?page=2&per_page=10.',
        parameters: [
          query('keyword', { type: 'string' }, '3งจ9012'),
          query('plate_no', { type: 'string' }, '3งจ9012'),
          query('bill_no', { type: 'string' }, 'PK20260524-120000'),
          query('page', { type: 'integer', default: 1 }, 1),
          query('per_page', { type: 'integer', default: 10, maximum: 100 }, 10),
          query('all', { type: 'string', enum: ['true', '1', 'false', '0'] }, 'false'),
        ],
        responses: { 200: ok('Transactions list'), ...bearer403 },
      },
      post: {
        tags: ['Transactions'],
        summary: 'Create or update transaction from camera/LPR body',
        description: 'Admin/camera integration flow. Requires Bearer token and transactions permission. IN events create pending transactions. OUT events update the latest open transaction for the plate when possible. Duplicate camera events within 10 seconds are ignored.',
        requestBody: body(ref('CameraTransactionRequest')),
        responses: { 200: ok('Duplicate or OUT event processed'), 201: ok('Transaction created'), 400: error('Validation error'), ...bearer403 },
      },
    },
    '/api/v1/transactions/{id}': {
      get: {
        tags: ['Transactions'],
        summary: 'Get transaction by id or plateNo',
        description: 'Admin flow. Requires Bearer token and transactions permission. The path value can be a transaction id or plateNo. Example: /api/v1/transactions/3งจ9012.',
        parameters: [idParam('id', '3งจ9012')],
        responses: { 200: ok('Transaction', ref('Transaction')), 404: error('Not found'), ...bearer403 },
      },
      patch: {
        tags: ['Transactions'],
        summary: 'Update transaction fields by id or plateNo',
        description: 'Admin flow. Requires Bearer token and transactions permission. The path value can be a transaction id or plateNo.',
        parameters: [idParam('id', '3งจ9012')],
        requestBody: body(ref('TransactionUpdateRequest')),
        responses: { 200: ok('Transaction updated'), 404: error('Not found'), ...bearer403 },
      },
      delete: {
        tags: ['Transactions'],
        summary: 'Delete transaction by id or plateNo',
        description: 'Admin flow. Requires Bearer token and transactions permission. The path value can be a transaction id or plateNo.',
        parameters: [idParam('id', '3งจ9012')],
        responses: { 200: ok('Transaction deleted'), 404: error('Not found'), ...bearer403 },
      },
    },
    '/api/v1/transactions/{id}/payment': {
      post: {
        tags: ['Transactions'],
        summary: 'Confirm payment by transaction id or plateNo',
        description: 'Admin payment flow. Requires Bearer token and transactions permission. The path value can be a transaction id or plateNo. method must be active and allowed by channel in payment settings.',
        parameters: [idParam('id', '3งจ9012')],
        requestBody: body(ref('PaymentRequest'), {
          method: 'cash',
          channel: 'cashier',
          amount: 40,
        }),
        responses: {
          200: ok('Payment confirmed successfully', ref('Transaction')),
          400: error('Invalid payment method/channel, invalid amount, or payment failed'),
          404: error('Transaction not found'),
          ...bearer403,
        },
      },

    },
    '/api/v1/transactions/{id}/status': {
      patch: {
        tags: ['Transactions'],
        summary: 'Update transaction status by id or plateNo',
        description: 'Admin flow after payment. Requires Bearer token and transactions permission. The path value can be a transaction id or plateNo. It currently calls the same update logic as PATCH /api/v1/transactions/{id}.',
        parameters: [idParam('id', '3งจ9012')],
        requestBody: body(ref('TransactionUpdateRequest'), { status: 'cancelled' }),
        responses: { 200: ok('Transaction status updated'), 404: error('Not found'), ...bearer403 },
      },
    },

    '/api/v1/members/stats': {
      get: {
        tags: ['Members'],
        summary: 'Get member stats',
        description: 'Requires permission: settings.',
        responses: { 200: ok('Member stats'), ...bearer403 },
      },
    },
    '/api/v1/members': {
      get: {
        tags: ['Members'],
        summary: 'List members',
        description: 'Requires permission: settings. Query parameters are passed through to the repository as filters.',
        parameters: [
          query('keyword', { type: 'string' }, 'cashier'),
          query('status', { type: 'string' }, 'active'),
          query('role', { type: 'string' }, 'staff'),
        ],
        responses: { 200: ok('Members list'), ...bearer403 },
      },
      post: {
        tags: ['Members'],
        summary: 'Create member',
        description: 'Requires permission: settings.',
        requestBody: body(ref('MemberCreateRequest')),
        responses: { 201: ok('Member created'), 400: error('Invalid member payload'), ...bearer403 },
      },
    },
    '/api/v1/members/{id}': {
      patch: {
        tags: ['Members'],
        summary: 'Update member',
        description: 'Requires permission: settings.',
        parameters: [idParam('id', 'm_123')],
        requestBody: body(ref('UserUpdateRequest')),
        responses: { 200: ok('Member updated'), 404: error('Member not found'), ...bearer403 },
      },
      delete: {
        tags: ['Members'],
        summary: 'Delete member',
        description: 'Requires permission: settings.',
        parameters: [idParam('id', 'm_123')],
        responses: { 200: ok('Member deleted'), 404: error('Member not found'), ...bearer403 },
      },
    },
    '/api/v1/members/{id}/permissions': {
      patch: {
        tags: ['Members'],
        summary: 'Update member permissions',
        description: 'Requires permission: settings.',
        parameters: [idParam('id', 'm_123')],
        requestBody: body({
          type: 'object',
          required: ['permissions'],
          properties: { permissions: { type: 'array', items: { type: 'string' }, example: ['dashboard', 'transactions'] } },
        }),
        responses: { 200: ok('Permissions updated'), 400: error('Permissions must be an array'), 404: error('Member not found'), ...bearer403 },
      },
    },

    '/api/v1/service-pricing/config': {
      get: {
        tags: ['Service Pricing'],
        summary: 'Get pricing config with meta',
        description: 'Requires permission: pricing.',
        responses: { 200: ok('Pricing config'), ...bearer403 },
      },
      put: {
        tags: ['Service Pricing'],
        summary: 'Replace/update pricing config object',
        description: 'Requires permission: pricing.',
        parameters: [configVersionHeader],
        requestBody: body(ref('VersionedConfigWrite'), { version: 1, rules: [] }),
        responses: { 200: ok('Pricing config updated'), ...configWriteResponses },
      },
      post: {
        tags: ['Service Pricing'],
        summary: 'Create one pricing config item',
        description: 'Requires permission: pricing. price is required.',
        parameters: [configVersionHeader],
        requestBody: body(ref('PricingRule'), { version: 1, name: 'Car first hour', feeType: 'base_hour', vehicleType: 'car', price: 20 }),
        responses: { 201: ok('Pricing item created'), ...configWriteResponses },
      },
    },
    '/api/v1/service-pricing/config/{id}': {
      patch: {
        tags: ['Service Pricing'],
        summary: 'Update one pricing config item',
        description: 'Requires permission: pricing.',
        parameters: [idParam('id', 'pr_123'), configVersionHeader],
        requestBody: body(ref('PricingRule'), { version: 1, price: 25, status: 'active' }),
        responses: { 200: ok('Pricing item updated'), 404: error('Pricing config item not found'), ...configWriteResponses },
      },
      delete: {
        tags: ['Service Pricing'],
        summary: 'Delete one pricing config item',
        description: 'Requires permission: pricing.',
        parameters: [idParam('id', 'pr_123'), configVersionQuery],
        responses: { 200: ok('Pricing item deleted'), 404: error('Pricing config item not found'), ...configWriteResponses },
      },
    },

    '/api/v1/payment-settings/methods': {
      get: {
        tags: ['Payment Settings'],
        summary: 'List payment methods with meta',
        description: 'Requires permission: pricing.',
        responses: { 200: ok('Payment methods'), ...bearer403 },
      },
    },
    '/api/v1/payment-settings/methods/{id}': {
      patch: {
        tags: ['Payment Settings'],
        summary: 'Update payment method',
        description: 'Requires permission: pricing. No config version is required; this setting is managed by authorized admin users.',
        parameters: [idParam('id', 'cash')],
        requestBody: body(ref('PaymentMethodUpdateRequest'), { isActive: true }),
        responses: { 200: ok('Payment method updated'), 401: error('Missing, invalid, expired, or revoked access token'), 403: error('Authenticated user does not have the required permission'), 404: error('Method not found') },
      },
    },
    '/api/v1/payment-settings/channels': {
      get: {
        tags: ['Payment Settings'],
        summary: 'List service channels with meta',
        description: 'Requires permission: pricing.',
        responses: { 200: ok('Service channels'), ...bearer403 },
      },
    },
    '/api/v1/payment-settings/channels/{id}': {
      patch: {
        tags: ['Payment Settings'],
        summary: 'Update allowed payment methods for a channel',
        description: 'Requires permission: pricing. No config version is required; this setting is managed by authorized admin users.',
        parameters: [idParam('id', 'ch_kiosk')],
        requestBody: body(ref('ChannelMappingUpdateRequest'), { allowedMethods: ['qr', 'wallet'] }),
        responses: { 200: ok('Channel mapping updated'), 401: error('Missing, invalid, expired, or revoked access token'), 403: error('Authenticated user does not have the required permission'), 404: error('Channel not found or invalid methods') },
      },
    },

    '/api/v1/devices/events': {
      get: {
        tags: ['Devices'],
        summary: 'Admin Server-Sent Events stream for device updates',
        description: 'Requires permission: devices.',
        responses: { 200: { description: 'SSE stream' }, ...bearer403 },
      },
    },
    '/api/v1/devices/config': {
      get: {
        tags: ['Devices'],
        summary: 'Get shared client config',
        description: 'Shared config endpoint for mobile users, kiosks, and barrier gates. No admin Bearer token is required. If deviceId is supplied, valid device credentials are required and the device may be kiosk or barrier_gate.',
        security: [...deviceAuth, {}],
        parameters: [query('deviceId', { type: 'string' }, 'K-20260524-001')],
        responses: { 200: ok('Client config'), 400: error('Device identity mismatch'), 401: error('Invalid or unregistered deviceId'), 403: error('Invalid device credentials') },
      },
    },
    '/api/v1/devices': {
      get: {
        tags: ['Devices'],
        summary: 'List devices',
        description: 'Requires permission: devices. Unified list for kiosks, barrier gates, and other devices. Use query filters instead of separate kiosk/barrier-gate endpoints.',
        parameters: [
          query('deviceType', { type: 'string', enum: ['kiosk', 'barrier_gate', 'camera'] }, 'kiosk'),
          query('status', { type: 'string', enum: ['pending_activation', 'active', 'offline', 'maintenance'] }, 'active'),
          query('keyword', { type: 'string' }, 'KIOSK-A'),
        ],
        responses: { 200: ok('Devices list'), ...bearer403 },
      },
      post: {
        tags: ['Devices'],
        summary: 'Create activation code for frontend/device role',
        description: 'Requires permission: devices. Creates an activation code that the frontend enters to activate a kiosk or barrier gate role. deviceType controls which role/screen the activated frontend should show. No config version is required.',
        requestBody: body(ref('DeviceActivationCodeCreateRequest'), { deviceName: 'Test Kiosk 1', deviceType: 'kiosk' }),
        responses: {
          201: ok('Activation code created', ref('DeviceActivationCodeCreateResponse')),
          400: { description: 'Invalid request', content: json(ref('ActivationErrorResponse')) },
          409: { description: 'Duplicate device code', content: json(ref('ActivationErrorResponse')) },
          ...bearer403,
        },
      },
    },
    '/api/v1/devices/{deviceId}': {
      put: {
        tags: ['Devices'],
        summary: 'Update device by id, deviceId, or deviceCode',
        description: 'Requires permission: devices. Works for kiosk, barrier_gate, and other device records. No config version is required.',
        parameters: [idParam('deviceId', 'K-20260524-001')],
        requestBody: body(ref('DeviceUpdateRequest'), { deviceName: 'Kiosk A', location: 'Main Lobby', status: 'maintenance' }),
        responses: { 200: ok('Device updated'), 404: error('Device not found'), ...bearer403 },
      },
      delete: {
        tags: ['Devices'],
        summary: 'Delete device by id, deviceId, or deviceCode',
        description: 'Requires permission: devices. Works for kiosk, barrier_gate, and other device records. No config version is required.',
        parameters: [idParam('deviceId', 'K-20260524-001')],
        responses: { 200: ok('Device deleted'), 404: error('Device not found'), ...bearer403 },
      },
    },

    '/api/v1/client/events': {
      get: {
        tags: ['Client Events'],
        summary: 'Shared client SSE event stream',
        description: 'Shared event stream for kiosk, barrier gate, and public/mobile clients. No admin Bearer token is required. If deviceId is supplied, valid device credentials are required and the device may be kiosk or barrier_gate. Current events include connected, ping, and theme_updated.',
        security: [...deviceAuth, {}],
        parameters: [query('deviceId', { type: 'string' }, 'K-20260524-001')],
        responses: { 200: { description: 'SSE stream' }, 400: error('Device identity mismatch'), 401: error('Unauthorized device'), 403: error('Device under maintenance or invalid device credentials') },
      },
    },
    '/api/v1/client/activate': {
      post: {
        tags: ['Client Events'],
        summary: 'Activate kiosk or barrier gate with activation code',
        description: 'Shared activation endpoint for frontend clients. The role is determined by the activation code created from POST /api/v1/devices, so the frontend only needs to send the code.',
        security: publicRoute,
        requestBody: body(ref('ActivationRequest')),
        responses: { 200: ok('Activation successful', ref('ActivationResponse')), 400: error('Activation code is required, invalid, or expired') },
      },
    },
    '/api/v1/client/transaction/{id}': {
      get: {
        tags: ['Client Events'],
        summary: 'Get one payable transaction by id or plateNo',
        description: 'Public lookup for kiosk, barrier gate, and mobile users. Path {id} accepts either a transaction id or a plateNo. deviceId is optional. If deviceId is omitted, the source is treated as mobile_user. If deviceId is supplied, it must be an activated registered device.',
        security: publicRoute,
        parameters: [idParam('id', '3งจ9012'), query('deviceId', { type: 'string' }, 'K-20260521-008')],
        responses: { 200: ok('Transaction', ref('Transaction')), 401: error('Invalid or unregistered deviceId'), 403: error('Already processed or device under maintenance'), 404: error('Transaction not found') },
      },
    },
    '/api/v1/client/payment': {
      post: {
        tags: ['Client Events'],
        summary: 'Receive client payment',
        description: 'Public payment endpoint for kiosk, barrier gate, and mobile users. deviceId is optional. If deviceId belongs to a barrier gate, channel is gate; if it belongs to a kiosk, channel is kiosk; otherwise channel is mobile. The selected/default method must be active and allowed by the resolved channel.',
        security: publicRoute,
        requestBody: body(ref('PaymentRequest'), { transactionId: 't_123', method: 'qr', amount: 40, deviceId: 'K-20260521-008' }),
        responses: { 200: ok('Payment received'), 400: error('transactionId or plateNo is required, invalid payment method/channel, or payment failed'), 401: error('Invalid or unregistered deviceId'), 403: error('Device under maintenance') },
      },
    },
    '/api/v1/client/check-in': {
      post: {
        tags: ['Client Events'],
        summary: 'Shared kiosk/barrier gate heartbeat',
        description: 'Shared check-in endpoint for activated kiosk and barrier gate devices. Use X-Device-Id and X-Device-Token. The backend detects the device type from the activated device record.',
        security: deviceAuth,
        requestBody: body(ref('CheckInRequest')),
        responses: { 200: ok('Check-in successful'), 400: error('deviceId is required'), 401: error('Invalid or unregistered deviceId'), 403: error('Device under maintenance') },
      },
    },
    '/api/v1/theme': {
      get: {
        tags: ['Theme'],
        summary: 'Get theme settings with meta',
        description: 'Requires permission: theme.',
        responses: { 200: ok('Theme settings'), ...bearer403 },
      },
      put: {
        tags: ['Theme'],
        summary: 'Update theme settings',
        description: 'Requires permission: theme.',
        parameters: [configVersionHeader],
        requestBody: body(ref('ThemeUpdateRequest')),
        responses: { 200: ok('Theme updated'), ...configWriteResponses },
      },
    },
    '/api/v1/theme/upload-logo': {
      post: {
        tags: ['Theme'],
        summary: 'Upload logo file',
        description: 'Requires permission: theme. Accepts jpg, png, or webp files up to 2MB. SVG is rejected.',
        parameters: [configVersionHeader],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['logo', 'version'],
                properties: {
                  logo: { type: 'string', format: 'binary' },
                  version: { type: 'integer', example: 1 },
                },
              },
            },
          },
        },
        responses: { 200: ok('Logo uploaded'), ...configWriteResponses },
      },
    },
    '/api/v1/theme/logo': {
      delete: {
        tags: ['Theme'],
        summary: 'Delete logo and reset logoUrl',
        description: 'Requires permission: theme.',
        parameters: [configVersionQuery],
        responses: { 200: ok('Logo deleted'), ...configWriteResponses },
      },
    },

    '/api/v1/system-settings': {
      get: {
        tags: ['System Settings'],
        summary: 'Get system settings with meta',
        description: 'Requires permission: settings.',
        responses: { 200: ok('System settings'), ...bearer403 },
      },
      put: {
        tags: ['System Settings'],
        summary: 'Update system settings',
        description: 'Requires permission: settings.',
        parameters: [configVersionHeader],
        requestBody: body(ref('VersionedConfigWrite'), { version: 1, general: { systemName: 'Smart Carpark' } }),
        responses: { 200: ok('System settings updated'), ...configWriteResponses },
      },
    },
    '/api/v1/system-settings/receipt': {
      get: {
        tags: ['System Settings'],
        summary: 'Get receipt settings with meta',
        description: 'Requires permission: settings.',
        responses: { 200: ok('Receipt settings'), ...bearer403 },
      },
      put: {
        tags: ['System Settings'],
        summary: 'Update receipt settings',
        description: 'Requires permission: settings.',
        parameters: [configVersionHeader],
        requestBody: body(ref('VersionedConfigWrite'), { version: 1, entryBill: { enabled: true } }),
        responses: { 200: ok('Receipt settings updated'), ...configWriteResponses },
      },
    },
    '/api/v1/system-settings/receipt/printer': {
      put: {
        tags: ['System Settings'],
        summary: 'Update receipt printer settings',
        description: 'Requires permission: settings.',
        parameters: [configVersionHeader],
        requestBody: body(ref('PrinterSettingsUpdateRequest')),
        responses: { 200: ok('Printer settings updated'), ...configWriteResponses },
      },
    },
  },
};

module.exports = openapi;
