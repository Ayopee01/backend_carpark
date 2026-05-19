// Function คำนวณ pagination input ให้เป็นค่าที่ปลอดภัยสำหรับ query database
function normalizePagination(page = 1, perPage = 10) {
  const safePage = Number(page) > 0 ? Number(page) : 1;
  const safePerPage = Number(perPage) > 0 ? Number(perPage) : 10;
  const from = (safePage - 1) * safePerPage;
  const to = from + safePerPage - 1;

  return { page: safePage, perPage: safePerPage, from, to };
}

// Function สร้าง meta response สำหรับ pagination
function buildMeta(page, perPage, total) {
  const safeTotal = Number(total) >= 0 ? Number(total) : 0;
  return {
    page,
    perPage,
    total: safeTotal,
    totalPages: Math.ceil(safeTotal / perPage) || 1
  };
}

// Export Functions
module.exports = {
  normalizePagination,
  buildMeta
};

