// Import Require
const EventEmitter = require('events');

// Class event emitter กลางของ app
class AppEmitter extends EventEmitter {}

// Create instance สำหรับส่ง event ระหว่าง module
const appEvents = new AppEmitter();

// Export app events
module.exports = appEvents;
