const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const logger = require('../utils/logger');
const monitoring = require('../utils/monitoring');
const redisClient = require('../config/redis');

// Track rate limit hits for adaptive limiting with TTL
// Each entry is stored as: { count: number, lastUpdated: timestamp }
const rateLimitMetrics = {
  auth: {
    total: 0,
    blocked: 0,
    ips: new Map(),
    userIds: new Map()
  },
  api: {
    total: 0,
    blocked: 0,
    endpoints: new Map(),
    ips: new Map()
  },
  upload: {
    total: 0,
    blocked: 0,
    ips: new Map(),
    userIds: new Map()
  }
};

// Configuration for TTL cleanup
const CLEANUP_CONFIG = {
  interval: 5 * 60 * 1000, // Run cleanup every 5 minutes
  entryMaxAge: 60 * 60 * 1000, // Remove entries older than 1 hour
  mapMaxSize: 10000 // Max entries per map before forced cleanup
};

// Adaptive thresholds for rate limiting
const adaptiveThresholds = {
  auth: {
    normalMax: 5,     // Normal limit per window
    strictMax: 3,     // Strict limit after suspicious activity
    blockThreshold: 10 // Number of blocks before triggering strict mode
  },
  api: {
    normalMax: 100,
    strictMax: 50,
    blockThreshold: 20
  },
  upload: {
    normalMax: 20,  // Match the rate limiter max
    strictMax: 10,  // Still restrictive in strict mode
    blockThreshold: 10 // More lenient threshold
  }
};

// Store blocked IPs/users with expiration
const blockedEntities = new Map();

// Helper to check if an entity (IP or userId) is in strict mode
const isInStrictMode = (key, type) => {
  const metrics = type === 'auth' ? rateLimitMetrics.auth :
                 type === 'upload' ? rateLimitMetrics.upload :
                 rateLimitMetrics.api;

  const blocks = getMetricCount(metrics.ips, key) + getMetricCount(metrics.userIds, key);
  return blocks >= adaptiveThresholds[type].blockThreshold;
};

// Helper to set entry with timestamp
const setMetricEntry = (map, key, increment = 1) => {
  const existing = map.get(key);
  const count = (existing?.count || 0) + increment;
  map.set(key, { count, lastUpdated: Date.now() });

  // Emergency cleanup if map gets too large
  if (map.size > CLEANUP_CONFIG.mapMaxSize) {
    logger.warn('Rate limit map exceeded max size, forcing cleanup', { size: map.size });
    cleanupOldEntries(map, CLEANUP_CONFIG.entryMaxAge);
  }
};

// Helper to get entry count
const getMetricCount = (map, key) => {
  if (!map || !key) return 0;
  const entry = map.get(key);
  return entry?.count || 0;
};

// Custom handler for rate limit violations
const createRateLimitHandler = (type) => {
  return (req, res) => {
    const ip = req.ip;
    const userId = req.user ? req.user._id : 'anonymous';
    const endpoint = req.path;

    // Update metrics with timestamps
    const metrics = rateLimitMetrics[type];
    metrics.blocked++;
    setMetricEntry(metrics.ips, ip);
    if (userId !== 'anonymous') {
      setMetricEntry(metrics.userIds, userId);
    }
    if (type === 'api') {
      setMetricEntry(metrics.endpoints, endpoint);
    }

    // Log and monitor
    logger.warn(`Rate limit exceeded for ${type}`, {
      ip,
      userId,
      endpoint,
      type,
      blocksCount: metrics.blocked
    });

    // Track suspicious activity
    const ipCount = getMetricCount(metrics.ips, ip);
    if (ipCount >= adaptiveThresholds[type].blockThreshold) {
      monitoring.trackSuspiciousActivity({
        type: 'rate_limit_abuse',
        ip,
        userId,
        endpoint,
        blockCount: ipCount
      });

      // Add to blocked entities with expiration
      blockedEntities.set(ip, {
        until: Date.now() + 3600000, // 1 hour block
        reason: 'Excessive rate limit violations'
      });
    }

    // Send response
    res.status(429).json({
      success: false,
      message: 'Too many requests. Please try again later.',
      retryAfter: res.getHeader('Retry-After')
    });
  };
};

// Determine if Redis is available for distributed rate limiting
const USE_REDIS = process.env.REDIS_ENABLED === 'true' && redisClient;

// Create base limiter with monitoring
const createMonitoredLimiter = (options) => {
  const { type, window, max, message } = options;

  const limiterConfig = {
    windowMs: window,
    max: (req) => {
      // Use IP address for checking strict mode (since we're using default keyGenerator)
      const key = req.ip;
      return isInStrictMode(key, type) ?
        adaptiveThresholds[type].strictMax :
        adaptiveThresholds[type].normalMax;
    },
    message,
    handler: createRateLimitHandler(type),
    skip: (req) => {
      // Skip for whitelisted IPs or internal requests
      return req.ip === '127.0.0.1' ||
             (process.env.WHITELISTED_IPS && process.env.WHITELISTED_IPS.split(',').includes(req.ip));
    },
    // Use default keyGenerator which handles IPv6 correctly
    standardHeaders: true,
    legacyHeaders: false
  };

  // Use Redis store if available (for distributed rate limiting across multiple instances)
  if (USE_REDIS) {
    limiterConfig.store = new RedisStore({
      // @ts-expect-error - Known issue with RedisStore types
      client: redisClient,
      prefix: `rate-limit:${type}:`,
      // Send command to reset (if needed) and respond immediately
      sendCommand: (...args) => redisClient.sendCommand(args)
    });

    logger.info(`Rate limiter for ${type} using Redis store (distributed)`);
  } else {
    logger.info(`Rate limiter for ${type} using memory store (single instance only)`);
  }

  return rateLimit(limiterConfig);
};

// Different rate limiters for different purposes
const rateLimiters = {
  // Auth routes - strict limiting
  auth: createMonitoredLimiter({
    type: 'auth',
    window: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: 'Too many login attempts. Please try again later.'
  }),

  // API routes - moderate limiting
  api: createMonitoredLimiter({
    type: 'api',
    window: 10 * 60 * 1000, // 10 minutes
    max: 100,
    message: 'Too many API requests. Please try again later.'
  }),

  // Upload routes - allow sufficient uploads for onboarding (4 docs + profile) + extras
  upload: createMonitoredLimiter({
    type: 'upload',
    window: 15 * 60 * 1000, // 15 minutes (shorter window)
    max: 20, // Allow 20 uploads per 15 minutes (generous for onboarding)
    message: 'Upload limit reached. Please try again later.'
  }),

  // Custom limiter for specific routes
  custom: (options) => createMonitoredLimiter({
    type: 'api',
    ...options
  })
};

// Helper to clean up old entries from a map
const cleanupOldEntries = (map, maxAge) => {
  const now = Date.now();
  let removedCount = 0;

  for (const [key, value] of map.entries()) {
    if (value.lastUpdated && (now - value.lastUpdated > maxAge)) {
      map.delete(key);
      removedCount++;
    }
  }

  return removedCount;
};

// Periodic cleanup of metrics and blocked entities (runs every 5 minutes)
// Skip in test environment to prevent Jest from hanging
let cleanupInterval = null;
if (process.env.NODE_ENV !== 'test') {
  cleanupInterval = setInterval(() => {
    const now = Date.now();

  // Clean up old blocked entities
  let blockedRemoved = 0;
  for (const [key, value] of blockedEntities.entries()) {
    if (value.until < now) {
      blockedEntities.delete(key);
      blockedRemoved++;
    }
  }

  // Clean up old metric entries
  let totalRemoved = 0;
  Object.entries(rateLimitMetrics).forEach(([type, metric]) => {
    if (metric && metric.ips) {
      totalRemoved += cleanupOldEntries(metric.ips, CLEANUP_CONFIG.entryMaxAge);
    }
    if (metric && metric.userIds) {
      totalRemoved += cleanupOldEntries(metric.userIds, CLEANUP_CONFIG.entryMaxAge);
    }
    if (metric && metric.endpoints) {
      totalRemoved += cleanupOldEntries(metric.endpoints, CLEANUP_CONFIG.entryMaxAge);
    }
  });

  if (totalRemoved > 0 || blockedRemoved > 0) {
    logger.info('Rate limit cleanup completed', {
      metricsRemoved: totalRemoved,
      blockedEntitiesRemoved: blockedRemoved,
      currentSizes: {
        auth: { ips: rateLimitMetrics.auth.ips.size, userIds: rateLimitMetrics.auth.userIds.size },
        api: { ips: rateLimitMetrics.api.ips.size, endpoints: rateLimitMetrics.api.endpoints.size },
        upload: { ips: rateLimitMetrics.upload.ips.size, userIds: rateLimitMetrics.upload.userIds.size },
        blocked: blockedEntities.size
      }
    });
  }
  }, CLEANUP_CONFIG.interval);
}

// Export metrics for monitoring
const getRateLimitMetrics = () => {
  // Convert Maps with timestamps to simple objects for monitoring
  const convertMetricMap = (map) => {
    const result = {};
    for (const [key, value] of map.entries()) {
      result[key] = value.count;
    }
    return result;
  };

  return {
    metrics: {
      auth: {
        total: rateLimitMetrics.auth.total,
        blocked: rateLimitMetrics.auth.blocked,
        ips: convertMetricMap(rateLimitMetrics.auth.ips),
        userIds: convertMetricMap(rateLimitMetrics.auth.userIds)
      },
      api: {
        total: rateLimitMetrics.api.total,
        blocked: rateLimitMetrics.api.blocked,
        endpoints: convertMetricMap(rateLimitMetrics.api.endpoints),
        ips: convertMetricMap(rateLimitMetrics.api.ips)
      },
      upload: {
        total: rateLimitMetrics.upload.total,
        blocked: rateLimitMetrics.upload.blocked,
        ips: convertMetricMap(rateLimitMetrics.upload.ips),
        userIds: convertMetricMap(rateLimitMetrics.upload.userIds)
      }
    },
    sizes: {
      auth: { ips: rateLimitMetrics.auth.ips.size, userIds: rateLimitMetrics.auth.userIds.size },
      api: { ips: rateLimitMetrics.api.ips.size, endpoints: rateLimitMetrics.api.endpoints.size },
      upload: { ips: rateLimitMetrics.upload.ips.size, userIds: rateLimitMetrics.upload.userIds.size },
      blocked: blockedEntities.size
    },
    blocked: Array.from(blockedEntities.entries()).map(([key, value]) => ({
      entity: key,
      ...value
    })),
    thresholds: adaptiveThresholds,
    cleanupConfig: CLEANUP_CONFIG
  };
};

// Graceful cleanup on shutdown
const cleanup = () => {
  clearInterval(cleanupInterval);
  logger.info('Rate limit cleanup interval cleared');
};

module.exports = {
  rateLimiters,
  getRateLimitMetrics,
  isInStrictMode,
  cleanup
};