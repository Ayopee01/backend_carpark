// Load environment variables จาก .env
require('dotenv').config();

// Import Express app
const app = require('./app');

// Constant port สำหรับรัน server
const PORT = process.env.PORT || 8080;

// Function start HTTP server
app.listen(PORT, () => {
  console.log(`Smart Carpark API is running on port ${PORT}`);
});
