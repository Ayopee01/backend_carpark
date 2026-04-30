-- Smart Carpark API - Supabase seed data
-- Run after supabase/schema.sql.

insert into public.users (id, username, password, name, email, role, permissions, status)
values
  (
    'u1',
    'admin1',
    '123',
    'Admin One',
    'admin1@example.com',
    'super_admin',
    array['dashboard','transactions','overview','pricing','devices','theme','settings'],
    'active'
  ),
  (
    'u4',
    'cashier',
    '123456',
    'Test Cashier',
    'cashier@example.com',
    'staff',
    array['dashboard','transactions'],
    'active'
  ),
  (
    'u5',
    'superadmin',
    '123456',
    'Main Super Admin',
    'superadmin@example.com',
    'super_admin',
    array['dashboard','transactions','overview','pricing','devices','theme','settings'],
    'active'
  )
on conflict (id) do update
set
  username = excluded.username,
  password = excluded.password,
  name = excluded.name,
  email = excluded.email,
  role = excluded.role,
  permissions = excluded.permissions,
  status = excluded.status;

insert into public.transactions (
  id,
  bill_no,
  plate_no,
  vehicle_type,
  service_type,
  entry_at,
  exit_at,
  duration_minute,
  amount,
  vat,
  discount,
  net_amount,
  status,
  payment,
  payments,
  total_paid,
  exit_time_limit,
  receipt
)
values
  (
    't_seed_001',
    'PK202604300001',
    'กข-1234',
    'car',
    'parking',
    '2026-04-30T08:00:00+07:00',
    '2026-04-30T10:00:00+07:00',
    120,
    40,
    0,
    0,
    40,
    'completed',
    '{"status":"paid","method":"cash","channel":"cashier","amount":40,"paidAt":"2026-04-30T10:00:00+07:00","processedBy":"u4"}'::jsonb,
    '[{"id":"pay_seed_001","method":"cash","channel":"cashier","amount":40,"paidAt":"2026-04-30T10:00:00+07:00","expiryAt":"2026-04-30T10:15:00+07:00","processedBy":"u4"}]'::jsonb,
    40,
    '2026-04-30T10:15:00+07:00',
    '{"receiptNo":"RCP-SEED-001","issuedAt":"2026-04-30T10:00:00+07:00","footerText":"Thank you"}'::jsonb
  ),
  (
    't_seed_002',
    'PK202604300002',
    'ทน-5678',
    'car',
    'parking',
    '2026-04-30T11:00:00+07:00',
    null,
    null,
    0,
    0,
    0,
    0,
    'pending',
    '{}'::jsonb,
    '[]'::jsonb,
    0,
    null,
    '{}'::jsonb
  )
on conflict (id) do update
set
  bill_no = excluded.bill_no,
  plate_no = excluded.plate_no,
  vehicle_type = excluded.vehicle_type,
  service_type = excluded.service_type,
  entry_at = excluded.entry_at,
  exit_at = excluded.exit_at,
  duration_minute = excluded.duration_minute,
  amount = excluded.amount,
  vat = excluded.vat,
  discount = excluded.discount,
  net_amount = excluded.net_amount,
  status = excluded.status,
  payment = excluded.payment,
  payments = excluded.payments,
  total_paid = excluded.total_paid,
  exit_time_limit = excluded.exit_time_limit,
  receipt = excluded.receipt;

insert into public.app_config (key, data)
values
  (
    'pricing_config',
    '{
      "pricingRules": [
        { "id": "pr1", "serviceType": "parking", "vehicleType": "car", "conditionType": "range", "hourStart": 1, "hourEnd": 2, "price": 20, "status": "active" },
        { "id": "pr2", "serviceType": "parking", "vehicleType": "car", "conditionType": "range", "hourStart": 3, "hourEnd": 5, "price": 50, "status": "active" },
        { "id": "pr3", "serviceType": "ev", "vehicleType": "car", "conditionType": "range", "hourStart": 1, "hourEnd": 2, "price": 60, "status": "active" }
      ],
      "paymentChannels": [
        { "code": "cash", "label": "Cash", "enabled": true },
        { "code": "qr", "label": "QR Payment", "enabled": true },
        { "code": "transfer", "label": "Transfer", "enabled": false }
      ],
      "serviceChannelMapping": [
        { "serviceType": "parking", "channelCodes": ["cash", "qr"] },
        { "serviceType": "ev", "channelCodes": ["qr"] },
        { "serviceType": "booking", "channelCodes": ["qr", "transfer"] }
      ],
      "masterData": {
        "serviceTypes": [
          { "code": "parking", "label": "Parking" },
          { "code": "ev", "label": "EV Charge" },
          { "code": "booking", "label": "Booking" }
        ],
        "vehicleTypes": [
          { "code": "car", "label": "Car" },
          { "code": "motorcycle", "label": "Motorcycle" }
        ]
      }
    }'::jsonb
  ),
  (
    'devices',
    '{
      "summary": { "totalDevices": 2, "online": 1, "offline": 1 },
      "devices": [
        {
          "id": "d1",
          "deviceCode": "PRN001",
          "deviceName": "Printer Counter 1",
          "deviceType": "printer",
          "connectionType": "usb",
          "ipAddress": null,
          "status": "active",
          "isOnline": true,
          "note": "Counter receipt printer"
        },
        {
          "id": "d2",
          "deviceCode": "LPR001",
          "deviceName": "LPR Gate 1",
          "deviceType": "lpr",
          "connectionType": "lan",
          "ipAddress": "192.168.1.99",
          "status": "active",
          "isOnline": false,
          "note": "Entrance plate camera"
        }
      ],
      "masterData": {
        "deviceTypes": [
          { "code": "printer", "label": "Printer" },
          { "code": "lpr", "label": "LPR Camera" },
          { "code": "barrier", "label": "Barrier" }
        ],
        "connectionTypes": [
          { "code": "usb", "label": "USB" },
          { "code": "lan", "label": "LAN" },
          { "code": "wifi", "label": "Wi-Fi" }
        ]
      }
    }'::jsonb
  ),
  (
    'theme',
    '{
      "themeColor": "#FFD54F",
      "logoUrl": null,
      "updatedAt": "2026-04-30T00:00:00+07:00"
    }'::jsonb
  ),
  (
    'system_settings',
    '{
      "general": {
        "systemName": "Smart Carpark",
        "location": "Main Building",
        "language": "th",
        "timezone": "Asia/Bangkok"
      },
      "receipt": {
        "entryBill": {
          "showDate": true,
          "showEntryTime": true,
          "showQrCode": true,
          "showBillNo": true
        },
        "paymentBill": {
          "showDate": true,
          "showEntryTime": true,
          "showQrCode": true,
          "showBillNo": true,
          "showExpiryTime": true,
          "expiryDuration": 15
        },
        "paperWidth": "80mm",
        "footerText": "Thank you"
      },
      "billing": {
        "taxEnabled": false,
        "currency": "THB",
        "roundingMode": "normal"
      },
      "updatedAt": "2026-04-30T00:00:00+07:00"
    }'::jsonb
  )
on conflict (key) do update
set data = excluded.data;
