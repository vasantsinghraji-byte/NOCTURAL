/**
 * Query Result Caching Middleware
 * Caches MongoDB query results in Redis for improved performance
 */

const { redisClient } = require('../config/redis');
const logger = require('../utils/logger');

// Default cache TTL (Time To Live) in seconds
const DEFAULT_CACHE_TTL = 300; // 5 minutes

// Cache key prefix
const CACHE_PREFIX = 'query:';

/**
 * Generate cache key from request
 */
const generateCacheKey = (req) => {
  const { baseUrl, path, method, query, user } = req;
  const userId = user ? user._id.toString() : 'anonymous';

  // Create deterministic key from URL, method, query params, and user
  const keyParts = [
    CACHE_PREFIX,
    method,
    baseUrl,
    path,
    JSON.stringify(query),
    userId
  ];

  return keyParts.join(':').replace(/[^a-zA-Z0-9:_-]/g, '_');
};

/**
 * Query cache middleware
 * @param {Object} options - Cache configuration
 * @param {number} options.ttl - Cache TTL in seconds
 * @param {Function} options.condition - Function to determine if request should be cached
 * @param {Array} options.excludeFields - Fields to exclude from cached response
 */
const queryCache = (options = {}) => {
  const {
    ttl = DEFAULT_CACHE_TTL,
    condition = () => true,
    excludeFields = []
  } = options;

  return async (req, res, next) => {
    // Skip caching if:
    // 1. Redis is not available
    // 2. Request is not GET
    // 3. Custom condition returns false
    // 4. Cache is explicitly disabled via query param
    if (
      !redisClient ||
      redisClient.status !== 'ready' ||
      req.method !== 'GET' ||
      !condition(req) ||
      req.query._nocache === 'true'
    ) {
      return next();
    }

    const cacheKey = generateCacheKey(req);

    try {
      // Try to get cached result
      const cachedData = await redisClient.get(cacheKey);

      if (cachedData) {
        const parsedData = JSON.parse(cachedData);

        logger.debug('Cache hit', {
          key: cacheKey,
          path: req.path
        });

        // Add cache headers
        res.set('X-Cache', 'HIT');
        res.set('X-Cache-Key', cacheKey);

        return res.json(parsedData);
      }

      // Cache miss - proceed with request
      logger.debug('Cache miss', {
        key: cacheKey,
        path: req.path
      });

      // Capture original res.json function
      const originalJson = res.json.bind(res);

      // Override res.json to cache the response
      res.json = function(data) {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // Remove excluded fields
          const dataToCache = excludeFields.length > 0
            ? removeFields(data, excludeFields)
            : data;

          // Cache the response asynchronously (don't wait)
          redisClient
            .setex(cacheKey, ttl, JSON.stringify(dataToCache))
            .then(() => {
              logger.debug('Response cached', {
                key: cacheKey,
                ttl,
                size: JSON.stringify(dataToCache).length
              });
            })
            .catch((err) => {
              logger.error('Cache write error', {
                key: cacheKey,
                error: err.message
              });
            });
        }

        // Add cache headers
        res.set('X-Cache', 'MISS');
        res.set('X-Cache-Key', cacheKey);
        res.set('X-Cache-TTL', ttl);

        // Call original res.json
        return originalJson(data);
      };

      next();
    } catch (error) {
      logger.error('Cache middleware error', {
        key: cacheKey,
        error: error.message
      });

      // Continue without caching on error
      next();
    }
  };
};

/**
 * Helper to remove fields from object
 */
const removeFields = (obj, fields) => {
  if (Array.isArray(obj)) {
    return obj.map(item => removeFields(item, fields));
  }

  if (obj && typeof obj === 'object') {
    const newObj = { ...obj };
    fields.forEach(field => {
      delete newObj[field];
    });
    return newObj;
  }

  return obj;
};

/**
 * Invalidate cache by pattern
 */
const invalidateCache = async (pattern) => {
  if (!redisClient || redisClient.status !== 'ready') {
    return;
  }

  try {
    const keys = await redisClient.keys(`${CACHE_PREFIX}${pattern}*`);

    if (keys.length > 0) {
      await redisClient.del(...keys);
      logger.info('Cache invalidated', {
        pattern,
        keysDeleted: keys.length
      });
    }
  } catch (error) {
    logger.error('Cache invalidation error', {
      pattern,
      error: error.message
    });
  }
};

/**
 * Invalidate cache for specific user
 */
const invalidateUserCache = async (userId) => {
  await invalidateCache(`*:${userId}`);
};

/**
 * Invalidate cache for specific resource
 */
const invalidateResourceCache = async (resource) => {
  await invalidateCache(`*:${resource}*`);
};

/**
 * Clear all query cache
 */
const clearAllCache = async () => {
  if (!redisClient || redisClient.status !== 'ready') {
    return;
  }

  try {
    const keys = await redisClient.keys(`${CACHE_PREFIX}*`);

    if (keys.length > 0) {
      await redisClient.del(...keys);
      logger.info('All query cache cleared', {
        keysDeleted: keys.length
      });
    }
  } catch (error) {
    logger.error('Cache clear error', {
      error: error.message
    });
  }
};

/**
 * Get cache statistics
 */
const getCacheStats = async () => {
  if (!redisClient || redisClient.status !== 'ready') {
    return null;
  }

  try {
    const keys = await redisClient.keys(`${CACHE_PREFIX}*`);
    const info = await redisClient.info('stats');

    return {
      totalKeys: keys.length,
      prefix: CACHE_PREFIX,
      redisStats: info
    };
  } catch (error) {
    logger.error('Cache stats error', {
      error: error.message
    });
    return null;
  }
};

module.exports = {
  queryCache,
  invalidateCache,
  invalidateUserCache,
  invalidateResourceCache,
  clearAllCache,
  getCacheStats,
  DEFAULT_CACHE_TTL
};
