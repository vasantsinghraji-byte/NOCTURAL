/**
 * Enhanced Rate Limiting Middleware
 * Advanced rate limiting with Redis, IP tracking, and DDoS protection
 */

const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const Redis = require('ioredis');
const logger = require('../utils/logger');
const monitoring = require('../utils/monitoring');

// Redis client (shared across rate limiters)
let redisClient = null;

// Initialize Redis if available
if (process.env.REDIS_URL) {
  redisClient = new Redis(process.env.REDIS_URL, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 3
  });

  redisClient.on('error', (err) => {
    logger.error('Redis error for rate limiting', { error: err.message });
  });

  redisClient.on('connect', () => {
    logger.info('Redis connected for rate limiting');
  });
}

/**
 * Base rate limiter configuration
 */
const createRateLimiter = (options) => {
  const {
    windowMs,
    max,
    message,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    keyGenerator = null,
    handler = null,
    onLimitReached = null
  } = options;

  const config = {
    windowMs,
    max,
    message: { success: false, error: message || 'Too many requests, please try again later' },
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers
    skipSuccessfulRequests,
    skipFailedRequests,

    // Custom key generator (default: IP address)
    // Note: Not using custom keyGenerator to avoid IPv6 issues
    // express-rate-limit handles IP extraction automatically

    // Custom handler when limit is reached
    handler: handler || ((req, res) => {
      const retryAfter = Math.ceil(windowMs / 1000);

      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        url: req.url,
        method: req.method,
        userAgent: req.get('user-agent'),
        userId: req.user?.id
      });

      // Track rate limit violations
      monitoring.trackEvent('rate_limit_exceeded', {
        ip: req.ip,
        endpoint: req.url
      });

      // Call custom onLimitReached handler
      if (onLimitReached) {
        onLimitReached(req, res);
      }

      res.status(429).json({
        success: false,
        error: message || 'Too many requests',
        retryAfter: retryAfter
      });
    })
  };

  // Use Redis store if available
  if (redisClient) {
    config.store = new RedisStore({
      client: redisClient,
      prefix: 'rl:', // rate limit prefix
      sendCommand: (...args) => redisClient.call(...args)
    });
  }

  return rateLimit(config);
};

/**
 * Global rate limiter - applies to all requests
 * 1000 requests per 15 minutes per IP
 */
const globalRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  message: 'Too many requests from this IP, please try again later'
});

/**
 * Strict rate limiter - for sensitive endpoints
 * 5 requests per 15 minutes per IP
 */
const strictRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many attempts, please try again later',
  skipSuccessfulRequests: true // Only count failed attempts
});

/**
 * Auth rate limiter - for login/registration
 * 5 attempts per 15 minutes per IP
 */
const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many authentication attempts, please try again later',
  skipSuccessfulRequests: true,
  onLimitReached: (req, res) => {
    // Additional security measures on auth limit reached
    monitoring.triggerAlert('auth_rate_limit_exceeded', {
      ip: req.ip,
      endpoint: req.url,
      userAgent: req.get('user-agent')
    });
  }
});

/**
 * Password reset rate limiter
 * 3 attempts per hour per IP
 */
const passwordResetRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: 'Too many password reset attempts, please try again later'
});

/**
 * API rate limiter - for general API endpoints
 * 100 requests per 15 minutes per user
 */
const apiRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'API rate limit exceeded',
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise IP
    return req.user?.id || req.ip;
  }
});

/**
 * File upload rate limiter
 * 10 uploads per hour per user
 */
const uploadRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many file uploads, please try again later',
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  }
});

/**
 * Search rate limiter
 * 30 searches per minute per user
 */
const searchRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: 'Too many search requests',
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  }
});

/**
 * Payment rate limiter
 * 3 payment attempts per hour per user
 */
const paymentRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: 'Too many payment attempts, please contact support',
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  }
});

/**
 * Advanced: Adaptive rate limiting based on user tier
 */
const adaptiveRateLimiter = (req, res, next) => {
  const user = req.user;

  // Different limits based on user role
  const limits = {
    admin: { windowMs: 15 * 60 * 1000, max: 10000 },
    hospital: { windowMs: 15 * 60 * 1000, max: 1000 },
    doctor: { windowMs: 15 * 60 * 1000, max: 500 },
    nurse: { windowMs: 15 * 60 * 1000, max: 500 },
    patient: { windowMs: 15 * 60 * 1000, max: 200 },
    default: { windowMs: 15 * 60 * 1000, max: 100 }
  };

  const userLimit = limits[user?.role] || limits.default;

  const limiter = createRateLimiter({
    windowMs: userLimit.windowMs,
    max: userLimit.max,
    message: 'Rate limit exceeded for your account tier',
    keyGenerator: (req) => {
      return `${req.user?.id || req.ip}:${req.user?.role || 'guest'}`;
    }
  });

  return limiter(req, res, next);
};

/**
 * DDoS protection - aggressive rate limiting for suspicious IPs
 */
const ddosProtection = (() => {
  const suspiciousIPs = new Map(); // IP -> { count, timestamp }
  const blacklistedIPs = new Set();
  const SUSPICIOUS_THRESHOLD = 100; // requests in 1 minute
  const BLACKLIST_DURATION = 60 * 60 * 1000; // 1 hour

  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;

    // Check if IP is blacklisted
    if (blacklistedIPs.has(ip)) {
      logger.error('Blocked request from blacklisted IP', { ip });

      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Track request count
    const now = Date.now();
    const record = suspiciousIPs.get(ip);

    if (record) {
      // Reset if more than 1 minute passed
      if (now - record.timestamp > 60000) {
        suspiciousIPs.set(ip, { count: 1, timestamp: now });
      } else {
        record.count++;

        // Check if threshold exceeded
        if (record.count > SUSPICIOUS_THRESHOLD) {
          logger.error('DDoS pattern detected - blacklisting IP', {
            ip,
            requestCount: record.count
          });

          monitoring.triggerAlert('ddos_detected', { ip, count: record.count });

          // Blacklist IP
          blacklistedIPs.add(ip);
          suspiciousIPs.delete(ip);

          // Auto-remove from blacklist after duration
          setTimeout(() => {
            blacklistedIPs.delete(ip);
            logger.info('IP removed from blacklist', { ip });
          }, BLACKLIST_DURATION);

          return res.status(403).json({
            success: false,
            error: 'Access denied - suspicious activity detected'
          });
        }
      }
    } else {
      suspiciousIPs.set(ip, { count: 1, timestamp: now });
    }

    // Cleanup old entries every 5 minutes
    if (Math.random() < 0.001) {
      for (const [key, value] of suspiciousIPs.entries()) {
        if (now - value.timestamp > 5 * 60 * 1000) {
          suspiciousIPs.delete(key);
        }
      }
    }

    next();
  };
})();

/**
 * Rate limit bypass for trusted IPs
 */
const trustedIPsBypass = (req, res, next) => {
  const trustedIPs = (process.env.TRUSTED_IPS || '').split(',').map(ip => ip.trim());

  const clientIP = req.ip || req.connection.remoteAddress;

  if (trustedIPs.includes(clientIP)) {
    logger.debug('Request from trusted IP - bypassing rate limits', { ip: clientIP });
    return next('route'); // Skip rate limiting
  }

  next();
};

/**
 * Get rate limit status for a key
 */
const getRateLimitStatus = async (key) => {
  if (!redisClient) {
    return null;
  }

  try {
    const value = await redisClient.get(`rl:${key}`);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    logger.error('Error getting rate limit status', { error: error.message });
    return null;
  }
};

/**
 * Reset rate limit for a specific key
 */
const resetRateLimit = async (key) => {
  if (!redisClient) {
    return false;
  }

  try {
    await redisClient.del(`rl:${key}`);
    logger.info('Rate limit reset', { key });
    return true;
  } catch (error) {
    logger.error('Error resetting rate limit', { error: error.message });
    return false;
  }
};

/**
 * Get rate limit statistics
 */
const getRateLimitStats = async () => {
  if (!redisClient) {
    return { enabled: false };
  }

  try {
    const keys = await redisClient.keys('rl:*');

    return {
      enabled: true,
      totalKeys: keys.length,
      redisConnected: redisClient.status === 'ready'
    };
  } catch (error) {
    logger.error('Error getting rate limit stats', { error: error.message });
    return { enabled: true, error: error.message };
  }
};

module.exports = {
  globalRateLimiter,
  strictRateLimiter,
  authRateLimiter,
  passwordResetRateLimiter,
  apiRateLimiter,
  uploadRateLimiter,
  searchRateLimiter,
  paymentRateLimiter,
  adaptiveRateLimiter,
  ddosProtection,
  trustedIPsBypass,
  createRateLimiter,
  getRateLimitStatus,
  resetRateLimit,
  getRateLimitStats
};
