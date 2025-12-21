/**
 * Enhanced Rate Limiting Middleware
 * Advanced rate limiting with Redis, IP tracking, and DDoS protection
 */

const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const logger = require('../utils/logger');
const monitoring = require('../utils/monitoring');

/**
 * Create Redis client for rate limiting
 * @param {string} redisUrl - Redis connection URL
 * @returns {Object} Redis client or null
 */
const createRedisClient = (redisUrl) => {
  if (!redisUrl) return null;

  const Redis = require('ioredis');
  const redisClient = new Redis(redisUrl, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 3
  });

  redisClient.on('error', (err) => {
    logger.error('Redis error for rate limiting', { error: err.message });
  });

  redisClient.on('connect', () => {
    logger.info('Redis connected for rate limiting');
  });

  return redisClient;
};

/**
 * Base rate limiter configuration
 */
const createRateLimiter = (redisClient, options) => {
  const {
    windowMs,
    max,
    message,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    handler = null,
    onLimitReached = null
  } = options;

  const config = {
    windowMs,
    max,
    message: { success: false, error: message || 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
    skipFailedRequests,

    handler: handler || ((req, res) => {
      const retryAfter = Math.ceil(windowMs / 1000);

      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        url: req.url,
        method: req.method,
        userAgent: req.get('user-agent'),
        userId: req.user?.id
      });

      monitoring.trackEvent('rate_limit_exceeded', {
        ip: req.ip,
        endpoint: req.url
      });

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

  if (redisClient) {
    config.store = new RedisStore({
      client: redisClient,
      prefix: 'rl:',
      sendCommand: (...args) => redisClient.call(...args)
    });
  }

  return rateLimit(config);
};

/**
 * Create rate limiter factory
 * @param {string} redisUrl - Redis connection URL
 * @returns {Object} Rate limiter factory
 */
const createRateLimiterFactory = (redisUrl) => {
  const redisClient = createRedisClient(redisUrl);

  return {
    global: createRateLimiter(redisClient, {
      windowMs: 15 * 60 * 1000,
      max: 1000,
      message: 'Too many requests from this IP, please try again later'
    }),

    strict: createRateLimiter(redisClient, {
      windowMs: 15 * 60 * 1000,
      max: 5,
      message: 'Too many attempts, please try again later',
      skipSuccessfulRequests: true
    }),

    auth: createRateLimiter(redisClient, {
      windowMs: 15 * 60 * 1000,
      max: 5,
      message: 'Too many authentication attempts, please try again later',
      skipSuccessfulRequests: true,
      onLimitReached: (req, res) => {
        monitoring.triggerAlert('auth_rate_limit_exceeded', {
          ip: req.ip,
          endpoint: req.url,
          userAgent: req.get('user-agent')
        });
      }
    }),

    passwordReset: createRateLimiter(redisClient, {
      windowMs: 60 * 60 * 1000,
      max: 3,
      message: 'Too many password reset attempts, please try again later'
    }),

    api: createRateLimiter(redisClient, {
      windowMs: 15 * 60 * 1000,
      max: 100,
      message: 'API rate limit exceeded'
    }),

    upload: createRateLimiter(redisClient, {
      windowMs: 60 * 60 * 1000,
      max: 10,
      message: 'Too many file uploads, please try again later'
    }),

    search: createRateLimiter(redisClient, {
      windowMs: 60 * 1000,
      max: 30,
      message: 'Too many search requests'
    }),

    payment: createRateLimiter(redisClient, {
      windowMs: 60 * 60 * 1000,
      max: 3,
      message: 'Too many payment attempts, please contact support'
    }),

    createCustom: (options) => createRateLimiter(redisClient, options)
  };
};

/**
 * DDoS protection middleware
 */
const createDDoSProtection = () => {
  const suspiciousIPs = new Map();
  const blacklistedIPs = new Set();
  const SUSPICIOUS_THRESHOLD = 100;
  const BLACKLIST_DURATION = 60 * 60 * 1000;

  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;

    if (blacklistedIPs.has(ip)) {
      logger.error('Blocked request from blacklisted IP', { ip });

      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const now = Date.now();
    const record = suspiciousIPs.get(ip);

    if (record) {
      if (now - record.timestamp > 60000) {
        suspiciousIPs.set(ip, { count: 1, timestamp: now });
      } else {
        record.count++;

        if (record.count > SUSPICIOUS_THRESHOLD) {
          logger.error('DDoS pattern detected - blacklisting IP', {
            ip,
            requestCount: record.count
          });

          monitoring.triggerAlert('ddos_detected', { ip, count: record.count });

          blacklistedIPs.add(ip);
          suspiciousIPs.delete(ip);

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

    if (Math.random() < 0.001) {
      for (const [key, value] of suspiciousIPs.entries()) {
        if (now - value.timestamp > 5 * 60 * 1000) {
          suspiciousIPs.delete(key);
        }
      }
    }

    next();
  };
};

module.exports = {
  createRateLimiterFactory,
  createDDoSProtection
};
