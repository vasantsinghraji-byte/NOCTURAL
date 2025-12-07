const { getFromCache, setToCache, deletePattern } = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Cache Middleware
 * Provides response caching for GET requests
 */

/**
 * Generate cache key from request
 */
const generateCacheKey = (req) => {
  const userId = req.user ? req.user._id || req.user.id : 'anonymous';
  const queryString = JSON.stringify(req.query);
  const path = req.originalUrl || req.url;

  return `cache:${userId}:${path}:${queryString}`;
};

/**
 * Cache middleware factory
 * @param {number} ttlSeconds - Time to live in seconds (default: 5 minutes)
 * @param {function} keyGenerator - Optional custom key generator
 */
const cacheMiddleware = (ttlSeconds = 300, keyGenerator = null) => {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    try {
      // Generate cache key
      const cacheKey = keyGenerator ? keyGenerator(req) : generateCacheKey(req);

      // Try to get from cache
      const cachedData = await getFromCache(cacheKey);

      if (cachedData) {
        // Cache hit - return cached response
        logger.debug('Serving from cache', { key: cacheKey });

        return res.status(200).json({
          ...cachedData,
          _cached: true,
          _cacheTime: new Date().toISOString()
        });
      }

      // Cache miss - intercept res.json to cache response
      const originalJson = res.json.bind(res);

      res.json = function(data) {
        // Only cache successful responses
        if (res.statusCode === 200) {
          // Don't cache if explicitly disabled in response
          if (!data._noCache) {
            setToCache(cacheKey, data, ttlSeconds)
              .catch(err => logger.error('Failed to cache response', { error: err.message }));
          }
        }

        // Call original json method
        return originalJson(data);
      };

      next();
    } catch (error) {
      // On cache error, just continue without caching
      logger.error('Cache middleware error', { error: error.message });
      next();
    }
  };
};

/**
 * Invalidate cache for specific user
 */
const invalidateUserCache = async (userId) => {
  try {
    await deletePattern(`cache:${userId}:*`);
    logger.info('User cache invalidated', { userId });
  } catch (error) {
    logger.error('Failed to invalidate user cache', { userId, error: error.message });
  }
};

/**
 * Invalidate cache for specific path pattern
 */
const invalidatePath = async (pathPattern) => {
  try {
    await deletePattern(`cache:*:${pathPattern}*`);
    logger.info('Path cache invalidated', { pathPattern });
  } catch (error) {
    logger.error('Failed to invalidate path cache', { pathPattern, error: error.message });
  }
};

/**
 * Cache invalidation middleware
 * Automatically invalidates related cache on mutations
 */
const invalidateCacheMiddleware = (patterns = []) => {
  return async (req, res, next) => {
    // Only invalidate on mutation operations
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const originalJson = res.json.bind(res);

      res.json = async function(data) {
        // Invalidate cache on successful mutations
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            // Invalidate user-specific cache
            if (req.user && req.user._id) {
              await invalidateUserCache(req.user._id);
            }

            // Invalidate path-specific patterns
            for (const pattern of patterns) {
              await invalidatePath(pattern);
            }
          } catch (error) {
            logger.error('Cache invalidation error', { error: error.message });
          }
        }

        return originalJson(data);
      };
    }

    next();
  };
};

/**
 * Predefined cache durations
 */
const CACHE_DURATION = {
  SHORT: 60,           // 1 minute - for frequently changing data
  MEDIUM: 300,         // 5 minutes - for moderately changing data
  LONG: 900,           // 15 minutes - for rarely changing data
  HOUR: 3600,          // 1 hour - for static data
  DAY: 86400           // 24 hours - for very static data
};

/**
 * Route-specific cache configurations
 */
const cacheConfig = {
  // User profile - medium duration, invalidate on profile updates
  userProfile: cacheMiddleware(CACHE_DURATION.MEDIUM),

  // Duty listings - short duration (new duties posted frequently)
  dutyList: cacheMiddleware(CACHE_DURATION.SHORT),

  // Analytics - longer duration (expensive queries)
  analytics: cacheMiddleware(CACHE_DURATION.LONG),

  // Static content - very long duration
  staticContent: cacheMiddleware(CACHE_DURATION.DAY),

  // Custom duration
  custom: (seconds) => cacheMiddleware(seconds)
};

module.exports = {
  cacheMiddleware,
  invalidateUserCache,
  invalidatePath,
  invalidateCacheMiddleware,
  generateCacheKey,
  cacheConfig,
  CACHE_DURATION
};
