const mongoose = require('mongoose');
const logger = require('../utils/logger');
const monitoring = require('../utils/monitoring');

const RECONNECT_INTERVAL = 5000; // 5 seconds
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
const MAX_RECONNECT_ATTEMPTS = 10;

let isConnected = false;
let reconnectAttempts = 0;
let connectionMetrics = {
  totalConnections: 0,
  activeConnections: 0,
  availableConnections: 0,
  lastHealthCheck: null,
  lastReconnectAttempt: null,
  errors: []
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
    updateConnectionMetrics();
    
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

const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is not set');
    }

    // Log connection attempt (mask password)
    const maskedUri = process.env.MONGODB_URI.replace(/:([^@]+)@/, ':****@');
    console.log('🔌 Attempting MongoDB connection to:', maskedUri);

    // Simplified options for MongoDB Atlas compatibility
    const options = {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 30000, // Increased for cloud connections
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000, // Increased for cloud connections
      retryWrites: true,
      retryReads: true
    };

    await mongoose.connect(process.env.MONGODB_URI, options);

    isConnected = true;
    reconnectAttempts = 0; // Reset reconnect attempts on successful connection

    console.log('✅ MongoDB Connected successfully to:', process.env.MONGODB_URI.split('@')[1]?.split('/')[0] || 'database');

    logger.info('MongoDB Connected', {
      host: process.env.MONGODB_URI.split('@')[1] || 'local',
      poolSize: options.maxPoolSize,
      minPoolSize: options.minPoolSize,
      environment: process.env.NODE_ENV
    });

    // Monitor connection events
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

      // If we've exceeded max reconnection attempts, escalate the alert
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
      connectionMetrics.lastReconnectAttempt = new Date();
      
      logger.warn('MongoDB disconnected', {
        reconnectAttempts,
        metrics: connectionMetrics
      });
      
      // Attempt to reconnect with exponential backoff
      const backoffTime = Math.min(RECONNECT_INTERVAL * Math.pow(2, reconnectAttempts), 30000);
      setTimeout(connectDB, backoffTime);
    });

    // Monitor pool events
    mongoose.connection.on('connected', () => {
      isConnected = true;
      updateConnectionMetrics();
      
      logger.info('MongoDB connection established', {
        metrics: connectionMetrics
      });
    });

    mongoose.connection.on('reconnected', () => {
      isConnected = true;
      reconnectAttempts = 0; // Reset reconnect attempts
      updateConnectionMetrics();
      
      logger.info('MongoDB reconnected', {
        metrics: connectionMetrics
      });
    });

    // Set up periodic health checks
    setInterval(async () => {
      const isHealthy = await checkDatabaseHealth();
      if (!isHealthy && isConnected) {
        logger.warn('Database health check failed but connection marked as active', {
          metrics: connectionMetrics
        });
      }
    }, HEALTH_CHECK_INTERVAL);

  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    logger.error('MongoDB connection error', {
      error: error.message,
      stack: error.stack
    });
    monitoring.trackError('database', error);
    
    // Retry connection
    setTimeout(connectDB, RECONNECT_INTERVAL);
  }
};

// Graceful shutdown
const disconnectDB = async () => {
  try {
    await mongoose.connection.close();
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
  // Export connection events for external monitoring
  events: {
    HEALTH_CHECK_INTERVAL,
    MAX_RECONNECT_ATTEMPTS
  }
};