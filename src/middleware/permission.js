/**
 * Restrict access based on permissions configured on the member/user record.
 * Preferred usage: authorize('transactions')
 * Legacy usage authorize(['super_admin', 'staff'], 'transactions') is still accepted,
 * but role lists are ignored so access is driven by members.permissions.
 */
const authorize = (permissionOrRoles = null, legacyPermission = null) => {
  const requiredPermission = typeof permissionOrRoles === 'string'
    ? permissionOrRoles
    : legacyPermission;

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized: No user found' });
    }

    if (requiredPermission) {
      const hasPermission = Array.isArray(req.user.permissions) && req.user.permissions.includes(requiredPermission);
      if (!hasPermission) {
        const body = {
          message: `Forbidden: You need '${requiredPermission}' permission to access this resource`,
          requiredPermission,
        };
        if (process.env.NODE_ENV !== 'production') {
          body.yourPermissions = req.user.permissions || [];
        }
        return res.status(403).json(body);
      }
    }

    return next();
  };
};

module.exports = { authorize };
