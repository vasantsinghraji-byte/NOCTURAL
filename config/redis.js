const Redis = require('ioredis');
const logger = require('../utils/logger');

let redisClient = null;
let isConnected = false;

/**
 * Redis Configuration
 * Provides caching layer for frequently accessed data
 */

const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB) || 0,

  // Connection options
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },

  // Timeouts
  connectTimeout: 10000,
  maxRetriesPerRequest: 3,

  // Enable offline queue
  enableOfflineQueue: true,

  // Keep-alive
  keepAlive: 30000,

  // Cluster mode support (optional)
  enableReadyCheck: true,
  autoResubscribe: true,
  autoResendUnfulfilledCommands: true,

  // Reconnection
  reconnectOnError(err) {
    const targetErrors = ['READONLY', 'ECONNREFUSED'];
    return targetErrors.some(targetError => err.message.includes(targetError));
  }
};

/**
 * Initialize Redis connection
 */
const connectRedis = () => {
  try {
    // Skip if Redis is disabled
    if (process.env.REDIS_ENABLED === 'false') {
      logger.info('Redis caching disabled via configuration');
      return null;
    }

    redisClient = new Redis(REDIS_CONFIG);

    // Connection events
    redisClient.on('connect', () => {
      logger.info('Redis client connected', {
        host: REDIS_CONFIG.host,
        port: REDIS_CONFIG.port,
        db: REDIS_CONFIG.db
      });
    });

    redisClient.on('ready', () => {
      isConnected = true;
      logger.info('Redis client ready');
    });

    redisClient.on('error', (err) => {
      isConnected = false;
      logger.error('Redis error', {
        error: err.message,
        code: err.code
      });
    });

    redisClient.on('close', () => {
      isConnected = false;
      logger.warn('Redis connection closed');
    });

    redisClient.on('reconnecting', () => {
      logger.info('Redis client reconnecting...');
    });

    return redisClient;
  } catch (error) {
    logger.error('Failed to initialize Redis client', { error: error.message });
    return null;
  }
};

/**
 * Get Redis client instance
 */
const getRedisClient = () => {
  if (!redisClient && process.env.REDIS_ENABLED !== 'false') {
    connectRedis();
  }
  return redisClient;
};

/**
 * Check if Redis is available
 */
const isRedisAvailable = () => {
  return isConnected && redisClient !== null;
};

/**
 * Safe get from cache (returns null if Redis unavailable)
 */
const getFromCache = async (key) => {
  if (!isRedisAvailable()) {
    return null;
  }

  try {
    const data = await redisClient.get(key);
    if (data) {
      logger.debug('Cache hit', { key });
      return JSON.parse(data);
    }
    logger.debug('Cache miss', { key });
    return null;
  } catch (error) {
    logger.error('Cache get error', { key, error: error.message });
    return null;
  }
};

/**
 * Safe set to cache (silent fail if Redis unavailable)
 */
const setToCache = async (key, value, ttlSeconds = 300) => {
  if (!isRedisAvailable()) {
    return false;
  }

  try {
    const serialized = JSON.stringify(value);

    if (ttlSeconds > 0) {
      await redisClient.setex(key, ttlSeconds, serialized);
    } else {
      await redisClient.set(key, serialized);
    }

    logger.debug('Cache set', { key, ttl: ttlSeconds });
    return true;
  } catch (error) {
    logger.error('Cache set error', { key, error: error.message });
    return false;
  }
};

/**
 * Delete from cache
 */
const deleteFromCache = async (key) => {
  if (!isRedisAvailable()) {
    return false;
  }

  try {
    await redisClient.del(key);
    logger.debug('Cache deleted', { key });
    return true;
  } catch (error) {
    logger.error('Cache delete error', { key, error: error.message });
    return false;
  }
};

/**
 * Delete multiple keys matching pattern
 */
const deletePattern = async (pattern) => {
  if (!isRedisAvailable()) {
    return false;
  }

  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(...keys);
      logger.debug('Cache pattern deleted', { pattern, count: keys.length });
    }
    return true;
  } catch (error) {
    logger.error('Cache pattern delete error', { pattern, error: error.message });
    return false;
  }
};

/**
 * Clear entire cache
 */
const clearCache = async () => {
  if (!isRedisAvailable()) {
    return false;
  }

  try {
    await redisClient.flushdb();
    logger.info('Cache cleared');
    return true;
  } catch (error) {
    logger.error('Cache clear error', { error: error.message });
    return false;
  }
};

/**
 * Get cache statistics
 */
const getCacheStats = async () => {
  if (!isRedisAvailable()) {
    return {
      available: false,
      error: 'Redis not connected'
    };
  }

  try {
    const info = await redisClient.info('stats');
    const keyspace = await redisClient.info('keyspace');

    return {
      available: true,
      connected: isConnected,
      info,
      keyspace
    };
  } catch (error) {
    return {
      available: false,
      error: error.message
    };
  }
};

/**
 * Graceful shutdown
 */
const disconnectRedis = async () => {
  if (redisClient) {
    try {
      await redisClient.quit();
      logger.info('Redis connection closed gracefully');
    } catch (error) {
      logger.error('Error closing Redis connection', { error: error.message });
    }
  }
};

module.exports = {
  connectRedis,
  disconnectRedis,
  getRedisClient,
  isRedisAvailable,
  getFromCache,
  setToCache,
  deleteFromCache,
  deletePattern,
  clearCache,
  getCacheStats
};
