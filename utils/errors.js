/**
 * Custom Error Classes
 *
 * Provides proper Error instances with stack traces for debugging
 * and consistent error handling across the application.
 */

const { HTTP_STATUS } = require('../constants');

/**
 * Base ServiceError class
 * All service-level errors should extend this class
 */
class ServiceError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.name = 'ServiceError';
    this.isOperational = true; // Distinguishes from programming errors

    // Capture stack trace, excluding constructor call from it
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      stack: process.env.NODE_ENV === 'development' ? this.stack : undefined
    };
  }
}

/**
 * Validation Error (400)
 * For invalid input, missing fields, format errors
 */
class ValidationError extends ServiceError {
  constructor(message, fields = null) {
    super(HTTP_STATUS.BAD_REQUEST, message, fields ? { fields } : null);
    this.name = 'ValidationError';
  }
}

/**
 * Authentication Error (401)
 * For invalid credentials, expired tokens, missing auth
 */
class AuthenticationError extends ServiceError {
  constructor(message = 'Authentication required') {
    super(HTTP_STATUS.UNAUTHORIZED, message);
    this.name = 'AuthenticationError';
  }
}

/**
 * Authorization Error (403)
 * For insufficient permissions, role-based access denied
 */
class AuthorizationError extends ServiceError {
  constructor(message = 'Not authorized to perform this action') {
    super(HTTP_STATUS.FORBIDDEN, message);
    this.name = 'AuthorizationError';
  }
}

/**
 * Not Found Error (404)
 * For missing resources
 */
class NotFoundError extends ServiceError {
  constructor(resource = 'Resource', identifier = null) {
    const message = identifier
      ? `${resource} with ID '${identifier}' not found`
      : `${resource} not found`;
    super(HTTP_STATUS.NOT_FOUND, message, { resource, identifier });
    this.name = 'NotFoundError';
  }
}

/**
 * Conflict Error (409)
 * For duplicate entries, state conflicts
 */
class ConflictError extends ServiceError {
  constructor(message, conflictingField = null) {
    super(HTTP_STATUS.CONFLICT, message, conflictingField ? { field: conflictingField } : null);
    this.name = 'ConflictError';
  }
}

/**
 * Payment Error (402/400)
 * For payment processing failures
 */
class PaymentError extends ServiceError {
  constructor(message, paymentDetails = null) {
    super(HTTP_STATUS.BAD_REQUEST, message, paymentDetails);
    this.name = 'PaymentError';
  }
}

/**
 * External Service Error (503)
 * For third-party API failures (Razorpay, Firebase, etc.)
 */
class ExternalServiceError extends ServiceError {
  constructor(serviceName, originalError = null) {
    super(
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      `External service '${serviceName}' is unavailable`,
      { service: serviceName, originalError: originalError?.message }
    );
    this.name = 'ExternalServiceError';
  }
}

/**
 * Rate Limit Error (429)
 * For rate limiting scenarios
 */
class RateLimitError extends ServiceError {
  constructor(message = 'Too many requests', retryAfter = null) {
    super(429, message, retryAfter ? { retryAfter } : null);
    this.name = 'RateLimitError';
  }
}

module.exports = {
  ServiceError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  PaymentError,
  ExternalServiceError,
  RateLimitError
};
