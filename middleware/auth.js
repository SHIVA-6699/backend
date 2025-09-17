import { verifyAccessToken } from '../utils/jwt.js';
import User from '../models/User.js';

export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'Access token required' });
    }

    const decoded = verifyAccessToken(token);
    if (!decoded) {
      return res.status(401).json({ message: 'Invalid access token' });
    }

    // Fetch full user details from database
    const user = await User.findById(decoded.userId).select('-password -refreshToken');
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'User not found or inactive' });
    }

    // Check if account is locked
    if (user.isLocked) {
      return res.status(423).json({ message: 'Account is temporarily locked' });
    }

    req.user = {
      ...decoded,
      ...user.toObject()
    };
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = verifyAccessToken(token);
      if (decoded) {
        const user = await User.findById(decoded.userId).select('-password -refreshToken');
        if (user && user.isActive && !user.isLocked) {
          req.user = {
            ...decoded,
            ...user.toObject()
          };
        }
      }
    }
    next();
  } catch (error) {
    next();
  }
};

// Role-based access control middleware
export const requireRole = (roles) => {
  return async (req, res, next) => {
    try {
      await authenticateToken(req, res, async () => {
        const userRole = req.user.role;
        const allowedRoles = Array.isArray(roles) ? roles : [roles];
        
        if (!allowedRoles.includes(userRole)) {
          return res.status(403).json({ 
            message: `Access denied. Required roles: ${allowedRoles.join(', ')}`,
            userRole,
            requiredRoles: allowedRoles
          });
        }
        next();
      });
    } catch (error) {
      return res.status(401).json({ message: 'Authentication failed' });
    }
  };
};

// Permission-based access control middleware
export const requirePermission = (permissions) => {
  return async (req, res, next) => {
    try {
      await authenticateToken(req, res, async () => {
        const userPermissions = req.user.permissions || [];
        const requiredPermissions = Array.isArray(permissions) ? permissions : [permissions];
        
        const hasPermission = requiredPermissions.some(permission => 
          userPermissions.includes(permission)
        );
        
        if (!hasPermission) {
          return res.status(403).json({ 
            message: `Access denied. Required permissions: ${requiredPermissions.join(', ')}`,
            userPermissions,
            requiredPermissions
          });
        }
        next();
      });
    } catch (error) {
      return res.status(401).json({ message: 'Authentication failed' });
    }
  };
};

// Access level middleware
export const requireAccessLevel = (accessLevels) => {
  return async (req, res, next) => {
    try {
      await authenticateToken(req, res, async () => {
        const userAccessLevel = req.user.accessLevel;
        const allowedAccessLevels = Array.isArray(accessLevels) ? accessLevels : [accessLevels];
        
        if (!allowedAccessLevels.includes(userAccessLevel)) {
          return res.status(403).json({ 
            message: `Access denied. Required access level: ${allowedAccessLevels.join(', ')}`,
            userAccessLevel,
            requiredAccessLevels: allowedAccessLevels
          });
        }
        next();
      });
    } catch (error) {
      return res.status(401).json({ message: 'Authentication failed' });
    }
  };
};

// Specific role middleware functions
export const requireAdmin = requireRole('admin');
export const requireManager = requireRole(['admin', 'manager']);
export const requireEmployee = requireRole(['admin', 'manager', 'employee']);
export const requireVendor = requireRole('vendor');
export const requireCustomer = requireRole('customer');

// Specific permission middleware functions
export const requireAdminPage = requirePermission('admin_page');
export const requireInventoryPage = requirePermission('inventory_page');
export const requireBankPayments = requirePermission('bank_payments');
export const requireVendorDetails = requirePermission('vendor_details');
export const requireRoleUserCreation = requirePermission('role_user_creation');
export const requireOrderPages = requirePermission('order_pages');
export const requireVendorPortal = requirePermission('vendor_portal');

// Access level middleware functions
export const requireAllSitesAccess = requireAccessLevel('all_sites');
export const requireRestrictedAccess = requireAccessLevel(['all_sites', 'restricted']);
export const requireVendorPortalAccess = requireAccessLevel('vendor_portal');
export const requireAppWebAccess = requireAccessLevel(['app_web', 'all_sites', 'restricted']);

// Combined middleware for complex access control
export const requireAdminOrManager = requireRole(['admin', 'manager']);
export const requireAdminManagerOrVendor = requireRole(['admin', 'manager', 'vendor']);
export const requireFinancialAccess = requirePermission(['bank_payments', 'admin_page']);
export const requireUserManagementAccess = requirePermission(['role_user_creation', 'admin_page']);
