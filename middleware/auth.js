const User = require('../models/user');
const { isValidRole } = require('../constants/roles');
const logger = require('../utils/logger');
const authTokens = require('../utils/authTokens');
const { normalizeObjectId } = require('../utils/safeMongo');
const { IDENTITY_TYPES } = authTokens;

const normalizeAuthenticatedUser = (user) => {
  if (!user) return user;

  if (!user.id && user._id) {
    user.id = typeof user._id.toString === 'function' ? user._id.toString() : user._id;
  }

  return user;
};

const getCookieValue = (cookieHeader, targetName) => {
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return null;
  }

  for (const cookiePair of cookieHeader.split(';')) {
    const separatorIndex = cookiePair.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const name = cookiePair.slice(0, separatorIndex).trim();
    if (name === targetName) {
      return decodeURIComponent(cookiePair.slice(separatorIndex + 1).trim());
    }
  }

  return null;
};

const parseCookieHeader = (cookieHeader) => {
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return {};
  }

  const cookies = new Map();
  for (const cookiePair of cookieHeader.split(';')) {
    const separatorIndex = cookiePair.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const name = cookiePair.slice(0, separatorIndex).trim();
    if (!name) {
      continue;
    }

    cookies.set(name, decodeURIComponent(cookiePair.slice(separatorIndex + 1).trim()));
  }

  return Object.fromEntries(cookies);
};

const getAccessTokenFromRequest = (req) => {
  if (req.cookies && req.cookies.accessToken) {
    return req.cookies.accessToken;
  }

  const cookieToken = getCookieValue(req.headers.cookie, 'accessToken');
  if (cookieToken) {
    return cookieToken;
  }

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    return req.headers.authorization.split(' ')[1];
  }

  return null;
};

const requireAccessTokenFromRequest = (req) => {
  const token = getAccessTokenFromRequest(req);
  if (!token) {
    const error = new Error('No access token provided');
    error.name = 'MissingAccessTokenError';
    throw error;
  }
  return token;
};

const verifyAccessToken = authTokens.verifyAccessToken;
const verifyRefreshToken = authTokens.verifyRefreshToken;

// Protect routes - SECURED with proper JWT verification
exports.protect = async (req, res, next) => {
  try {
    const token = requireAccessTokenFromRequest(req);

    // Verify JWT token with signature validation - CRITICAL FIX
    const decoded = verifyAccessToken(token, IDENTITY_TYPES.USER);

    // Get user from database
    const decodedUserId = normalizeObjectId(decoded.id, 'token subject');
    const user = await User.findById(decodedUserId).select('-password +sessionVersion');

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

    if ((Number(user.sessionVersion) || 0) !== (Number(decoded.sessionVersion) || 0)) {
      return res.status(401).json({
        success: false,
        message: 'Session has been invalidated - please login again'
      });
    }

    // Attach user to request
    req.user = normalizeAuthenticatedUser(user);
    next();
  } catch (error) {
    if (error.name === 'MissingAccessTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Not authorized - No token provided'
      });
    }
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
exports.generateAccessToken = authTokens.generateAccessToken;
exports.generateRefreshToken = authTokens.generateRefreshToken;

exports.generateToken = exports.generateAccessToken;
exports.parseCookieHeader = parseCookieHeader;
exports.getAccessTokenFromRequest = getAccessTokenFromRequest;
exports.verifyAccessToken = verifyAccessToken;
exports.verifyRefreshToken = verifyRefreshToken;
exports.IDENTITY_TYPES = IDENTITY_TYPES;
exports.TOKEN_VERSION = authTokens.TOKEN_VERSION;
exports.JWT_ALGORITHM = authTokens.JWT_ALGORITHM;
exports.JWT_ISSUER = authTokens.JWT_ISSUER;
exports.JWT_AUDIENCE = authTokens.JWT_AUDIENCE_BY_IDENTITY[IDENTITY_TYPES.USER];
exports.JWT_ACCESS_SIGN_OPTIONS = authTokens.JWT_ACCESS_SIGN_OPTIONS;
exports.JWT_REFRESH_SIGN_OPTIONS = authTokens.JWT_REFRESH_SIGN_OPTIONS;
exports.JWT_ACCESS_VERIFY_OPTIONS = authTokens.JWT_ACCESS_VERIFY_OPTIONS;
exports.JWT_REFRESH_VERIFY_OPTIONS = authTokens.JWT_REFRESH_VERIFY_OPTIONS;
