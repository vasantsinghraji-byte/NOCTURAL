const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

// Helper to create rate limiters with logging
const createLimiter = (options) => {
  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000, // Default 15 minutes
    max: options.max || 100, // Default 100 requests per window
    message: options.message || 'Too many requests, please try again later',
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        userId: req.user ? req.user._id : 'anonymous'
      });
      res.status(429).json({
        success: false,
        message: options.message || 'Too many requests, please try again later'
      });
    },
    keyGenerator: (req) => {
      // Use user ID if available, otherwise IP
      return req.user ? req.user._id : req.ip;
    }
  });
};

// Different rate limits for different endpoints
module.exports = {
  // Strict limiting for auth endpoints
  authLimiter: createLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: 'Too many login attempts, please try again after 15 minutes'
  }),

  // Moderate limiting for regular API endpoints
  apiLimiter: createLimiter({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 100 // 100 requests per window
  }),

  // Strict limiting for file uploads
  uploadLimiter: createLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 uploads per hour
    message: 'Upload limit reached, please try again later'
  }),

  // Very strict limiting for password reset/sensitive operations
  sensitiveOpLimiter: createLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 attempts per hour
    message: 'Too many sensitive operations attempted, please try again later'
  })
};