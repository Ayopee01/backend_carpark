// Function แบ่ง array ตาม page และ perPage สำหรับข้อมูลที่อยู่ใน memory
function paginate(items, page = 1, perPage = 10) {
  const safePage = Number(page) > 0 ? Number(page) : 1;
  const safePerPage = Number(perPage) > 0 ? Number(perPage) : 10;
  const start = (safePage - 1) * safePerPage;
  const data = items.slice(start, start + safePerPage);

  return {
    data,
    meta: {
      page: safePage,
      perPage: safePerPage,
      total: items.length,
      totalPages: Math.ceil(items.length / safePerPage) || 1
    }
  };
}

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
  paginate,
  pick
};
