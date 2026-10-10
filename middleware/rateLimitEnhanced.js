/**
 * Enhanced Rate Limiting Middleware
 * Advanced rate limiting with Redis, IP tracking, and DDoS protection
 */

const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = rateLimit;
const rateLimitRedis = require('rate-limit-redis');
const RedisStore = rateLimitRedis.RedisStore || rateLimitRedis.default || rateLimitRedis;
const { MongoRateLimitStore } = require('./mongoRateLimitStore');
const Redis = require('ioredis');
const { scanKeys } = require('../config/redis');
const logger = require('../utils/logger');
const monitoring = require('../utils/monitoring');

// Redis client (shared across rate limiters)
let redisClient = null;
const isRateLimitingDisabled = process.env.RATE_LIMIT_ENABLED === 'false';
const isRedisDisabled = process.env.REDIS_ENABLED === 'false';
const isProduction = process.env.NODE_ENV === 'production';

// Production fail-fast: Redis-backed rate limiting must be explicitly opted out
// of with REDIS_ENABLED=false. Leaving REDIS_ENABLED unset does NOT count as
// disabled — a missing env var must not silently downgrade to the per-instance
// memory store. Render services without a provisioned Redis therefore need
// REDIS_ENABLED=false in their environment or the process exits 1 at boot
// (this crashed two production deploys on 2026-07-06; see PR #160 and
// terraform/apprunner-staging/README.md).
if (isProduction && !isRateLimitingDisabled && !isRedisDisabled && !process.env.REDIS_URL) {
  throw new Error('REDIS_URL is required for production rate limiting');
}

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

const getAuthenticatedUserId = (req) => {
  const userId = req.user?.id || req.user?._id;
  return typeof userId?.toString === 'function' ? userId.toString() : userId;
};

/**
 * The visitor's real IP. The website proxies /api/* through its own server,
 * so every website visitor would otherwise look like one IP; the web server
 * forwards the visitor's IP in x-nabz-client-ip, signed with a shared secret
 * (see frontends/web/middleware.ts). Anything unsigned is ignored.
 */
const net = require('net');
const crypto = require('crypto');
function clientIp(req) {
  if (req.nabzClientIp !== undefined) return req.nabzClientIp || req.ip;
  let ip = null;
  const secret = process.env.PROXY_SHARED_SECRET || '';
  const given = req.get ? req.get('x-nabz-proxy-key') : undefined;
  const forwarded = req.get ? req.get('x-nabz-client-ip') : undefined;
  if (secret.length >= 32 && typeof given === 'string' && forwarded && net.isIP(forwarded.trim())) {
    const a = crypto.createHash('sha256').update(given).digest();
    const b = crypto.createHash('sha256').update(secret).digest();
    if (crypto.timingSafeEqual(a, b)) ip = forwarded.trim();
  }
  req.nabzClientIp = ip;
  return ip || req.ip;
}

/**
 * Signed-in callers are limited per account, not per IP: Indian mobile
 * carriers put many subscribers behind one IP (CGNAT), and one phone runs
 * both Nabz apps. The limiter runs before `protect`, so the token is
 * verified here (cheap HMAC check; forged tokens fall back to the IP).
 */
function callerKey(req) {
  const userId = getAuthenticatedUserId(req);
  if (userId) return { kind: 'user', id: String(userId) };
  try {
    const token = require('./auth').getAccessTokenFromRequest(req);
    if (token) {
      const decoded = require('../utils/authTokens').verifyAccessToken(token);
      if (decoded && decoded.id) return { kind: 'user', id: String(decoded.id) };
    }
  } catch {
    // invalid / expired token: treat as anonymous
  }
  return { kind: 'ip', id: ipKeyGenerator(clientIp(req)) };
}

const scopedUserOrIpKey = (scope) => (req) => {
  const caller = callerKey(req);
  return `${scope}:${caller.kind}:${caller.id}`;
};

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
    keyGenerator,
    handler = null,
    onLimitReached = null,
    // Sign-in / recovery limiters: count across all instances even without Redis.
    shared = false
  } = options;

  const config = {
    windowMs,
    max,
    message: { success: false, error: message || 'Too many requests, please try again later' },
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers
    skipSuccessfulRequests,
    skipFailedRequests,

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

  // Default key: the real visitor IP (not the website proxy's).
  config.keyGenerator = keyGenerator || ((req) => ipKeyGenerator(clientIp(req)));

  // Use Redis store if available
  if (redisClient) {
    config.store = new RedisStore({
      client: redisClient,
      prefix: 'rl:', // rate limit prefix
      sendCommand: (...args) => redisClient.call(...args)
    });
  } else if (shared && process.env.NODE_ENV !== 'test') {
    // Tests share one database across suites, so they keep per-process counts.
    config.store = new MongoRateLimitStore({ prefix: `rl:${options.name || 'shared'}:` });
  }

  return rateLimit(config);
};

/**
 * Global rate limiter - applies to all requests
 * 1000 requests per 15 minutes per IP
 */
const globalRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  // Per account when signed in, else per (real) IP. Generous: shared IPs.
  max: (req) => (callerKey(req).kind === 'user' ? 4000 : 3000),
  message: 'Too many requests, please try again in a few minutes',
  keyGenerator: scopedUserOrIpKey('global')
});

/**
 * Strict rate limiter - for sensitive endpoints
 * 5 requests per 15 minutes per IP
 */
const strictRateLimiter = createRateLimiter({
  name: 'strict',
  shared: true,
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
  name: 'auth',
  shared: true,
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many authentication attempts, please try again later',
  skipSuccessfulRequests: true,
  onLimitReached: (req, _res) => {
    // Additional security measures on auth limit reached
    monitoring.triggerAlert('auth_rate_limit_exceeded', {
      ip: req.ip,
      endpoint: req.url,
      userAgent: req.get('user-agent')
    });
  }
});

/**
 * Hospital waitlist limiter
 * 10 submissions per hour per IP. This is intentionally separate from auth
 * because it is a public lead form, not an account-creation endpoint.
 */
const hospitalWaitlistRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many waitlist submissions, please try again later'
});

/**
 * Password reset rate limiter
 * 3 attempts per hour per IP
 */
const passwordResetRateLimiter = createRateLimiter({
  name: 'password-reset',
  shared: true,
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: 'Too many password reset attempts, please try again later'
});

/**
 * API rate limiter - for general API endpoints.
 * The apps poll (partner offers every 5 s, tracking, store orders), so a
 * normal signed-in session makes ~20 requests a minute; 100 per 15 minutes
 * locked real users out. Now ~120/min per account, ~50/min per anonymous IP.
 */
const apiRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: (req) => (callerKey(req).kind === 'user' ? 1800 : 750),
  message: 'Too many requests, please try again in a few minutes',
  keyGenerator: scopedUserOrIpKey('api')
});

/**
 * File upload rate limiter
 * 10 uploads per hour per user
 */
const uploadRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many file uploads, please try again later',
  keyGenerator: scopedUserOrIpKey('upload')
});

/**
 * Search rate limiter
 * 30 searches per minute per user
 */
const searchRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: 'Too many search requests',
  keyGenerator: scopedUserOrIpKey('search')
});

/**
 * Payment rate limiter
 * 3 payment attempts per hour per user
 */
const paymentRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: 'Too many payment attempts, please contact support',
  keyGenerator: scopedUserOrIpKey('payment')
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
      const userId = getAuthenticatedUserId(req);
      const actorKey = userId ? `user:${userId}` : `ip:${ipKeyGenerator(clientIp(req))}`;
      return `${actorKey}:${req.user?.role || 'guest'}`;
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
    // Skip DDoS gating for static asset/page GETs (served by express.static) and
    // health checks. These are high-frequency monitoring / CI / static-serving
    // traffic, not attack surface, and the in-memory per-IP blacklist
    // false-positives shared CI/proxy egress IPs (e.g. GitHub Actions runners
    // running many smoke jobs in parallel), failing the deployed smoke test and
    // blanket-blocking the page. API and non-GET requests are still gated.
    if (
      req.path === '/api/v1/health' ||
      req.path === '/api/health' ||
      (req.method === 'GET' && !req.path.startsWith('/api'))
    ) {
      return next();
    }

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
    const keys = await scanKeys(redisClient, 'rl:*');

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
  clientIp,
  callerKey,
  globalRateLimiter,
  strictRateLimiter,
  authRateLimiter,
  hospitalWaitlistRateLimiter,
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
