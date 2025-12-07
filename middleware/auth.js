const jwt = require('jsonwebtoken');
const User = require('../models/user');
const { isValidRole } = require('../constants/roles');
const logger = require('../utils/logger');

// Protect routes - SECURED with proper JWT verification
exports.protect = async (req, res, next) => {
  try {
    let token;

    // Get token from header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized - No token provided'
      });
    }

    // Verify JWT token with signature validation - CRITICAL FIX
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user from database
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found or token invalid'
      });
    }

    // Check if user is active
    if (user.isActive === false) {
      return res.status(401).json({
        success: false,
        message: 'Account has been deactivated'
      });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    // Handle specific JWT errors
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token - authentication failed'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired - please login again'
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Not authorized'
    });
  }
};

// Authorize specific roles - RBAC enforcement
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      logger.logSecurity('authorization_failed', {
        reason: 'No user in request',
        path: req.originalUrl
      });
      return res.status(401).json({
        success: false,
        message: 'Not authorized - Please log in'
      });
    }

    // Validate roles array
    const invalidRoles = roles.filter(role => !isValidRole(role));
    if (invalidRoles.length > 0) {
      logger.error('Invalid roles in authorize middleware', {
        invalidRoles,
        path: req.originalUrl
      });
    }

    // Get user role (providers have role field, patients don't)
    const userRole = req.user.role || (req.userType === 'patient' ? 'patient' : null);

    if (!userRole) {
      logger.logSecurity('authorization_failed', {
        reason: 'Could not determine user role',
        userId: req.user._id,
        path: req.originalUrl
      });
      return res.status(403).json({
        success: false,
        message: 'Access denied - Unable to determine user role'
      });
    }

    if (!roles.includes(userRole)) {
      logger.logSecurity('unauthorized_access_attempt', {
        userId: req.user._id,
        userRole: userRole,
        requiredRoles: roles,
        path: req.originalUrl,
        method: req.method
      });
      return res.status(403).json({
        success: false,
        message: `Access denied - '${userRole}' role cannot access this resource`
      });
    }

    next();
  };
};

// Generate JWT Token with strong expiration
exports.generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d' // Reduced from 30d to 7d for security
  });
};
