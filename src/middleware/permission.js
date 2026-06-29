// Function middleware ตรวจสอบ permission ก่อนเข้าถึง route
const authorize = (permissionOrRoles = null, legacyPermission = null) => {
  const requiredPermission = typeof permissionOrRoles === 'string'
    ? permissionOrRoles
    : legacyPermission;

  return (req, res, next) => {
    // ตรวจสอบว่ามี user จาก token หรือไม่
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // ตรวจสอบ permission ที่จำเป็นสำหรับ route นี้
    if (requiredPermission) {
      const hasPermission =
        Array.isArray(req.user.permissions) &&
        req.user.permissions.includes(requiredPermission);

      if (!hasPermission) {
        // เก็บรายละเอียดไว้ใน server log แทนการส่งกลับไปหา client
        console.warn('Forbidden access', {
          userId: req.user?.id,
          requiredPermission,
          userPermissions: req.user?.permissions || [],
          path: req.originalUrl,
          method: req.method,
        });

        return res.status(403).json({
          message: 'Forbidden',
        });
      }
    }

    // ผ่านการตรวจสอบแล้ว ให้ทำงาน middleware ถัดไป
    return next();
  };
};

// Export Functions
module.exports = { authorize };