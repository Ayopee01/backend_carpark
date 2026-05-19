// Import Require
const { v4: uuidv4 } = require('uuid');

// Function สร้าง id พร้อม prefix
function createId(prefix = 'id') {
  return `${prefix}_${uuidv4()}`;
}

// Export Functions
module.exports = { createId };
