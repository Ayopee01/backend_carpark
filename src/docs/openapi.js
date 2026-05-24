// OpenAPI schema synchronized with the Express routes in src/routes.
const json = (schema, example) => ({
  'application/json': {
    schema,
    ...(example !== undefined ? { example } : {}),
  },
});

const bearer = [{ bearerAuth: [] }];
const deviceAuth = [{ deviceIdHeader: [], deviceTokenHeader: [] }];
const publicRoute = [];

const idParam = (name = 'id', example = 'u_123') => ({
  in: 'path',
  name,
  required: true,
  schema: { type: 'string' },
  example,
});

const queryParam = (name, schema, example, required = false) => ({
  in: 'query',
  name,
  required,
  schema,
  ...(example !== undefined ? { example } : {}),
});

const requestBody = (schema, example, required = true) => ({
  required,
  content: json(schema, example),
});

const objectSchema = {
  type: 'object',
  additionalProperties: true,
};

const versionedObjectSchema = {
  type: 'object',
  additionalProperties: true,
  required: ['version'],
  properties: {
    version: { type: 'integer', example: 1, description: 'Latest app_config version from the GET response.' },
  },
};

const messageResponse = (description = 'OK') => ({
  description,
  content: json(objectSchema),
});

const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'Smart Carpark API',
    version: '1.0.0',
    description: 'Backend API for Smart Carpark admin, kiosk, barrier gate, payment, and device management.',
  },
  servers: [{ url: '/', description: 'https://carpark-uat.biza.me' }],
  tags: [
    { name: 'System', description: 'Root, health check, and API documentation endpoints.' },
    { name: 'Auth', description: 'Login, refresh token, logout, and current user endpoints.' },
    { name: 'Dashboard', description: 'Daily dashboard summary for the admin app.' },
    { name: 'Overview', description: 'Date range overview summary and chart data.' },
    { name: 'Transactions', description: 'Parking transactions, camera events, payments, and transaction updates.' },
    { name: 'Users', description: 'Admin user management.' },
    { name: 'Members', description: 'Member and permission management.' },
    { name: 'Service Pricing', description: 'Parking fee and pricing rule configuration.' },
    { name: 'Payment Settings', description: 'Payment methods and channel mapping.' },
    { name: 'Devices', description: 'Registered devices, activation codes, kiosks, and barrier gates.' },
    { name: 'Kiosk', description: 'Public endpoints used by kiosk devices.' },
    { name: 'Barrier Gate', description: 'Public endpoints used by barrier gate devices.' },
    { name: 'Theme', description: 'Theme and logo configuration.' },
    { name: 'System Settings', description: 'General system, receipt, and printer settings.' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'Signed access token',
      },
      deviceIdHeader: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Device-Id',
        description: 'Registered kiosk/barrier gate deviceId returned after activation.',
      },
      deviceTokenHeader: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Device-Token',
        description: 'Device token returned once during kiosk/barrier gate activation. Store it on the device and send it with device API calls.',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          message: { type: 'string' },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          username: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string', nullable: true },
          phone: { type: 'string', nullable: true },
          role: { type: 'string', example: 'staff' },
          permissions: { type: 'array', items: { type: 'string' } },
          status: { type: 'string', example: 'active' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
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
          username: { type: 'string', example: 'admin2' },
          password: { type: 'string', example: '123456' },
          name: { type: 'string', example: 'Admin Two' },
          email: { type: 'string', example: 'admin2@example.com' },
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
          username: { type: 'string', example: 'staff1', description: 'Required when email is not supplied.' },
          password: { type: 'string', example: '123456' },
          firstName: { type: 'string', example: 'Staff', description: 'Used with lastName when name is not supplied.' },
          lastName: { type: 'string', example: 'One' },
          name: { type: 'string', example: 'Staff One', description: 'Required when firstName/lastName are not supplied.' },
          email: { type: 'string', example: 'staff1@example.com', description: 'Can be used to derive username when username is not supplied.' },
          role: { type: 'string', example: 'staff' },
          status: { type: 'string', example: 'active' },
          permissions: { type: 'array', items: { type: 'string' }, example: ['dashboard', 'transactions'] },
        },
      },
      Transaction: {
        type: 'object',
        additionalProperties: true,
        properties: {
          id: { type: 'string' },
          billNo: { type: 'string' },
          plateNo: { type: 'string' },
          vehicleType: { type: 'string', enum: ['car', 'motorcycle'] },
          entryAt: { type: 'string', format: 'date-time' },
          exitAt: { type: 'string', format: 'date-time', nullable: true },
          status: { type: 'string', enum: ['pending', 'partially_paid', 'completed', 'cancelled'] },
          netAmount: { type: 'number' },
          totalPaid: { type: 'number' },
          remainingAmount: { type: 'number' },
        },
      },
      CameraTransactionRequest: {
        type: 'object',
        required: ['plateNo', 'cameraId', 'gateId', 'direction'],
        properties: {
          plateNo: { type: 'string', example: '1กก1234' },
          vehicleType: { type: 'string', enum: ['car', 'motorcycle'], default: 'car' },
          cameraId: { type: 'string', example: 'CAM-IN-01' },
          gateId: { type: 'string', example: 'GATE-A' },
          direction: { type: 'string', enum: ['IN', 'OUT'], example: 'IN' },
          capturedAt: { type: 'string', format: 'date-time', example: '2026-05-22T10:30:00+07:00' },
          confidence: { type: 'number', example: 0.92 },
          imageUrl: { type: 'string', example: 'https://example.com/plate.jpg' },
        },
      },
      PaymentRequest: {
        type: 'object',
        properties: {
          transactionId: { type: 'string' },
          plateNo: { type: 'string', example: '1กก1234' },
          method: { type: 'string', example: 'cash' },
          channel: { type: 'string', enum: ['cashier', 'mobile', 'kiosk', 'gate'], example: 'cashier' },
          amount: { type: 'number', example: 40 },
          deviceId: { type: 'string' },
          deviceType: { type: 'string' },
          deviceName: { type: 'string' },
          deviceLocation: { type: 'string' },
        },
      },
      Device: {
        type: 'object',
        additionalProperties: true,
        properties: {
          id: { type: 'string' },
          deviceId: { type: 'string', nullable: true },
          deviceCode: { type: 'string' },
          deviceName: { type: 'string' },
          deviceType: { type: 'string', example: 'kiosk' },
          status: { type: 'string', example: 'active' },
          isOnline: { type: 'boolean' },
        },
      },
      DeviceCreateRequest: {
        type: 'object',
        required: ['deviceCode', 'deviceName', 'deviceType'],
        properties: {
          deviceCode: { type: 'string', example: 'CAM-001' },
          deviceName: { type: 'string', example: 'Entrance Camera 1' },
          deviceType: { type: 'string', example: 'camera', description: 'kiosk and barrier_gate must be created through activation-code endpoints.' },
          connectionType: { type: 'string', example: 'lan' },
          ipAddress: { type: 'string', example: '192.168.1.10' },
          status: { type: 'string', example: 'active' },
          isOnline: { type: 'boolean', example: true },
          note: { type: 'string' },
        },
      },
      ActivationCodeRequest: {
        type: 'object',
        properties: {
          name: { type: 'string', example: 'Kiosk A' },
          deviceName: { type: 'string', example: 'Kiosk A' },
          deviceCode: { type: 'string', example: 'KIOSK-A' },
          location: { type: 'string', example: 'Main Lobby' },
          version: { type: 'string', example: '1.0.0' },
          note: { type: 'string' },
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
          deviceToken: {
            type: 'string',
            description: 'Returned only after activation. It is stored as a hash on the backend and cannot be read again later.',
          },
        },
      },
      CheckInRequest: {
        type: 'object',
        required: ['deviceId'],
        properties: {
          deviceId: { type: 'string', example: 'K-20260524-001' },
          name: { type: 'string' },
          location: { type: 'string' },
          version: { type: 'string', example: '1.0.0' },
        },
      },
      PricingRule: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          feeType: { type: 'string', enum: ['base_hour', 'next_hour', 'overnight_day', 'overnight_week', 'overnight_month', 'overnight_year'] },
          vehicleType: { type: 'string', enum: ['car', 'motorcycle'] },
          price: { type: 'number' },
          baseHours: { type: 'number' },
          hourStart: { type: 'number' },
          hourEnd: { type: 'number', nullable: true },
          periodUnit: { type: 'string', nullable: true },
          periodStart: { type: 'number' },
          periodEnd: { type: 'number', nullable: true },
          status: { type: 'string', example: 'active' },
        },
      },
      ThemeUpdateRequest: {
        type: 'object',
        required: ['version'],
        properties: {
          version: { type: 'integer', example: 1 },
          themeColor: { type: 'string', nullable: true, example: '#2563eb' },
          logoUrl: { type: 'string', nullable: true },
          themeMode: { type: 'string', example: 'custom' },
          customThemeColor: { type: 'string', nullable: true, example: '#2563eb' },
        },
      },
      ConfigConflictResponse: {
        type: 'object',
        properties: {
          message: { type: 'string', example: 'Config has already been updated. Please reload the latest config before saving again.' },
          code: { type: 'string', example: 'CONFIG_VERSION_CONFLICT' },
          latest: { type: 'object', additionalProperties: true },
        },
      },
    },
  },
  security: bearer,
  paths: {
    '/': {
      get: {
        tags: ['System'],
        summary: 'API root metadata',
        security: publicRoute,
        responses: { 200: messageResponse('API metadata') },
      },
    },
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Health check',
        security: publicRoute,
        responses: { 200: messageResponse('Service is healthy') },
      },
    },
    '/health/db': {
      get: {
        tags: ['System'],
        summary: 'Database connectivity check',
        security: publicRoute,
        responses: {
          200: messageResponse('Database connection is healthy'),
          500: messageResponse('Database connection failed'),
        },
      },
    },
    '/docs': {
      get: {
        tags: ['System'],
        summary: 'Swagger UI',
        security: publicRoute,
        responses: { 200: { description: 'Swagger UI HTML' } },
      },
    },
    '/docs/openapi.json': {
      get: {
        tags: ['System'],
        summary: 'OpenAPI JSON document',
        security: publicRoute,
        responses: { 200: messageResponse('OpenAPI JSON') },
      },
    },

    '/api/v1/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login',
        security: publicRoute,
        requestBody: requestBody({ $ref: '#/components/schemas/LoginRequest' }),
        responses: {
          200: { description: 'Login success', content: json({ $ref: '#/components/schemas/LoginResponse' }) },
          401: messageResponse('Invalid username or password'),
          429: messageResponse('Too many login attempts'),
        },
      },
    },
    '/api/v1/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Refresh access token',
        security: publicRoute,
        requestBody: requestBody({ $ref: '#/components/schemas/RefreshRequest' }),
        responses: {
          200: { description: 'Token refreshed', content: json({ $ref: '#/components/schemas/LoginResponse' }) },
          401: messageResponse('Invalid refresh token'),
        },
      },
    },
    '/api/v1/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Logout current session',
        responses: { 200: messageResponse('Logged out') },
      },
    },
    '/api/v1/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Get current user from access token',
        responses: { 200: { description: 'Current user', content: json({ type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } }) } },
      },
    },

    '/api/v1/dashboard': {
      get: {
        tags: ['Dashboard'],
        summary: 'Get today dashboard summary',
        responses: { 200: messageResponse('Dashboard summary') },
      },
    },
    '/api/v1/overview/summary': {
      get: {
        tags: ['Overview'],
        summary: 'Get overview summary by date range',
        parameters: [
          queryParam('start_date', { type: 'string', description: 'YYYY-MM-DD or date-time' }, '2026-05-01'),
          queryParam('end_date', { type: 'string', description: 'YYYY-MM-DD or date-time' }, '2026-05-24'),
        ],
        responses: {
          200: messageResponse('Overview summary'),
          400: messageResponse('Invalid start_date or end_date'),
        },
      },
    },

    '/api/v1/transactions': {
      get: {
        tags: ['Transactions'],
        summary: 'List/search transactions',
        parameters: [
          queryParam('keyword', { type: 'string' }, '1กก1234'),
          queryParam('plate_no', { type: 'string' }, '1กก1234'),
          queryParam('bill_no', { type: 'string' }, 'PK20260524-120000'),
          queryParam('page', { type: 'integer', default: 1 }, 1),
          queryParam('per_page', { type: 'integer', default: 10, maximum: 100 }, 10),
          queryParam('all', { type: 'string', enum: ['true', '1', 'false', '0'] }, 'false'),
        ],
        responses: { 200: messageResponse('Transactions list') },
      },
      post: {
        tags: ['Transactions'],
        summary: 'Create transaction from LPR/camera payload',
        description: 'Creates a pending transaction from an IN camera event. OUT events update the latest open transaction for the plate when possible. Duplicate camera events within 10 seconds are ignored.',
        requestBody: requestBody({ $ref: '#/components/schemas/CameraTransactionRequest' }),
        responses: {
          201: messageResponse('Transaction created from camera'),
          200: messageResponse('Duplicate camera event ignored'),
          400: messageResponse('Validation error'),
        },
      },
    },
    '/api/v1/transactions/payment': {
      post: {
        tags: ['Transactions'],
        summary: 'Confirm payment by plateNo in body',
        deprecated: true,
        description: 'Legacy endpoint kept for backwards compatibility. Prefer POST /api/v1/transactions/{id}/payment.',
        requestBody: requestBody({ $ref: '#/components/schemas/PaymentRequest' }, { plateNo: '1กก1234', method: 'cash', channel: 'cashier', amount: 40 }),
        responses: {
          200: messageResponse('Payment confirmed'),
          404: messageResponse('Transaction not found for plateNo'),
        },
      },
    },
    '/api/v1/transactions/{id}': {
      get: {
        tags: ['Transactions'],
        summary: 'Get transaction by id or plateNo',
        parameters: [idParam('id', '1กก1234')],
        responses: { 200: messageResponse('Transaction details'), 404: messageResponse('Not found') },
      },
      patch: {
        tags: ['Transactions'],
        summary: 'Update transaction fields by id or plateNo',
        parameters: [idParam('id', 't_123')],
        requestBody: requestBody(objectSchema, { vehicleType: 'car', serviceType: 'parking', status: 'pending' }),
        responses: { 200: messageResponse('Updated'), 404: messageResponse('Not found') },
      },
      delete: {
        tags: ['Transactions'],
        summary: 'Delete transaction by id or plateNo',
        parameters: [idParam('id', 't_123')],
        responses: { 200: messageResponse('Deleted'), 404: messageResponse('Not found') },
      },
    },
    '/api/v1/transactions/{id}/payment': {
      post: {
        tags: ['Transactions'],
        summary: 'Confirm payment by id or plateNo in path',
        parameters: [idParam('id', 't_123')],
        requestBody: requestBody({ $ref: '#/components/schemas/PaymentRequest' }, { method: 'cash', channel: 'cashier', amount: 40 }),
        responses: { 200: messageResponse('Payment confirmed'), 404: messageResponse('Transaction not found') },
      },
    },
    '/api/v1/transactions/{id}/status': {
      patch: {
        tags: ['Transactions'],
        summary: 'Legacy endpoint: update transaction status by id or plateNo',
        deprecated: true,
        parameters: [idParam('id', 't_123')],
        requestBody: requestBody(objectSchema, { status: 'cancelled' }),
        responses: { 200: messageResponse('Updated'), 404: messageResponse('Not found') },
      },
    },

    '/api/v1/users': {
      get: {
        tags: ['Users'],
        summary: 'List all admin users',
        description: 'Returns all users because this screen is for a small admin list. Optional keyword searches name, email, username, and role.',
        parameters: [queryParam('keyword', { type: 'string' }, 'admin')],
        responses: {
          200: {
            description: 'Users list',
            content: json({
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Users fetched' },
                data: { type: 'array', items: { $ref: '#/components/schemas/User' } },
              },
            }),
          },
        },
      },
      post: {
        tags: ['Users'],
        summary: 'Create admin user',
        requestBody: requestBody({ $ref: '#/components/schemas/UserCreateRequest' }),
        responses: {
          201: messageResponse('User created'),
          400: messageResponse('Required fields missing'),
          409: messageResponse('Username already exists'),
        },
      },
    },
    '/api/v1/users/{id}': {
      put: {
        tags: ['Users'],
        summary: 'Update admin user',
        parameters: [idParam('id', 'u_123')],
        requestBody: requestBody({ $ref: '#/components/schemas/UserUpdateRequest' }),
        responses: {
          200: messageResponse('User updated'),
          404: messageResponse('User not found'),
          409: messageResponse('Username already exists'),
        },
      },
      delete: {
        tags: ['Users'],
        summary: 'Delete admin user',
        parameters: [idParam('id', 'u_123')],
        responses: { 200: messageResponse('User deleted'), 404: messageResponse('User not found') },
      },
    },

    '/api/v1/members/stats': {
      get: { tags: ['Members'], summary: 'Get member stats', responses: { 200: messageResponse('Member stats') } },
    },
    '/api/v1/members': {
      get: {
        tags: ['Members'],
        summary: 'List members',
        parameters: [
          queryParam('keyword', { type: 'string' }, 'staff'),
          queryParam('status', { type: 'string' }, 'active'),
          queryParam('role', { type: 'string' }, 'staff'),
        ],
        responses: { 200: messageResponse('Members list') },
      },
      post: {
        tags: ['Members'],
        summary: 'Create member',
        requestBody: requestBody({ $ref: '#/components/schemas/MemberCreateRequest' }),
        responses: {
          201: messageResponse('Member created'),
          400: messageResponse('Required fields missing or invalid'),
          409: messageResponse('Username already exists'),
        },
      },
    },
    '/api/v1/members/{id}': {
      patch: {
        tags: ['Members'],
        summary: 'Update member',
        parameters: [idParam('id', 'u_123')],
        requestBody: requestBody({ $ref: '#/components/schemas/MemberCreateRequest' }),
        responses: { 200: messageResponse('Member updated'), 404: messageResponse('Member not found') },
      },
      delete: {
        tags: ['Members'],
        summary: 'Delete member',
        parameters: [idParam('id', 'u_123')],
        responses: { 200: messageResponse('Member deleted'), 404: messageResponse('Member not found') },
      },
    },
    '/api/v1/members/{id}/permissions': {
      patch: {
        tags: ['Members'],
        summary: 'Update member permissions',
        parameters: [idParam('id', 'u_123')],
        requestBody: requestBody({
          type: 'object',
          required: ['permissions'],
          properties: { permissions: { type: 'array', items: { type: 'string' }, example: ['dashboard', 'transactions'] } },
        }),
        responses: { 200: messageResponse('Permissions updated'), 400: messageResponse('Permissions must be an array'), 404: messageResponse('Member not found') },
      },
    },

    '/api/v1/service-pricing/config': {
      get: { tags: ['Service Pricing'], summary: 'Get pricing config', responses: { 200: messageResponse('Pricing config') } },
      put: {
        tags: ['Service Pricing'],
        summary: 'Update pricing config object',
        description: 'Requires the latest version from GET /api/v1/service-pricing/config. Returns 409 if another admin saved first.',
        requestBody: requestBody(versionedObjectSchema),
        responses: { 200: messageResponse('Pricing config updated'), 400: messageResponse('version is required'), 409: { description: 'Config version conflict', content: json({ $ref: '#/components/schemas/ConfigConflictResponse' }) } },
      },
      post: {
        tags: ['Service Pricing'],
        summary: 'Create one pricing rule',
        description: 'Requires the latest pricing config version.',
        requestBody: requestBody({
          allOf: [{ $ref: '#/components/schemas/PricingRule' }, versionedObjectSchema],
        }, { version: 1, name: 'Car base hour', feeType: 'base_hour', vehicleType: 'car', baseHours: 1, hourStart: 1, hourEnd: 1, price: 20, status: 'active' }),
        responses: { 201: messageResponse('Pricing rule created'), 400: messageResponse('version is required'), 409: { description: 'Config version conflict', content: json({ $ref: '#/components/schemas/ConfigConflictResponse' }) } },
      },
    },
    '/api/v1/service-pricing/config/{id}': {
      patch: {
        tags: ['Service Pricing'],
        summary: 'Update one pricing rule',
        parameters: [idParam('id', 'pr_123')],
        requestBody: requestBody({
          allOf: [{ $ref: '#/components/schemas/PricingRule' }, versionedObjectSchema],
        }, { version: 1, price: 25, status: 'active' }),
        responses: { 200: messageResponse('Pricing rule updated'), 400: messageResponse('version is required'), 404: messageResponse('Config item not found'), 409: { description: 'Config version conflict', content: json({ $ref: '#/components/schemas/ConfigConflictResponse' }) } },
      },
      delete: {
        tags: ['Service Pricing'],
        summary: 'Delete one pricing rule',
        parameters: [idParam('id', 'pr_123'), queryParam('version', { type: 'integer' }, 1, true)],
        responses: { 200: messageResponse('Pricing rule deleted'), 400: messageResponse('version is required'), 404: messageResponse('Config item not found'), 409: { description: 'Config version conflict', content: json({ $ref: '#/components/schemas/ConfigConflictResponse' }) } },
      },
    },

    '/api/v1/payment-settings/methods': {
      get: { tags: ['Payment Settings'], summary: 'List payment methods', responses: { 200: messageResponse('Payment methods') } },
    },
    '/api/v1/payment-settings/methods/{id}': {
      patch: {
        tags: ['Payment Settings'],
        summary: 'Update payment method',
        parameters: [idParam('id', 'cash')],
        requestBody: requestBody(versionedObjectSchema, { version: 1, isActive: true }),
        responses: { 200: messageResponse('Payment method updated'), 400: messageResponse('version is required'), 404: messageResponse('Method not found'), 409: { description: 'Config version conflict', content: json({ $ref: '#/components/schemas/ConfigConflictResponse' }) } },
      },
    },
    '/api/v1/payment-settings/channels': {
      get: { tags: ['Payment Settings'], summary: 'List service channels', responses: { 200: messageResponse('Service channels') } },
    },
    '/api/v1/payment-settings/channels/{id}': {
      patch: {
        tags: ['Payment Settings'],
        summary: 'Update allowed payment methods for a channel',
        parameters: [idParam('id', 'ch_kiosk')],
        requestBody: requestBody({ type: 'object', required: ['allowedMethods', 'version'], properties: { version: { type: 'integer', example: 1 }, allowedMethods: { type: 'array', items: { type: 'string' }, example: ['qr', 'wallet'] } } }),
        responses: { 200: messageResponse('Channel mapping updated'), 400: messageResponse('version is required'), 404: messageResponse('Channel not found or invalid methods'), 409: { description: 'Config version conflict', content: json({ $ref: '#/components/schemas/ConfigConflictResponse' }) } },
      },
    },

    '/api/v1/devices/events': {
      get: {
        tags: ['Devices'],
        summary: 'Server-Sent Events for device updates',
        responses: { 200: { description: 'SSE stream' } },
      },
    },
    '/api/v1/devices/config': {
      get: { tags: ['Devices'], summary: 'Get devices config with summary', responses: { 200: messageResponse('Devices config') } },
    },
    '/api/v1/devices': {
      post: {
        tags: ['Devices'],
        summary: 'Create normal device',
        description: 'deviceType kiosk and barrier_gate are rejected here. Use activation-code endpoints for those device types.',
        requestBody: requestBody({
          allOf: [{ $ref: '#/components/schemas/DeviceCreateRequest' }, versionedObjectSchema],
        }, { version: 1, deviceCode: 'CAM-001', deviceName: 'Entrance Camera 1', deviceType: 'camera' }),
        responses: { 201: messageResponse('Device created'), 400: messageResponse('Invalid device type, missing required fields, or version is required'), 409: messageResponse('Config conflict or device code already exists') },
      },
    },
    '/api/v1/devices/{id}': {
      put: {
        tags: ['Devices'],
        summary: 'Update device by id',
        parameters: [idParam('id', 'd_123')],
        requestBody: requestBody(versionedObjectSchema, { version: 1, deviceName: 'Entrance Camera 1', isOnline: true }),
        responses: { 200: messageResponse('Device updated'), 400: messageResponse('version is required'), 404: messageResponse('Device not found'), 409: { description: 'Config version conflict', content: json({ $ref: '#/components/schemas/ConfigConflictResponse' }) } },
      },
      delete: {
        tags: ['Devices'],
        summary: 'Delete device by id',
        parameters: [idParam('id', 'd_123'), queryParam('version', { type: 'integer' }, 1, true)],
        responses: { 200: messageResponse('Device deleted'), 400: messageResponse('version is required'), 404: messageResponse('Device not found'), 409: { description: 'Config version conflict', content: json({ $ref: '#/components/schemas/ConfigConflictResponse' }) } },
      },
    },
    '/api/v1/devices/kiosks/activation-code': {
      post: {
        tags: ['Devices'],
        summary: 'Generate kiosk activation code',
        requestBody: requestBody({
          allOf: [{ $ref: '#/components/schemas/ActivationCodeRequest' }, versionedObjectSchema],
        }, { version: 1, deviceName: 'Kiosk A', location: 'Main Lobby' }),
        responses: { 200: messageResponse('Activation code generated'), 400: messageResponse('version is required'), 409: messageResponse('Config conflict or device code already exists') },
      },
    },
    '/api/v1/devices/barrier-gates/activation-code': {
      post: {
        tags: ['Devices'],
        summary: 'Generate barrier gate activation code',
        requestBody: requestBody({
          allOf: [{ $ref: '#/components/schemas/ActivationCodeRequest' }, versionedObjectSchema],
        }, { version: 1, deviceName: 'Gate A', location: 'Exit 1' }),
        responses: { 200: messageResponse('Activation code generated'), 400: messageResponse('version is required'), 409: messageResponse('Config conflict or device code already exists') },
      },
    },
    '/api/v1/devices/kiosks': {
      get: { tags: ['Devices'], summary: 'List kiosks with summary', responses: { 200: messageResponse('Kiosks list') } },
    },
    '/api/v1/devices/kiosks/{deviceId}': {
      put: {
        tags: ['Devices'],
        summary: 'Update kiosk by deviceId',
        parameters: [idParam('deviceId', 'K-20260524-001')],
        requestBody: requestBody(versionedObjectSchema, { version: 1, name: 'Kiosk A', location: 'Main Lobby', status: 'maintenance' }),
        responses: { 200: messageResponse('Kiosk updated'), 400: messageResponse('version is required'), 404: messageResponse('Kiosk not found'), 409: { description: 'Config version conflict', content: json({ $ref: '#/components/schemas/ConfigConflictResponse' }) } },
      },
      delete: {
        tags: ['Devices'],
        summary: 'Delete kiosk by deviceId',
        parameters: [idParam('deviceId', 'K-20260524-001'), queryParam('version', { type: 'integer' }, 1, true)],
        responses: { 200: messageResponse('Kiosk deleted'), 400: messageResponse('version is required'), 404: messageResponse('Kiosk not found'), 409: { description: 'Config version conflict', content: json({ $ref: '#/components/schemas/ConfigConflictResponse' }) } },
      },
    },
    '/api/v1/devices/barrier-gates': {
      get: { tags: ['Devices'], summary: 'List barrier gates with summary', responses: { 200: messageResponse('Barrier gates list') } },
    },
    '/api/v1/devices/barrier-gates/{deviceId}': {
      put: {
        tags: ['Devices'],
        summary: 'Update barrier gate by deviceId',
        parameters: [idParam('deviceId', 'BG-20260524-001')],
        requestBody: requestBody(versionedObjectSchema, { version: 1, name: 'Gate A', location: 'Exit 1', status: 'maintenance' }),
        responses: { 200: messageResponse('Barrier gate updated'), 400: messageResponse('version is required'), 404: messageResponse('Barrier Gate not found'), 409: { description: 'Config version conflict', content: json({ $ref: '#/components/schemas/ConfigConflictResponse' }) } },
      },
      delete: {
        tags: ['Devices'],
        summary: 'Delete barrier gate by deviceId',
        parameters: [idParam('deviceId', 'BG-20260524-001'), queryParam('version', { type: 'integer' }, 1, true)],
        responses: { 200: messageResponse('Barrier gate deleted'), 400: messageResponse('version is required'), 404: messageResponse('Barrier Gate not found'), 409: { description: 'Config version conflict', content: json({ $ref: '#/components/schemas/ConfigConflictResponse' }) } },
      },
    },

    '/api/v1/kiosk/events': {
      get: {
        tags: ['Kiosk'],
        summary: 'Kiosk SSE event stream',
        description: 'If deviceId is supplied, X-Device-Token is required so the stream can be bound to a registered kiosk.',
        security: [...deviceAuth, {}],
        parameters: [queryParam('deviceId', { type: 'string' }, 'K-20260524-001')],
        responses: { 200: { description: 'SSE stream' }, 401: messageResponse('Unauthorized device'), 403: messageResponse('Kiosk under maintenance') },
      },
    },
    '/api/v1/kiosk/entry': {
      post: {
        tags: ['Kiosk'],
        summary: 'Create entry bill from kiosk',
        security: deviceAuth,
        requestBody: requestBody({ type: 'object', required: ['deviceId', 'plateNo'], properties: { deviceId: { type: 'string' }, plateNo: { type: 'string' }, vehicleType: { type: 'string', enum: ['car', 'motorcycle'] } } }, { deviceId: 'K-20260524-001', plateNo: '1กก1234', vehicleType: 'car' }),
        responses: { 201: messageResponse('Entry bill created'), 400: messageResponse('Missing required fields'), 403: messageResponse('Invalid kiosk or maintenance') },
      },
    },
    '/api/v1/kiosk/check-in': {
      post: {
        tags: ['Kiosk'],
        summary: 'Kiosk heartbeat/check-in',
        security: deviceAuth,
        requestBody: requestBody({ $ref: '#/components/schemas/CheckInRequest' }),
        responses: { 200: messageResponse('Check-in successful'), 401: messageResponse('Invalid or unregistered deviceId'), 403: messageResponse('Kiosk under maintenance') },
      },
    },
    '/api/v1/kiosk/activate': {
      post: {
        tags: ['Kiosk'],
        summary: 'Activate kiosk with activation code',
        security: publicRoute,
        requestBody: requestBody({ $ref: '#/components/schemas/ActivationRequest' }),
        responses: {
          200: { description: 'Activation successful', content: json({ $ref: '#/components/schemas/ActivationResponse' }) },
          400: messageResponse('Invalid or expired code'),
        },
      },
    },
    '/api/v1/kiosk/config': {
      get: {
        tags: ['Kiosk'],
        summary: 'Get kiosk config/theme',
        description: 'Can be called without deviceId for initial theme/config loading. If deviceId is supplied, X-Device-Token is required.',
        security: publicRoute,
        parameters: [queryParam('deviceId', { type: 'string' }, 'K-20260524-001')],
        responses: { 200: messageResponse('Kiosk config'), 401: messageResponse('Invalid or unregistered deviceId') },
      },
    },
    '/api/v1/kiosk/search': {
      get: {
        tags: ['Kiosk'],
        summary: 'Search payable transactions by plateNo',
        security: deviceAuth,
        parameters: [
          queryParam('plateNo', { type: 'string' }, '1กก1234', true),
          queryParam('deviceId', { type: 'string' }, 'K-20260524-001'),
        ],
        responses: { 200: messageResponse('Payable transactions'), 400: messageResponse('plateNo is required'), 401: messageResponse('Invalid device') },
      },
    },
    '/api/v1/kiosk/transaction': {
      get: {
        tags: ['Kiosk'],
        summary: 'Get one payable transaction by plateNo',
        security: deviceAuth,
        parameters: [
          queryParam('plateNo', { type: 'string' }, '1กก1234', true),
          queryParam('deviceId', { type: 'string' }, 'K-20260524-001'),
        ],
        responses: { 200: messageResponse('Transaction'), 404: messageResponse('Transaction not found') },
      },
    },
    '/api/v1/kiosk/transaction/{id}': {
      get: {
        tags: ['Kiosk'],
        summary: 'Get one kiosk transaction by id',
        security: deviceAuth,
        parameters: [idParam('id', 't_123'), queryParam('deviceId', { type: 'string' }, 'K-20260524-001')],
        responses: { 200: messageResponse('Transaction'), 404: messageResponse('Transaction not found') },
      },
    },
    '/api/v1/kiosk/payment': {
      post: {
        tags: ['Kiosk'],
        summary: 'Receive kiosk payment',
        security: deviceAuth,
        requestBody: requestBody({ $ref: '#/components/schemas/PaymentRequest' }, { transactionId: 't_123', method: 'qr_code', amount: 40, deviceId: 'K-20260524-001' }),
        responses: { 200: messageResponse('Payment received'), 400: messageResponse('Payment processing failed'), 401: messageResponse('Invalid kiosk') },
      },
    },

    '/api/v1/barrier-gate/activate': {
      post: {
        tags: ['Barrier Gate'],
        summary: 'Activate barrier gate with activation code',
        security: publicRoute,
        requestBody: requestBody({ $ref: '#/components/schemas/ActivationRequest' }),
        responses: {
          200: { description: 'Activation successful', content: json({ $ref: '#/components/schemas/ActivationResponse' }) },
          400: messageResponse('Invalid or expired code'),
        },
      },
    },
    '/api/v1/barrier-gate/check-in': {
      post: {
        tags: ['Barrier Gate'],
        summary: 'Barrier gate heartbeat/check-in',
        security: deviceAuth,
        requestBody: requestBody({ $ref: '#/components/schemas/CheckInRequest' }, { deviceId: 'BG-20260524-001', name: 'Gate A', location: 'Exit 1', version: '1.0.0' }),
        responses: { 200: messageResponse('Check-in successful'), 401: messageResponse('Invalid or unregistered deviceId'), 403: messageResponse('Barrier Gate under maintenance') },
      },
    },
    '/api/v1/barrier-gate/transaction': {
      get: {
        tags: ['Barrier Gate'],
        summary: 'Get payable transaction by plateNo',
        security: deviceAuth,
        parameters: [
          queryParam('plateNo', { type: 'string' }, '1กก1234', true),
          queryParam('deviceId', { type: 'string' }, 'BG-20260524-001'),
        ],
        responses: { 200: messageResponse('Transaction'), 404: messageResponse('Transaction not found') },
      },
    },
    '/api/v1/barrier-gate/transaction/{id}': {
      get: {
        tags: ['Barrier Gate'],
        summary: 'Get transaction by id',
        security: deviceAuth,
        parameters: [idParam('id', 't_123'), queryParam('deviceId', { type: 'string' }, 'BG-20260524-001')],
        responses: { 200: messageResponse('Transaction'), 404: messageResponse('Transaction not found') },
      },
    },
    '/api/v1/barrier-gate/payment': {
      post: {
        tags: ['Barrier Gate'],
        summary: 'Receive payment from barrier gate',
        security: deviceAuth,
        requestBody: requestBody({ $ref: '#/components/schemas/PaymentRequest' }, { transactionId: 't_123', method: 'wallet', amount: 40, deviceId: 'BG-20260524-001' }),
        responses: { 200: messageResponse('Payment received'), 400: messageResponse('Payment processing failed'), 401: messageResponse('Invalid barrier gate') },
      },
    },

    '/api/v1/theme': {
      get: { tags: ['Theme'], summary: 'Get theme settings', responses: { 200: messageResponse('Theme settings') } },
      put: {
        tags: ['Theme'],
        summary: 'Update theme settings',
        requestBody: requestBody({ $ref: '#/components/schemas/ThemeUpdateRequest' }),
        responses: { 200: messageResponse('Theme updated'), 400: messageResponse('version is required'), 409: { description: 'Config version conflict', content: json({ $ref: '#/components/schemas/ConfigConflictResponse' }) } },
      },
    },
    '/api/v1/theme/upload-logo': {
      post: {
        tags: ['Theme'],
        summary: 'Upload logo file',
        description: 'Accepts jpg, png, or webp files up to 2MB. SVG is rejected for security.',
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
        responses: { 200: messageResponse('Logo uploaded'), 400: messageResponse('Please upload a file or version is required'), 409: { description: 'Config version conflict', content: json({ $ref: '#/components/schemas/ConfigConflictResponse' }) } },
      },
    },
    '/api/v1/theme/logo': {
      delete: {
        tags: ['Theme'],
        summary: 'Delete logo and reset logoUrl',
        parameters: [queryParam('version', { type: 'integer' }, 1, true)],
        responses: { 200: messageResponse('Logo deleted'), 400: messageResponse('version is required'), 409: { description: 'Config version conflict', content: json({ $ref: '#/components/schemas/ConfigConflictResponse' }) } },
      },
    },

    '/api/v1/system-settings': {
      get: { tags: ['System Settings'], summary: 'Get system settings', responses: { 200: messageResponse('System settings') } },
      put: {
        tags: ['System Settings'],
        summary: 'Update system settings',
        requestBody: requestBody(versionedObjectSchema),
        responses: { 200: messageResponse('System settings updated'), 400: messageResponse('version is required'), 409: { description: 'Config version conflict', content: json({ $ref: '#/components/schemas/ConfigConflictResponse' }) } },
      },
    },
    '/api/v1/system-settings/receipt': {
      get: { tags: ['System Settings'], summary: 'Get receipt settings', responses: { 200: messageResponse('Receipt settings') } },
      put: {
        tags: ['System Settings'],
        summary: 'Update receipt settings',
        requestBody: requestBody(versionedObjectSchema),
        responses: { 200: messageResponse('Receipt settings updated'), 400: messageResponse('version is required'), 409: { description: 'Config version conflict', content: json({ $ref: '#/components/schemas/ConfigConflictResponse' }) } },
      },
    },
    '/api/v1/system-settings/receipt/printer': {
      put: {
        tags: ['System Settings'],
        summary: 'Update receipt printer settings',
        requestBody: requestBody({
          type: 'object',
          required: ['version'],
          properties: {
            version: { type: 'integer', example: 1 },
            fontSize: { type: 'number' },
            billNumberFontSize: { type: 'number' },
            paperWidth: { type: 'number' },
          },
        }, { version: 1, fontSize: 12, billNumberFontSize: 18, paperWidth: 80 }),
        responses: { 200: messageResponse('Printer settings updated'), 400: messageResponse('version is required'), 409: { description: 'Config version conflict', content: json({ $ref: '#/components/schemas/ConfigConflictResponse' }) } },
      },
    },
  },
};

// Export OpenAPI schema
module.exports = openapi;
