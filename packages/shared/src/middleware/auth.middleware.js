const jwt = require('jsonwebtoken');

/**
 * Authentication Middleware for Microservices
 *
 * This is extracted from the monolith and adapted for use across services.
 * Note: User model lookups need to be handled by each service's User repository.
 */

/**
 * Protect routes - JWT verification
 * @param {Function} getUserById - Service-specific function to get user by ID
 * @returns {Function} Express middleware
 */
exports.createProtectMiddleware = (getUserById) => {
  return async (req, res, next) => {
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

      // Verify JWT token with signature validation
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from database using service-specific function
      const user = await getUserById(decoded.id);

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

      // Check if password was changed after token was issued
      if (user.passwordChangedAt && decoded.iat) {
        const changedAtSec = Math.floor(user.passwordChangedAt.getTime() / 1000);
        if (decoded.iat < changedAtSec) {
          return res.status(401).json({
            success: false,
            message: 'Password recently changed - please login again'
          });
        }
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
};

/**
 * Authorize specific roles - RBAC enforcement
 * @param {...string} roles - Allowed roles
 * @returns {Function} Express middleware
 */
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      const logger = require('../utils/logger');
      logger.logSecurity('authorization_failed', {
        reason: 'No user in request',
        path: req.originalUrl
      });
      return res.status(401).json({
        success: false,
        message: 'Not authorized - Please log in'
      });
    }

    const { isValidRole } = require('../constants/roles');

    // Validate roles array
    const invalidRoles = roles.filter(role => !isValidRole(role));
    if (invalidRoles.length > 0) {
      const logger = require('../utils/logger');
      logger.error('Invalid roles in authorize middleware', {
        invalidRoles,
        path: req.originalUrl
      });
    }

    // Get user role (providers have role field, patients don't)
    const userRole = req.user.role || (req.userType === 'patient' ? 'patient' : null);

    if (!userRole) {
      const logger = require('../utils/logger');
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
      const logger = require('../utils/logger');
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

/**
 * Generate JWT Token
 * @param {string} id - User ID
 * @returns {string} JWT token
 */
exports.generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

/**
 * Verify service-to-service JWT token
 * For inter-service communication
 */
exports.verifyServiceToken = (req, res, next) => {
  try {
    const token = req.headers['x-service-token'];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Service token required'
      });
    }

    // Verify service token
    const decoded = jwt.verify(token, process.env.SERVICE_SECRET || process.env.JWT_SECRET);

    if (decoded.type !== 'service') {
      return res.status(403).json({
        success: false,
        message: 'Invalid service token'
      });
    }

    req.service = decoded.serviceName;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid service token'
    });
  }
};

/**
 * Generate service-to-service token
 * @param {string} serviceName - Name of the service
 * @returns {string} Service JWT token
 */
exports.generateServiceToken = (serviceName) => {
  return jwt.sign(
    {
      type: 'service',
      serviceName
    },
    process.env.SERVICE_SECRET || process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};
