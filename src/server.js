// Load environment variables จาก .env
require('dotenv').config();

const http = require('http');

// Import Express app
const app = require('./app');
const { attachPaymentWebSocket } = require('./ws/payment.ws');

// Constant port สำหรับรัน server
const PORT = process.env.PORT || 8080;

const server = http.createServer(app);
attachPaymentWebSocket(server);

// Function start HTTP server
server.listen(PORT, () => {
  console.log(`Smart Carpark API is running on port ${PORT}`);
});
