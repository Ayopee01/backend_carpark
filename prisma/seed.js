const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const users = [
  {
    id: 'u1',
    username: 'admin1',
    passwordHash: 'pbkdf2_sha256:100000:5a40e79f6ceb91d2acca809dd02b47da:7d36b58f1cf36742a0996c5e52da2ae1d5c056b84a44d3726f4059f6c5a323c7',
    name: 'Admin One',
    email: 'admin1@example.com',
    phone: '0800000001',
    role: 'super_admin',
    permissions: ['dashboard', 'transactions', 'overview', 'pricing', 'devices', 'theme', 'settings'],
    status: 'active'
  },
  {
    id: 'u2',
    username: 'admin2',
    passwordHash: 'pbkdf2_sha256:100000:5a40e79f6ceb91d2acca809dd02b47da:7d36b58f1cf36742a0996c5e52da2ae1d5c056b84a44d3726f4059f6c5a323c7',
    name: 'Admin Two',
    email: 'admin2@example.com',
    phone: '0800000002',
    role: 'staff',
    permissions: ['dashboard', 'transactions', 'overview'],
    status: 'active'
  },
  {
    id: 'u3',
    username: 'admin3',
    passwordHash: 'pbkdf2_sha256:100000:5a40e79f6ceb91d2acca809dd02b47da:7d36b58f1cf36742a0996c5e52da2ae1d5c056b84a44d3726f4059f6c5a323c7',
    name: 'Admin Three',
    email: 'admin3@example.com',
    phone: '0800000003',
    role: 'staff',
    permissions: ['dashboard', 'transactions'],
    status: 'inactive'
  },
  {
    id: 'u4',
    username: 'cashier',
    passwordHash: 'pbkdf2_sha256:100000:a335b011289250a625450afe503da9e7:763a1a2cc79de02ab5507606e0ed680bb81ef1697c581f6a92ec5c4cfaf59f6e',
    name: 'Test Cashier',
    email: 'cashier@example.com',
    phone: '0800000004',
    role: 'staff',
    permissions: ['dashboard', 'transactions'],
    status: 'active'
  },
  {
    id: 'u5',
    username: 'superadmin',
    passwordHash: 'pbkdf2_sha256:100000:a335b011289250a625450afe503da9e7:763a1a2cc79de02ab5507606e0ed680bb81ef1697c581f6a92ec5c4cfaf59f6e',
    name: 'Main Super Admin',
    email: 'superadmin@example.com',
    phone: '0800000005',
    role: 'super_admin',
    permissions: ['dashboard', 'transactions', 'overview', 'pricing', 'devices', 'theme', 'settings'],
    status: 'active'
  }
];

const transactions = [
  {
    id: 't_seed_001',
    billNo: 'PK202605010001',
    plateNo: '1กข1234',
    vehicleType: 'car',
    serviceType: 'parking',
    entryAt: new Date('2026-05-01T08:00:00+07:00'),
    exitAt: new Date('2026-05-01T10:00:00+07:00'),
    exitTimeLimit: new Date('2026-05-01T10:15:00+07:00'),
    durationMinute: 120,
    amount: 40,
    vat: 0,
    discount: 0,
    netAmount: 40,
    status: 'completed',
    payment: { status: 'paid', method: 'cash', channel: 'cashier', amount: 40, paidAt: '2026-05-01T10:00:00+07:00', processedBy: 'u4' },
    payments: [{ id: 'pay_seed_001', method: 'cash', channel: 'cashier', paidAmount: 40, amount: 40, paidAt: '2026-05-01T10:00:00+07:00', expiryAt: '2026-05-01T10:15:00+07:00', processedBy: 'u4' }],
    totalPaid: 40,
    receipt: { receiptNo: 'RCP-SEED-001', issuedAt: '2026-05-01T10:00:00+07:00', footerText: 'Thank you' }
  },
  {
    id: 't_seed_002',
    billNo: 'PK202605010002',
    plateNo: '2ขค5678',
    vehicleType: 'car',
    serviceType: 'parking',
    entryAt: new Date('2026-05-01T11:00:00+07:00'),
    status: 'pending',
    payment: {},
    payments: [],
    totalPaid: 0,
    receipt: {}
  },
  {
    id: 't_seed_003',
    billNo: 'PK202605020001',
    plateNo: '3งจ9012',
    vehicleType: 'car',
    serviceType: 'parking',
    entryAt: new Date('2026-05-02T09:30:00+07:00'),
    exitTimeLimit: new Date('2026-05-02T12:15:00+07:00'),
    durationMinute: 120,
    amount: 40,
    vat: 0,
    discount: 0,
    netAmount: 80,
    status: 'partially_paid',
    payment: { status: 'partial', method: 'qr', channel: 'kiosk', amount: 40, paidAt: '2026-05-02T12:00:00+07:00', processedBy: 'kiosk_K-SEED-001' },
    payments: [{ id: 'pay_seed_003', method: 'qr', channel: 'kiosk', paidAmount: 40, amount: 40, paidAt: '2026-05-02T12:00:00+07:00', expiryAt: '2026-05-02T12:15:00+07:00', processedBy: 'kiosk_K-SEED-001' }],
    totalPaid: 40,
    receipt: {}
  },
  {
    id: 't_seed_004',
    billNo: 'PK202605030001',
    plateNo: '1กก2468',
    vehicleType: 'motorcycle',
    serviceType: 'parking',
    entryAt: new Date('2026-05-03T07:45:00+07:00'),
    exitAt: new Date('2026-05-03T08:20:00+07:00'),
    exitTimeLimit: new Date('2026-05-03T08:35:00+07:00'),
    durationMinute: 35,
    amount: 10,
    vat: 0,
    discount: 0,
    netAmount: 10,
    status: 'completed',
    payment: { status: 'paid', method: 'qr', channel: 'mobile', amount: 10, paidAt: '2026-05-03T08:20:00+07:00', processedBy: 'u1' },
    payments: [{ id: 'pay_seed_004', method: 'qr', channel: 'mobile', paidAmount: 10, amount: 10, paidAt: '2026-05-03T08:20:00+07:00', expiryAt: '2026-05-03T08:35:00+07:00', processedBy: 'u1' }],
    totalPaid: 10,
    receipt: {}
  }
];

const appConfigs = [
  {
    key: 'pricing_config',
    data: {
      gracePeriod: 15,
      pricingRules: [
        { id: 'pr_free_car', serviceType: 'parking', vehicleType: 'car', conditionType: 'range', hourStart: 1, hourEnd: 1, price: 0, status: 'active' },
        { id: 'pr_car_2_3', serviceType: 'parking', vehicleType: 'car', conditionType: 'range', hourStart: 2, hourEnd: 3, price: 20, status: 'active' },
        { id: 'pr_car_4_999', serviceType: 'parking', vehicleType: 'car', conditionType: 'range', hourStart: 4, hourEnd: 999, price: 30, status: 'active' },
        { id: 'pr_motorcycle', serviceType: 'parking', vehicleType: 'motorcycle', conditionType: 'range', hourStart: 1, hourEnd: 999, price: 10, status: 'active' },
        { id: 'pr_ev', serviceType: 'ev', vehicleType: 'car', conditionType: 'range', hourStart: 1, hourEnd: 999, price: 60, status: 'active' }
      ],
      paymentChannels: [
        { code: 'cash', label: 'Cash', enabled: true },
        { code: 'qr', label: 'QR Payment', enabled: true },
        { code: 'transfer', label: 'Bank Transfer', enabled: true },
        { code: 'wallet', label: 'Wallet', enabled: true }
      ],
      serviceChannelMapping: [
        { serviceType: 'parking', channelCodes: ['cash', 'qr', 'wallet'] },
        { serviceType: 'ev', channelCodes: ['qr', 'wallet'] },
        { serviceType: 'booking', channelCodes: ['qr', 'transfer'] }
      ],
      masterData: {
        serviceTypes: [
          { code: 'parking', label: 'Parking' },
          { code: 'ev', label: 'EV Charge' },
          { code: 'booking', label: 'Booking' }
        ],
        vehicleTypes: [
          { code: 'car', label: 'Car' },
          { code: 'motorcycle', label: 'Motorcycle' },
          { code: 'van', label: 'Van' }
        ]
      }
    }
  },
  {
    key: 'payment_settings',
    data: {
      methods: [
        { id: 'cash', label: 'Cash', icon: 'cash', isActive: true },
        { id: 'qr', label: 'QR Payment', icon: 'qr', isActive: true },
        { id: 'bank1', label: 'Bank Account 1', icon: 'bank', isActive: true },
        { id: 'wallet', label: 'Wallet', icon: 'wallet', isActive: true },
        { id: 'other', label: 'Other', icon: 'more', isActive: true }
      ],
      channels: [
        { id: 'ch_cashier', name: 'Cashier', icon: 'user', allowedMethods: ['cash', 'qr', 'bank1', 'wallet', 'other'] },
        { id: 'ch_kiosk', name: 'Kiosk', icon: 'vending', allowedMethods: ['qr', 'bank1', 'wallet'] },
        { id: 'ch_mobile', name: 'Mobile', icon: 'qr', allowedMethods: ['qr', 'wallet'] },
        { id: 'ch_gate', name: 'Exit Gate', icon: 'gate', allowedMethods: ['wallet'] }
      ]
    }
  },
  {
    key: 'devices',
    data: {
      summary: { totalDevices: 3, online: 2, offline: 1 },
      devices: [
        { id: 'd1', deviceCode: 'PRN001', deviceName: 'Printer Counter 1', deviceType: 'printer', connectionType: 'usb', ipAddress: null, status: 'active', isOnline: true, note: 'Counter receipt printer' },
        { id: 'd2', deviceCode: 'LPR001', deviceName: 'LPR Gate 1', deviceType: 'lpr', connectionType: 'lan', ipAddress: '192.168.1.99', status: 'active', isOnline: false, note: 'Entrance plate camera' },
        { id: 'd3', deviceCode: 'BAR001', deviceName: 'Barrier Gate 1', deviceType: 'barrier', connectionType: 'lan', ipAddress: '192.168.1.50', status: 'active', isOnline: true, note: 'Exit barrier' }
      ],
      masterData: {
        deviceTypes: [
          { code: 'printer', label: 'Printer' },
          { code: 'lpr', label: 'LPR Camera' },
          { code: 'barrier', label: 'Barrier' },
          { code: 'kiosk', label: 'Kiosk' }
        ],
        connectionTypes: [
          { code: 'usb', label: 'USB' },
          { code: 'lan', label: 'LAN' },
          { code: 'wifi', label: 'Wi-Fi' }
        ]
      }
    }
  },
  {
    key: 'kiosks',
    data: {
      kiosks: [
        { deviceId: 'K-SEED-001', name: 'Payment Kiosk 1', location: 'Lobby A', ip: '192.168.1.120', version: '1.0.0', status: 'online', firstSeen: '2026-05-01T08:00:00+07:00', lastSeen: '2026-05-16T08:00:00+07:00' },
        { deviceId: 'K-SEED-002', name: 'Payment Kiosk 2', location: 'Basement B1', ip: '192.168.1.121', version: '1.0.0', status: 'maintenance', firstSeen: '2026-05-01T08:00:00+07:00', lastSeen: '2026-05-16T08:00:00+07:00' }
      ]
    }
  },
  {
    key: 'theme',
    data: {
      themeColor: null,
      logoUrl: null,
      themeMode: '',
      customThemeColor: null,
      updatedAt: '2026-05-16T00:00:00+07:00'
    }
  },
  {
    key: 'system_settings',
    data: {
      general: {
        systemName: 'Smart Carpark',
        location: 'Main Building',
        language: 'th',
        timezone: 'Asia/Bangkok',
        frontendUrl: 'http://localhost:3000'
      },
      receipt: {
        entryBill: { showDate: true, showEntryTime: true, showQrCode: true, showBillNo: true },
        paymentBill: { showDate: true, showEntryTime: true, showQrCode: true, showBillNo: true, showExpiryTime: true, expiryDuration: 15 },
        printer: { fontSize: 12, billNumberFontSize: 16, paperWidth: 80 },
        paperWidth: '80mm',
        footerText: 'Thank you'
      },
      billing: {
        taxEnabled: false,
        currency: 'THB',
        roundingMode: 'normal'
      },
      updatedAt: '2026-05-16T00:00:00+07:00'
    }
  }
];

async function main() {
  for (const user of users) {
    await prisma.user.upsert({
      where: { id: user.id },
      create: user,
      update: user
    });
  }

  for (const transaction of transactions) {
    await prisma.transaction.upsert({
      where: { id: transaction.id },
      create: transaction,
      update: transaction
    });
  }

  for (const config of appConfigs) {
    await prisma.appConfig.upsert({
      where: { key: config.key },
      create: config,
      update: { data: config.data }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
