/**
 * @nocturnal/shared
 *
 * Shared middleware, utilities, and constants for Nocturnal microservices
 */

// Middleware exports
const {
  createProtectMiddleware,
  authorize,
  generateToken,
  verifyServiceToken,
  generateServiceToken
} = require('./middleware/auth.middleware');

const {
  securityHeaders,
  corsConfig,
  removeSensitiveHeaders,
  fingerprintRequest,
  detectSuspiciousRequests,
  preventParameterPollution,
  enforceHTTPS,
  addSecurityHeaders,
  logSecurityEvents
} = require('./middleware/security.middleware');

const {
  createRateLimiterFactory,
  createDDoSProtection
} = require('./middleware/rateLimiter.middleware');

const errorHandler = require('./middleware/errorHandler.middleware');

// Utilities exports
const createLogger = require('./utils/logger');
const createMonitoring = require('./utils/monitoring');

const {
  sanitizeData,
  sanitizeString,
  hasDangerousCharacters,
  sanitizeKeyName,
  detectMongoOperators,
  validateSanitization,
  sanitizationMiddleware,
  MAX_RECURSION_DEPTH,
  DANGEROUS_KEYS,
  MONGODB_OPERATORS
} = require('./utils/sanitization');

// Constants exports
const {
  ROLES,
  ALL_ROLES,
  ROLE_PERMISSIONS,
  hasPermission,
  isValidRole
} = require('./constants/roles');

// Export all
module.exports = {
  // Auth middleware
  createProtectMiddleware,
  authorize,
  generateToken,
  verifyServiceToken,
  generateServiceToken,

  // Security middleware
  securityHeaders,
  corsConfig,
  removeSensitiveHeaders,
  fingerprintRequest,
  detectSuspiciousRequests,
  preventParameterPollution,
  enforceHTTPS,
  addSecurityHeaders,
  logSecurityEvents,

  // Rate limiting
  createRateLimiterFactory,
  createDDoSProtection,

  // Error handling
  errorHandler,

  // Utilities
  createLogger,
  createMonitoring,
  sanitizeData,
  sanitizeString,
  hasDangerousCharacters,
  sanitizeKeyName,
  detectMongoOperators,
  validateSanitization,
  sanitizationMiddleware,

  // Constants
  ROLES,
  ALL_ROLES,
  ROLE_PERMISSIONS,
  hasPermission,
  isValidRole,

  // Sanitization constants
  MAX_RECURSION_DEPTH,
  DANGEROUS_KEYS,
  MONGODB_OPERATORS
};
