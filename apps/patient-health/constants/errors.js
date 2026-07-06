/**
 * Error Message Constants
 * Centralized error messages for consistency
 */

const ERROR_MESSAGES = {
  // Authentication Errors
  AUTH: {
    INVALID_CREDENTIALS: 'Invalid email or password',
    TOKEN_EXPIRED: 'Authentication token has expired',
    TOKEN_INVALID: 'Invalid authentication token',
    UNAUTHORIZED: 'You are not authorized to perform this action',
    USER_NOT_FOUND: 'User not found',
    EMAIL_EXISTS: 'Email already exists',
    INVALID_ROLE: 'Invalid user role'
  },

  // Validation Errors
  VALIDATION: {
    REQUIRED_FIELD: (field) => `${field} is required`,
    INVALID_FORMAT: (field) => `Invalid ${field} format`,
    MIN_LENGTH: (field, length) => `${field} must be at least ${length} characters`,
    MAX_LENGTH: (field, length) => `${field} must not exceed ${length} characters`,
    INVALID_EMAIL: 'Invalid email address',
    INVALID_PHONE: 'Invalid phone number'
  },

  // Resource Errors
  RESOURCE: {
    NOT_FOUND: (resource) => `${resource} not found`,
    ALREADY_EXISTS: (resource) => `${resource} already exists`,
    FORBIDDEN: (resource) => `You do not have permission to access this ${resource}`,
    CONFLICT: (resource) => `${resource} already exists with these details`
  },

  // Application Errors
  APPLICATION: {
    ALREADY_APPLIED: 'You have already applied for this duty',
    INVALID_STATUS: 'Invalid application status',
    CANNOT_WITHDRAW: 'Application cannot be withdrawn at this stage'
  },

  // Duty Errors
  DUTY: {
    ALREADY_FILLED: 'This duty has already been filled',
    INVALID_STATUS: 'Invalid duty status',
    CANNOT_DELETE: 'Cannot delete duty with accepted applications'
  },

  // Payment Errors
  PAYMENT: {
    INVALID_AMOUNT: 'Invalid payment amount',
    PAYMENT_FAILED: 'Payment processing failed',
    ALREADY_PROCESSED: 'Payment has already been processed',
    INSUFFICIENT_FUNDS: 'Insufficient funds'
  },

  // Server Errors
  SERVER: {
    INTERNAL_ERROR: 'Internal server error',
    DATABASE_ERROR: 'Database error occurred',
    NETWORK_ERROR: 'Network error occurred',
    SERVICE_UNAVAILABLE: 'Service temporarily unavailable'
  }
};

module.exports = {
  ERROR_MESSAGES
};
