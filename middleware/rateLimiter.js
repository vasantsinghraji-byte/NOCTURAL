const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const logger = require('../utils/logger');
const { getRedisClient } = require('../config/redis');

const EMERGENCY_QR_REDIS_PREFIX = 'rate-limit:emergency-qr:';

const isEmergencyQrRedisEnabled = () => process.env.REDIS_ENABLED === 'true' || Boolean(process.env.REDIS_URL);

const emergencyQrRedisScript = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local maxRequests = tonumber(ARGV[3])
local baseBackoffMs = tonumber(ARGV[4])
local maxBackoffMs = tonumber(ARGV[5])
local captchaAfterViolations = tonumber(ARGV[6])
local stateTtlMs = tonumber(ARGV[7])

local values = redis.call('HMGET', key, 'count', 'windowStart', 'violations', 'blockedUntil')
local count = tonumber(values[1]) or 0
local windowStart = tonumber(values[2]) or now
local violations = tonumber(values[3]) or 0
local blockedUntil = tonumber(values[4]) or 0

if now - windowStart >= windowMs then
  count = 0
  windowStart = now
end

if blockedUntil > now then
  local retryAfter = math.ceil((blockedUntil - now) / 1000)
  local captchaRequired = 0
  if violations >= captchaAfterViolations then
    captchaRequired = 1
  end
  redis.call('PEXPIRE', key, math.max(stateTtlMs, blockedUntil - now))
  return {0, retryAfter, captchaRequired, violations}
end

count = count + 1

if count > maxRequests then
  violations = violations + 1
  local backoffMs = baseBackoffMs * (2 ^ (violations - 1))
  if backoffMs > maxBackoffMs then
    backoffMs = maxBackoffMs
  end
  blockedUntil = now + backoffMs

  redis.call(
    'HMSET',
    key,
    'count',
    count,
    'windowStart',
    windowStart,
    'violations',
    violations,
    'blockedUntil',
    blockedUntil
  )
  redis.call('PEXPIRE', key, math.max(stateTtlMs, backoffMs))

  local captchaRequired = 0
  if violations >= captchaAfterViolations then
    captchaRequired = 1
  end
  return {0, math.ceil(backoffMs / 1000), captchaRequired, violations}
end

redis.call(
  'HMSET',
  key,
  'count',
  count,
  'windowStart',
  windowStart,
  'violations',
  violations,
  'blockedUntil',
  blockedUntil
)
redis.call('PEXPIRE', key, stateTtlMs)

return {1, 0, 0, violations}
`;

const createEmergencyQrLimiter = (options = {}) => {
  const windowMs = options.windowMs || 60 * 1000;
  const max = options.max || 3;
  const baseBackoffMs = options.baseBackoffMs || 60 * 1000;
  const maxBackoffMs = options.maxBackoffMs || 15 * 60 * 1000;
  const captchaAfterViolations = options.captchaAfterViolations || 2;
  const stateTtlMs = options.stateTtlMs || 60 * 60 * 1000;
  const buckets = new Map();

  const getClientIp = (req) => req.ip || req.connection?.remoteAddress || 'unknown';

  const sendRateLimited = (res, retryAfter, captchaRequired) => {
    res.set('Retry-After', String(retryAfter));

    return res.status(429).json({
      success: false,
      message: 'Too many emergency QR attempts, please try again later',
      retryAfter,
      captchaRequired
    });
  };

  const handleInMemoryLimit = (req, res, next, now, ip) => {
    let bucket = buckets.get(ip);

    if (!bucket || now - bucket.windowStart >= windowMs) {
      bucket = {
        count: 0,
        windowStart: now,
        violations: bucket?.violations || 0,
        blockedUntil: bucket?.blockedUntil || 0
      };
      buckets.set(ip, bucket);
    }

    if (bucket.blockedUntil > now) {
      const retryAfter = Math.ceil((bucket.blockedUntil - now) / 1000);
      return sendRateLimited(res, retryAfter, bucket.violations >= captchaAfterViolations);
    }

    bucket.count += 1;

    if (bucket.count > max) {
      bucket.violations += 1;
      const backoffMs = Math.min(
        baseBackoffMs * (2 ** (bucket.violations - 1)),
        maxBackoffMs
      );
      bucket.blockedUntil = now + backoffMs;

      const retryAfter = Math.ceil(backoffMs / 1000);

      logger.warn('Emergency QR rate limit exceeded', {
        ip,
        path: req.path,
        violations: bucket.violations,
        retryAfter,
        store: 'memory'
      });

      return sendRateLimited(res, retryAfter, bucket.violations >= captchaAfterViolations);
    }

    if (Math.random() < 0.001) {
      for (const [key, value] of buckets.entries()) {
        const isWindowExpired = now - value.windowStart >= windowMs;
        const isBlockExpired = !value.blockedUntil || value.blockedUntil <= now;
        if (isWindowExpired && isBlockExpired) {
          buckets.delete(key);
        }
      }
    }

    next();
  };

  const handleRedisLimit = async (req, res, next, now, ip, redisClient) => {
    const key = `${EMERGENCY_QR_REDIS_PREFIX}${ip}`;
    const [allowed, retryAfter, captchaRequired, violations] = await redisClient.eval(
      emergencyQrRedisScript,
      1,
      key,
      now,
      windowMs,
      max,
      baseBackoffMs,
      maxBackoffMs,
      captchaAfterViolations,
      stateTtlMs
    );

    if (Number(allowed) === 1) {
      return next();
    }

    logger.warn('Emergency QR rate limit exceeded', {
      ip,
      path: req.path,
      violations,
      retryAfter,
      store: 'redis'
    });

    return sendRateLimited(res, retryAfter, Number(captchaRequired) === 1);
  };

  return async (req, res, next) => {
    const now = Date.now();
    const ip = getClientIp(req);

    if (isEmergencyQrRedisEnabled()) {
      try {
        const redisClient = await getRedisClient();
        if (redisClient && redisClient.status === 'ready') {
          await handleRedisLimit(req, res, next, now, ip, redisClient);
          return;
        }

        logger.warn('Emergency QR Redis limiter unavailable; using per-instance memory fallback', {
          ip,
          path: req.path
        });
      } catch (error) {
        logger.error('Emergency QR Redis limiter failed; using per-instance memory fallback', {
          error: error.message,
          ip,
          path: req.path
        });
      }
    }

    return handleInMemoryLimit(req, res, next, now, ip);
  };
};

// Helper to create rate limiters with logging
const rateLimitKeyGenerator = (req) => {
  const userId = req.user?._id || req.user?.id;
  if (userId) {
    return `user:${userId.toString()}`;
  }

  return ipKeyGenerator(req.ip || req.connection?.remoteAddress || 'unknown');
};

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
    keyGenerator: rateLimitKeyGenerator
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
  }),

  // Public emergency QR endpoint: PHI exposure risk, brute-force resistant.
  emergencyQrLimiter: createEmergencyQrLimiter(),
  createEmergencyQrLimiter,
  rateLimitKeyGenerator
};
