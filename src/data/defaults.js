// Constant default config สำหรับราคาค่าบริการ, ช่องทางจ่ายเงิน และ master data ที่เกี่ยวกับการคิดราคา
const pricingConfig = {
  pricingRules: [],
  paymentChannels: [],
  serviceChannelMapping: [],
  masterData: {
    serviceTypes: [],
    vehicleTypes: [],
  },
};

// Constant default config สำหรับข้อมูลอุปกรณ์และ summary สถานะอุปกรณ์
const devices = {
  summary: { totalDevices: 0, online: 0, offline: 0 },
  devices: [],
  masterData: {
    deviceTypes: [],
    connectionTypes: [],
  },
};

const barrierGates = {
  barrierGates: [],
};

// Constant default config สำหรับ theme ของระบบ เช่น สีหลักและ logo
const theme = {
  themeColor: null,
  logoUrl: null,
  themeMode: '',
  customThemeColor: null,
};

// Constant default config สำหรับตั้งค่าทั่วไปของระบบ, ใบเสร็จ และ billing
const systemSettings = {
  general: {
    systemName: null,
    location: null,
    language: null,
    timezone: null,
    frontendUrl: null,
  },
  receipt: {
    paymentBill: {
      expiryDuration: 30,
    },
  },
  billing: {},
};

// Constant default config สำหรับวิธีชำระเงินและช่องทางบริการ
const paymentSettings = {
  methods: [],
  channels: [],
};

// Export default configs
module.exports = {
  devices,
  barrierGates,
  paymentSettings,
  pricingConfig,
  systemSettings,
  theme,
};
