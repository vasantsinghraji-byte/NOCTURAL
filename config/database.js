const mongoose = require('mongoose');
const logger = require('../utils/logger');
const monitoring = require('../utils/monitoring');
const idempotencyIndexes = require('./idempotencyIndexes');

const RECONNECT_INTERVAL = 5000; // 5 seconds
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
const MAX_RECONNECT_ATTEMPTS = 10;
const IDEMPOTENCY_TTL_SECONDS = parseInt(process.env.IDEMPOTENCY_TTL_SECONDS, 10) || 86400;

let isConnected = false;
let reconnectAttempts = 0;
let connectionListenersRegistered = false;
let healthCheckIntervalId = null;
let reconnectTimeoutId = null;
let isShuttingDown = false;
let connectionMetrics = {
  totalConnections: 0,
  activeConnections: 0,
  availableConnections: 0,
  lastHealthCheck: null,
  lastReconnectAttempt: null,
  errors: []
};

const ensureIdempotencyIndexes = async () => {
  const collection = mongoose.connection.db.collection('idempotencykeys');

  try {
    // Creating this first also creates the collection on a fresh environment.
    await collection.createIndex({ scope: 1 }, {
      name: 'scope_unique_idx',
      unique: true,
      background: true
    });

    const existingIndexes = await collection.indexes();
    const existingTtlIndex = existingIndexes.find((index) => index.name === 'idempotency_ttl_idx');

    // MongoDB rejects createIndex when the same named TTL index exists with a
    // different expiry. Change TTL intentionally with collMod or the index
    // migration script before deploying a new IDEMPOTENCY_TTL_SECONDS value.
    if (existingTtlIndex && existingTtlIndex.expireAfterSeconds !== IDEMPOTENCY_TTL_SECONDS) {
      throw new Error(
        `idempotency_ttl_idx retention mismatch: expected ${IDEMPOTENCY_TTL_SECONDS}, ` +
        `found ${existingTtlIndex.expireAfterSeconds}; update it with collMod before deployment`
      );
    }

    if (!existingTtlIndex) {
      await collection.createIndex({ createdAt: 1 }, {
        name: 'idempotency_ttl_idx',
        expireAfterSeconds: IDEMPOTENCY_TTL_SECONDS,
        background: true
      });
    }

    const indexes = await collection.indexes();
    const scopeIndex = indexes.find((index) => index.name === 'scope_unique_idx');
    const ttlIndex = indexes.find((index) => index.name === 'idempotency_ttl_idx');

    if (!scopeIndex?.unique || ttlIndex?.expireAfterSeconds !== IDEMPOTENCY_TTL_SECONDS) {
      throw new Error('Idempotency index verification failed');
    }

    idempotencyIndexes.markReady();
    logger.info('Idempotency indexes verified', {
      uniqueScope: true,
      retentionSeconds: IDEMPOTENCY_TTL_SECONDS
    });
  } catch (error) {
    idempotencyIndexes.markUnavailable(error);
    throw error;
  }
};

const verifyIdempotencyIndexesAvailability = async () => {
  try {
    await ensureIdempotencyIndexes();
  } catch (error) {
    logger.error('Idempotency indexes unavailable; protected mutations disabled', {
      error: error.message
    });
    monitoring.triggerAlert('idempotency_indexes_unavailable', {
      error: error.message
    });
  }
};

// Helper function to update connection metrics
const updateConnectionMetrics = async () => {
  const db = mongoose.connection.db;
  if (db) {
    try {
      // Try to get server status, but don't fail if we don't have admin privileges
      const status = await db.admin().serverStatus();
      if (status && status.connections) {
        connectionMetrics = {
          ...connectionMetrics,
          totalConnections: status.connections.totalCreated || 0,
          activeConnections: status.connections.current || 0,
          availableConnections: status.connections.available || 0
        };

        // Log metrics if significant changes
        if (Math.abs(connectionMetrics.activeConnections - status.connections.current) > 2) {
          logger.info('DB Connection Pool Status', connectionMetrics);
        }
      }
    } catch (err) {
      // Silently ignore if we don't have admin privileges
      // This is expected in production environments without admin access
    }
  }
};

// Health check function
const checkDatabaseHealth = async () => {
  try {
    if (!isConnected) return false;

    // Simple ping to check connection (doesn't require admin privileges)
    await mongoose.connection.db.command({ ping: 1 });

    // Update metrics
    await updateConnectionMetrics();

    connectionMetrics.lastHealthCheck = new Date();
    connectionMetrics.errors = [];
    return true;
  } catch (error) {
    connectionMetrics.errors.push({
      timestamp: new Date(),
      message: error.message
    });

    logger.error('Database health check failed', {
      error: error.message,
      metrics: connectionMetrics
    });

    monitoring.trackError('database', error, { type: 'healthCheck' });
    return false;
  }
};

const clearReconnectTimeout = () => {
  if (reconnectTimeoutId) {
    clearTimeout(reconnectTimeoutId);
    reconnectTimeoutId = null;
  }
};

const startHealthCheck = () => {
  if (healthCheckIntervalId) {
    return;
  }

  healthCheckIntervalId = setInterval(async () => {
    const isHealthy = await checkDatabaseHealth();
    if (!isHealthy && isConnected) {
      logger.warn('Database health check failed but connection marked as active', {
        metrics: connectionMetrics
      });
    }
  }, HEALTH_CHECK_INTERVAL);

  if (typeof healthCheckIntervalId.unref === 'function') {
    healthCheckIntervalId.unref();
  }
};

const stopHealthCheck = () => {
  if (healthCheckIntervalId) {
    clearInterval(healthCheckIntervalId);
    healthCheckIntervalId = null;
  }
};

const scheduleReconnect = () => {
  if (isShuttingDown || reconnectTimeoutId) {
    return;
  }

  const backoffTime = Math.min(RECONNECT_INTERVAL * Math.pow(2, reconnectAttempts), 30000);
  reconnectTimeoutId = setTimeout(() => {
    reconnectTimeoutId = null;
    connectDB();
  }, backoffTime);

  if (typeof reconnectTimeoutId.unref === 'function') {
    reconnectTimeoutId.unref();
  }
};

const initializeConnectionMonitoring = () => {
  if (connectionListenersRegistered) {
    return;
  }

  connectionListenersRegistered = true;

  mongoose.connection.on('error', (err) => {
    isConnected = false;
    reconnectAttempts++;

    logger.error('MongoDB error', {
      error: err.message,
      reconnectAttempts,
      maxAttempts: MAX_RECONNECT_ATTEMPTS
    });

    monitoring.trackError('database', err, {
      reconnectAttempts,
      connectionMetrics
    });

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      monitoring.triggerAlert('database_reconnect_failed', {
        attempts: reconnectAttempts,
        lastError: err.message,
        metrics: connectionMetrics
      });
    }
  });

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    idempotencyIndexes.markUnavailable('MongoDB disconnected');
    connectionMetrics.lastReconnectAttempt = new Date();

    logger.warn('MongoDB disconnected', {
      reconnectAttempts,
      metrics: connectionMetrics
    });

    if (isShuttingDown) {
      stopHealthCheck();
      clearReconnectTimeout();
      return;
    }

    scheduleReconnect();
  });

  mongoose.connection.on('connected', () => {
    isConnected = true;
    updateConnectionMetrics();

    logger.info('MongoDB connection established', {
      metrics: connectionMetrics
    });
  });

  mongoose.connection.on('reconnected', async () => {
    isConnected = true;
    reconnectAttempts = 0;
    updateConnectionMetrics();
    await verifyIdempotencyIndexesAvailability();

    logger.info('MongoDB reconnected', {
      metrics: connectionMetrics
    });
  });
};

const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is not set');
    }

    isShuttingDown = false;
    clearReconnectTimeout();
    initializeConnectionMonitoring();

    // Log connection attempt (mask password)
    const maskedUri = process.env.MONGODB_URI.replace(/:([^@]+)@/, ':****@');
    logger.info('Attempting MongoDB connection', {
      uri: maskedUri
    });

    // Simplified options for MongoDB Atlas compatibility
    const options = {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 30000, // Increased for cloud connections
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000, // Increased for cloud connections
      retryWrites: true,
      retryReads: true,
      writeConcern: { w: 'majority', j: true, wtimeout: 10000 },
      readPreference: process.env.MONGODB_READ_PREFERENCE || 'secondaryPreferred'
    };

    await mongoose.connect(process.env.MONGODB_URI, options);

    await verifyIdempotencyIndexesAvailability();

    isConnected = true;
    reconnectAttempts = 0; // Reset reconnect attempts on successful connection
    startHealthCheck();

    logger.info('MongoDB Connected', {
      target: process.env.MONGODB_URI.split('@')[1]?.split('/')[0] || 'database',
      host: process.env.MONGODB_URI.split('@')[1] || 'local',
      poolSize: options.maxPoolSize,
      minPoolSize: options.minPoolSize,
      environment: process.env.NODE_ENV
    });
  } catch (error) {
    logger.error('MongoDB connection error', {
      error: error.message,
      stack: error.stack
    });
    monitoring.trackError('database', error);

    // Retry connection
    scheduleReconnect();
  }
};

// Graceful shutdown
const disconnectDB = async () => {
  try {
    isShuttingDown = true;
    clearReconnectTimeout();
    stopHealthCheck();
    await mongoose.connection.close();
    isConnected = false;
    logger.info('MongoDB connection closed');
  } catch (error) {
    logger.error('Error closing MongoDB connection', {
      error: error.message
    });
  }
};

// Helper to get connection status with details
const getConnectionStatus = () => {
  return {
    isConnected,
    metrics: { ...connectionMetrics },
    lastReconnectAttempt: connectionMetrics.lastReconnectAttempt,
    reconnectAttempts,
    healthStatus: {
      lastCheck: connectionMetrics.lastHealthCheck,
      recentErrors: connectionMetrics.errors.slice(-5) // Last 5 errors
    }
  };
};

module.exports = {
  connectDB,
  disconnectDB,
  isConnected: () => isConnected,
  getConnectionStatus,
  checkDatabaseHealth,
  ensureIdempotencyIndexes,
  verifyIdempotencyIndexesAvailability,
  // Export connection events for external monitoring
  events: {
    HEALTH_CHECK_INTERVAL,
    MAX_RECONNECT_ATTEMPTS
  }
};
