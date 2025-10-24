const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

// Admin authentication middleware
const adminAuth = async (req, res, next) => {
  try {
    let token;

    // Check for token in cookies first, then headers
    if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        message: 'Access denied. No token provided.'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if it's an admin token (any admin role is valid)
    if (!['admin', 'super_admin', 'moderator'].includes(decoded.role)) {
      return res.status(403).json({
        message: 'Access denied. Admin privileges required.'
      });
    }

    // Get admin details
    const admin = await Admin.findById(decoded.userId).select('-password -refreshToken');
    
    if (!admin) {
      return res.status(401).json({
        message: 'Token is valid but admin not found.'
      });
    }

    if (!admin.isActive) {
      return res.status(401).json({
        message: 'Admin account is deactivated.'
      });
    }

    // Add admin to request object
    req.admin = {
      userId: admin._id,
      username: admin.username,
      email: admin.email,
      role: admin.role,
      permissions: admin.permissions
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        message: 'Invalid token.'
      });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        message: 'Token expired.',
        expired: true
      });
    }
    
    console.error('Admin auth middleware error:', error);
    res.status(500).json({
      message: 'Internal server error during authentication.'
    });
  }
};

// Permission middleware
const checkPermission = (requiredPermission) => {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({
        message: 'Authentication required.'
      });
    }

    // Super admin has all permissions
    if (req.admin.role === 'super_admin') {
      return next();
    }

    // Check if admin has the required permission
    if (!req.admin.permissions.includes(requiredPermission)) {
      return res.status(403).json({
        message: `Access denied. Required permission: ${requiredPermission}`
      });
    }

    next();
  };
};

// Role-based middleware
const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({
        message: 'Authentication required.'
      });
    }

    if (!allowedRoles.includes(req.admin.role)) {
      return res.status(403).json({
        message: `Access denied. Required roles: ${allowedRoles.join(', ')}`
      });
    }

    next();
  };
};

module.exports = {
  adminAuth,
  checkPermission,
  checkRole
};
