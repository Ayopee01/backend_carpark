// Function เลือกเฉพาะ key ที่อนุญาตจาก object และไม่เอาค่า undefined
function pick(obj, keys) {
  return keys.reduce((acc, key) => {
    if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined) {
      acc[key] = obj[key];
    }
    return acc;
  }, {});
}

// Export Functions
module.exports = {
  pick
};
