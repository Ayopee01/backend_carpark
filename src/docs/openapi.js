// Minimal OpenAPI schema synchronized with project routes
const openapi = {
  openapi: '3.0.3',
  info: { title: 'Smart Carpark API', version: '1.0.0', description: 'Backend API for Smart Carpark admin system (Express + Prisma + PostgreSQL).' },
  servers: [{ url: '/', description: 'Current host' }],
  tags: [
    { name: 'System' },{ name: 'Auth' },{ name: 'Dashboard' },{ name: 'Overview' },{ name: 'Transactions' },{ name: 'Users' },{ name: 'Members' },{ name: 'Service Pricing' },{ name: 'Devices' },{ name: 'Kiosk' },{ name: 'Barrier Gate' },{ name: 'Theme' },{ name: 'System Settings' },{ name: 'Payment Settings' }
  ],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } }
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/': { get: { tags: ['System'], summary: 'API root metadata', security: [], responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'object' } } } } } } },
    '/health': { get: { tags: ['System'], summary: 'Health check', security: [], responses: { 200: { description: 'OK' } } } },
    '/health/db': { get: { tags: ['System'], summary: 'DB connectivity', security: [], responses: { 200: { description: 'OK' }, 500: { description: 'DB error' } } } },
    '/docs': { get: { tags: ['System'], summary: 'Swagger UI', security: [], responses: { 200: { description: 'HTML' } } } },
    '/docs/openapi.json': { get: { tags: ['System'], summary: 'OpenAPI document', security: [], responses: { 200: { description: 'OpenAPI JSON', content: { 'application/json': { schema: { type: 'object' } } } } } } },

    /* Auth */
    '/api/v1/auth/login': { post: { tags: ['Auth'], summary: 'Login', security: [], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Login success' } } } },
    '/api/v1/auth/refresh': { post: { tags: ['Auth'], summary: 'Refresh token', security: [], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Refreshed' } } } },
    '/api/v1/auth/logout': { post: { tags: ['Auth'], summary: 'Logout', responses: { 200: { description: 'Logged out' } } } },
    '/api/v1/auth/me': { get: { tags: ['Auth'], summary: 'Get current user', responses: { 200: { description: 'Current user' } } } },

    /* Dashboard / Overview */
    '/api/v1/dashboard': { get: { tags: ['Dashboard'], summary: 'Dashboard summary', responses: { 200: { description: 'Dashboard summary' } } } },
    '/api/v1/overview/summary': { get: { tags: ['Overview'], summary: 'Overview summary', responses: { 200: { description: 'Overview' } } } },

    /* Transactions */
    '/api/v1/transactions': {
      get: {
        tags: ['Transactions'],
        summary: 'List/search transactions',
        description: 'Use page/per_page for normal listing. Search plate numbers with keyword, e.g. /api/v1/transactions?keyword=3งจ9012. Optional deviceId/deviceType query params may be sent by device UIs but are not required for search.',
        parameters: [
          { in: 'query', name: 'keyword', required: false, schema: { type: 'string' }, example: '3งจ9012' },
          { in: 'query', name: 'page', required: false, schema: { type: 'integer', default: 1 }, example: 1 },
          { in: 'query', name: 'per_page', required: false, schema: { type: 'integer', default: 10 }, example: 10 },
          { in: 'query', name: 'all', required: false, schema: { type: 'boolean' }, example: false },
          { in: 'query', name: 'deviceId', required: false, schema: { type: 'string' }, example: 'K-20260521-008' },
          { in: 'query', name: 'deviceType', required: false, schema: { type: 'string', enum: ['kiosk', 'barrier_gate'] }, example: 'kiosk' }
        ],
        responses: { 200: { description: 'Transactions list' } }
      },
      post: {
        tags: ['Transactions'],
        summary: 'Create transaction from LPR camera body',
        description: 'Camera/LPR sends plateNo in request body after converting the plate image to string. Backend normalizes plateNo, allows vehicleType only car or motorcycle, checks duplicate plateNo+cameraId+direction within 10 seconds, then creates a pending transaction. exitAt stays null for IN and is set from capturedAt for OUT.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['plateNo', 'cameraId', 'gateId', 'direction'],
                properties: {
                  plateNo: { type: 'string' },
                  cameraId: { type: 'string' },
                  gateId: { type: 'string' },
                  direction: { type: 'string', enum: ['IN', 'OUT'] },
                  vehicleType: { type: 'string', enum: ['car', 'motorcycle'], default: 'car' },
                  capturedAt: { type: 'string', format: 'date-time' },
                  confidence: { type: 'number' },
                  imageUrl: { type: 'string' }
                }
              },
              example: {
                plateNo: '1กก1234',
                cameraId: 'CAM-IN-01',
                gateId: 'GATE-A',
                direction: 'IN',
                vehicleType: 'car',
                capturedAt: '2026-05-22T10:30:00+07:00',
                confidence: 0.92,
                imageUrl: 'https://example.com/plate.jpg'
              }
            }
          }
        },
        responses: {
          201: { description: 'Transaction created from camera' },
          200: { description: 'IGNORE_DUPLICATE response' },
          400: { description: 'VALIDATION_ERROR response' }
        }
      }
    },
    '/api/v1/transactions/{id}': {
      get: {
        tags: ['Transactions'],
        summary: 'Get transaction by id or plateNo',
        description: 'The path parameter can be either transaction id or plateNo. If id is not found, the API resolves the latest transaction by plateNo.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' }, example: '3งจ9012' }],
        responses: { 200: { description: 'Transaction details' } }
      },
      patch: {
        tags: ['Transactions'],
        summary: 'Update transaction by id or plateNo',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' }, example: '3งจ9012' }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' }, example: { vehicleType: 'car', serviceType: 'parking' } } } },
        responses: { 200: { description: 'Updated' } }
      },
      delete: { tags: ['Transactions'], summary: 'Delete transaction by id or plateNo', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' }, example: '3งจ9012' }], responses: { 200: { description: 'Deleted' } } }
    },
    '/api/v1/transactions/payment': { post: { tags: ['Transactions'], summary: 'Confirm payment by plateNo in body', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' }, example: { plateNo: '3งจ9012', method: 'cash', channel: 'cashier', amount: 40 } } } }, responses: { 200: { description: 'Payment processed' } } } },
    '/api/v1/transactions/{id}/payment': {
      post: {
        tags: ['Transactions'],
        summary: 'Confirm payment by id or plateNo in path',
        description: 'Use /api/v1/transactions/{plateNo}/payment to pay by plate number. For plate numbers with spaces or special characters, URL-encode the path value.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' }, example: '3งจ9012' }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' }, example: { method: 'cash', channel: 'cashier', amount: 40 } } } },
        responses: { 200: { description: 'Payment processed' } }
      }
    },
    '/api/v1/transactions/{id}/status': {
      patch: {
        tags: ['Transactions'],
        summary: 'Update transaction status by id or plateNo',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' }, example: '3งจ9012' }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' }, example: { status: 'pending' } } } },
        responses: { 200: { description: 'Updated' } }
      }
    },

    /* Users */
    '/api/v1/users': { get: { tags: ['Users'], summary: 'List users', responses: { 200: { description: 'Users' } } }, post: { tags: ['Users'], summary: 'Create user', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 201: { description: 'Created' } } } },
    '/api/v1/users/{id}': { put: { tags: ['Users'], summary: 'Update user', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Updated' } } }, delete: { tags: ['Users'], summary: 'Delete user', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Deleted' } } } },

    /* Members */
    '/api/v1/members/stats': { get: { tags: ['Members'], summary: 'Members stats', responses: { 200: { description: 'Stats' } } } },
    '/api/v1/members': { get: { tags: ['Members'], summary: 'List members', responses: { 200: { description: 'Members list' } } }, post: { tags: ['Members'], summary: 'Create member', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 201: { description: 'Created' } } } },
    '/api/v1/members/{id}': { patch: { tags: ['Members'], summary: 'Update member', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Updated' } } }, delete: { tags: ['Members'], summary: 'Delete member', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Deleted' } } } },
    '/api/v1/members/{id}/permissions': { patch: { tags: ['Members'], summary: 'Update member permissions', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Updated' } } } },

    /* Service Pricing */
    '/api/v1/service-pricing/config': { get: { tags: ['Service Pricing'], summary: 'Get pricing config', responses: { 200: { description: 'Config' } } }, put: { tags: ['Service Pricing'], summary: 'Update pricing config', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Updated' } } } },
    '/api/v1/service-pricing/calculate': { post: { tags: ['Service Pricing'], summary: 'Preview pricing calculation from current rules', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Calculated pricing preview' } } } },
    '/api/v1/service-pricing/rules': { post: { tags: ['Service Pricing'], summary: 'Create pricing rule', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 201: { description: 'Created' } } } },
    '/api/v1/service-pricing/rules/{id}': { patch: { tags: ['Service Pricing'], summary: 'Update pricing rule', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Updated' } } }, delete: { tags: ['Service Pricing'], summary: 'Delete pricing rule', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Deleted' } } } },

    /* Devices (and Kiosk admin) */
    '/api/v1/devices/config': { get: { tags: ['Devices'], summary: 'Get devices config', responses: { 200: { description: 'Devices' } } } },
    '/api/v1/devices/events': { get: { tags: ['Devices'], summary: 'SSE events for device status changes', responses: { 200: { description: 'SSE stream established' } } } },
    '/api/v1/devices': { post: { tags: ['Devices'], summary: 'Create device', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 201: { description: 'Created' } } } },
    '/api/v1/devices/{id}': { put: { tags: ['Devices'], summary: 'Update device', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Updated' } } }, delete: { tags: ['Devices'], summary: 'Delete device', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Deleted' } } } },
    '/api/v1/devices/kiosks/activation-code': { post: { tags: ['Devices'], summary: 'Generate kiosk activation code', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Activation code generated' } } } },
    '/api/v1/devices/kiosks': { get: { tags: ['Devices'], summary: 'List all kiosks', responses: { 200: { description: 'Kiosks list' } } } },
    '/api/v1/devices/kiosks/{deviceId}': { put: { tags: ['Devices'], summary: 'Update kiosk', parameters: [{ in: 'path', name: 'deviceId', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Updated' } } }, delete: { tags: ['Devices'], summary: 'Delete kiosk', parameters: [{ in: 'path', name: 'deviceId', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Deleted' } } } },
    '/api/v1/devices/barrier-gates/activation-code': { post: { tags: ['Devices'], summary: 'Generate Barrier Gate activation code', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Activation code generated' } } } },
    '/api/v1/devices/barrier-gates': { get: { tags: ['Devices'], summary: 'List all Barrier Gates', responses: { 200: { description: 'Barrier Gates list' } } } },
    '/api/v1/devices/barrier-gates/{deviceId}': { put: { tags: ['Devices'], summary: 'Update Barrier Gate', parameters: [{ in: 'path', name: 'deviceId', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Updated' } } }, delete: { tags: ['Devices'], summary: 'Delete Barrier Gate', parameters: [{ in: 'path', name: 'deviceId', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Deleted' } } } },

    /* Theme */
    '/api/v1/theme': { get: { tags: ['Theme'], summary: 'Get theme settings', responses: { 200: { description: 'Theme settings' } } }, put: { tags: ['Theme'], summary: 'Update theme settings', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Updated' } } } },
    '/api/v1/theme/upload-logo': { post: { tags: ['Theme'], summary: 'Upload logo', requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Logo uploaded' } } } },
    '/api/v1/theme/logo': { delete: { tags: ['Theme'], summary: 'Delete logo', responses: { 200: { description: 'Deleted' } } } },

    /* System Settings */
    '/api/v1/system-settings': { get: { tags: ['System Settings'], summary: 'Get system settings', responses: { 200: { description: 'Settings' } } }, put: { tags: ['System Settings'], summary: 'Update system settings', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Updated' } } } },
    '/api/v1/system-settings/receipt': { get: { tags: ['System Settings'], summary: 'Get receipt settings', responses: { 200: { description: 'Receipt settings' } } }, put: { tags: ['System Settings'], summary: 'Update receipt settings', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Updated' } } } },
    '/api/v1/system-settings/receipt/printer': { put: { tags: ['System Settings'], summary: 'Update printer settings', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Updated' } } } },

    /* Kiosk public endpoints */
    '/api/v1/kiosk/events': { get: { tags: ['Kiosk'], summary: 'SSE events (kiosk)', security: [], responses: { 200: { description: 'SSE stream established' } } } },
    '/api/v1/kiosk/entry': { post: { tags: ['Kiosk'], summary: 'Create entry bill from Kiosk', security: [], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 201: { description: 'Created' } } } },
    '/api/v1/kiosk/check-in': { post: { tags: ['Kiosk'], summary: 'Kiosk check-in', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Check-in success' } } } },
    '/api/v1/kiosk/activate': { post: { tags: ['Kiosk'], summary: 'Activate kiosk', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Activated' } } } },
    '/api/v1/kiosk/config': { get: { tags: ['Kiosk'], summary: 'Get kiosk config', responses: { 200: { description: 'Config' } } } },
    '/api/v1/kiosk/search': { get: { tags: ['Kiosk'], summary: 'Search payable transactions by plateNo', description: 'Public kiosk/mobile search by plateNo. Returns only transactions that can still be paid: pending or partially_paid. completed and cancelled transactions are excluded.', parameters: [{ in: 'query', name: 'plateNo', required: true, schema: { type: 'string' }, example: '3งจ9012' }, { in: 'query', name: 'deviceId', required: false, schema: { type: 'string' }, example: 'K-20260521-008' }], responses: { 200: { description: 'Search results with count and items' } } } },
    '/api/v1/kiosk/transaction': { get: { tags: ['Kiosk'], summary: 'Get kiosk transaction by plateNo', responses: { 200: { description: 'Transaction' } } } },
    '/api/v1/kiosk/transaction/{id}': { get: { tags: ['Kiosk'], summary: 'Get kiosk transaction', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Transaction' } } } },
    '/api/v1/kiosk/payment': { post: { tags: ['Kiosk'], summary: 'Kiosk payment', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Payment processed' } } } },

    /* Barrier Gate public endpoints */
    '/api/v1/barrier-gate/activate': { post: { tags: ['Barrier Gate'], summary: 'Activate Barrier Gate', security: [], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Activated' } } } },
    '/api/v1/barrier-gate/check-in': { post: { tags: ['Barrier Gate'], summary: 'Barrier Gate check-in', security: [], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Check-in success' } } } },
    '/api/v1/barrier-gate/transaction': { get: { tags: ['Barrier Gate'], summary: 'Get transaction from Barrier Gate by plateNo', security: [], responses: { 200: { description: 'Transaction' } } } },
    '/api/v1/barrier-gate/transaction/{id}': { get: { tags: ['Barrier Gate'], summary: 'Get transaction from Barrier Gate', security: [], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Transaction' } } } },
    '/api/v1/barrier-gate/payment': { post: { tags: ['Barrier Gate'], summary: 'Barrier Gate payment', security: [], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Payment processed' } } } },

    /* Payment Settings */
    '/api/v1/payment-settings/methods': { get: { tags: ['Payment Settings'], summary: 'List payment methods', responses: { 200: { description: 'Methods' } } } },
    '/api/v1/payment-settings/methods/{id}': { patch: { tags: ['Payment Settings'], summary: 'Update payment method', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Updated' } } } },
    '/api/v1/payment-settings/channels': { get: { tags: ['Payment Settings'], summary: 'List channels', responses: { 200: { description: 'Channels' } } } },
    '/api/v1/payment-settings/channels/{id}': { patch: { tags: ['Payment Settings'], summary: 'Update channel mapping', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Updated' } } } }
  }
};

// Export OpenAPI schema
module.exports = openapi;
