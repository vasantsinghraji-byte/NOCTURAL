/**
 * Patient Booking Service - Main Server
 * Microservice for handling patient bookings and appointments
 */

const express = require('express');
const config = require('./config');
const database = require('./config/database');

// Import shared utilities from @nocturnal/shared
const { createLogger } = require('@nocturnal/shared');
const {
  createSecurityMiddleware,
  createRateLimiterFactory
} = require('@nocturnal/shared');

// Initialize logger
const logger = createLogger({
  serviceName: config.service.name,
  logsDir: config.logging.dir
});

// Initialize Express app
const app = express();

async function startServer() {
  try {
    // Connect to database
    logger.info('Connecting to MongoDB...');
    await database.connect(logger);

    // ============================================================================
    // MIDDLEWARE SETUP
    // ============================================================================

    // Security middleware from shared package
    const { securityHeaders, corsConfig } = createSecurityMiddleware({
      allowedOrigins: config.cors.origins
    });

    app.use(securityHeaders());
    app.use(require('cors')(corsConfig()));

    // Rate limiting from shared package
    const rateLimiters = createRateLimiterFactory(config.redis.url);
    app.use(rateLimiters.global);

    // Body parsing middleware
    app.use(express.json({ limit: '10kb' }));
    app.use(express.urlencoded({ extended: true, limit: '10kb' }));

    // Request logging middleware
    app.use((req, res, next) => {
      req.startTime = Date.now();
      logger.logRequest(req, res, 0);
      next();
    });

    // ============================================================================
    // ROUTES
    // ============================================================================

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        service: config.service.name,
        version: config.service.version,
        timestamp: new Date().toISOString(),
        database: database.isConnected() ? 'connected' : 'disconnected'
      });
    });

    // API routes
    app.use('/api/patients', require('./api/routes/patients'));
    app.use('/api/bookings', require('./api/routes/bookings'));
    app.use('/api/services', require('./api/routes/services'));

    // Root endpoint
    app.get('/', (req, res) => {
      res.json({
        service: config.service.name,
        version: config.service.version,
        status: 'running',
        endpoints: {
          health: '/health',
          patients: {
            register: 'POST /api/patients/register',
            login: 'POST /api/patients/login',
            profile: 'GET /api/patients/profile'
          },
          bookings: {
            create: 'POST /api/bookings',
            list: 'GET /api/bookings',
            upcoming: 'GET /api/bookings/upcoming',
            history: 'GET /api/bookings/history'
          },
          services: {
            list: 'GET /api/services',
            featured: 'GET /api/services/featured',
            popular: 'GET /api/services/popular',
            search: 'GET /api/services/search?q=keyword'
          }
        }
      });
    });

    // 404 handler
    app.use((req, res) => {
      res.status(404).json({
        success: false,
        message: 'Endpoint not found'
      });
    });

    // Error handler
    app.use((err, req, res, next) => {
      logger.error('Unhandled error', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method
      });

      res.status(err.status || 500).json({
        success: false,
        message: config.service.env === 'production'
          ? 'Internal server error'
          : err.message,
        ...(config.service.env === 'development' && { stack: err.stack })
      });
    });

    // ============================================================================
    // START SERVER
    // ============================================================================

    const PORT = config.service.port;

    app.listen(PORT, () => {
      logger.info('Patient Booking Service Started', {
        port: PORT,
        environment: config.service.env,
        nodeVersion: process.version,
        pid: process.pid
      });
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received. Starting graceful shutdown...');
      await database.disconnect(logger);
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received. Starting graceful shutdown...');
      await database.disconnect(logger);
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to start Patient Booking Service', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Start the server
startServer();

module.exports = app;
