const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
// const mongoSanitize = require('express-mongo-sanitize'); // DISABLED - incompatible with Node 22
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const mime = require('mime-types');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const logger = require('./utils/logger');
const metricsRouter = require('./routes/admin/metrics');
const { connectDB, disconnectDB } = require('./config/database');
const { cleanup: cleanupRateLimits } = require('./config/rateLimit');

// Enhanced security imports
const {
  globalRateLimiter,
  authRateLimiter,
  passwordResetRateLimiter,
  apiRateLimiter,
  uploadRateLimiter,
  searchRateLimiter,
  paymentRateLimiter,
  strictRateLimiter,
  ddosProtection
} = require('./middleware/rateLimitEnhanced');

const {
  securityHeaders,
  corsConfig,
  detectSuspiciousRequests,
  fingerprintRequest,
  preventParameterPollution,
  enforceHTTPS
} = require('./middleware/security');

// Clear any inherited MONGODB_URI from parent process (VSCode/terminal)
// This ensures .env files take precedence over inherited environment
if (process.env.MONGODB_URI && process.env.MONGODB_URI.includes('@')) {
  console.log('⚠️  Clearing inherited MONGODB_URI (will use .env value instead)');
  delete process.env.MONGODB_URI;
}

// Load environment variables
dotenv.config();

// Validate environment variables at startup (fail fast if misconfigured)
const { validateEnvironment } = require('./config/validateEnv');
try {
  validateEnvironment({ throwOnError: true });
} catch (error) {
  console.error('\n❌ STARTUP FAILED - Environment validation error:\n');
  console.error(error.message);
  console.error('\n💡 Fix the above issues and restart the server.\n');
  process.exit(1);
}

// Import API versioning
const { redirectToLatestVersion, getVersions } = require('./middleware/apiVersion');
const v1Routes = require('./routes/v1');

// Import error handler
const errorHandler = require('./middleware/errorHandler');

const app = express();

// ============================================================================
// ENHANCED SECURITY MIDDLEWARE - Enterprise-Grade Protection
// ============================================================================

// 0. Enforce HTTPS in production (redirect HTTP to HTTPS)
app.use(enforceHTTPS);

// 1. Enhanced Security Headers (CSP, HSTS, X-Frame-Options, etc.)
app.use(securityHeaders());

// 2. Enhanced CORS with origin whitelist
app.use(cors(corsConfig()));

// 3. DDoS Protection - IP-based request tracking with automatic blacklisting
app.use(ddosProtection);

// 4. Request fingerprinting for threat intelligence
app.use(fingerprintRequest);

// 5. Detect and block suspicious requests (SQL injection, XSS, etc.)
app.use(detectSuspiciousRequests);

// 6. Parameter pollution prevention
app.use(preventParameterPollution);

// 7. Global rate limiting (applies to all routes)
app.use(globalRateLimiter);

// Database connection with comprehensive options (pool, read/write preferences, retries)
// Connection monitoring and reconnection handled in config/database.js
connectDB();

// ============================================================================
// ENHANCED RATE LIMITING - Endpoint-Specific Protection
// ============================================================================

// API routes - General rate limiting
app.use('/api/', apiRateLimiter);

// Auth routes - Strict limits to prevent brute force attacks
app.use('/api/v1/auth/login', authRateLimiter);
app.use('/api/v1/auth/register', authRateLimiter);
app.use('/api/v1/auth/forgot-password', passwordResetRateLimiter);
app.use('/api/v1/auth/reset-password', passwordResetRateLimiter);

// Upload endpoints - Prevent abuse
app.use('/api/v1/uploads', uploadRateLimiter);
app.use('/api/v1/users/upload-document', uploadRateLimiter);

// Search endpoints - Prevent scraping
app.use('/api/v1/duties/search', searchRateLimiter);
app.use('/api/v1/users/search', searchRateLimiter);

// Payment endpoints - Critical protection
app.use('/api/v1/payments', paymentRateLimiter);
app.use('/api/v1/earnings', paymentRateLimiter);

// Admin routes - Strict rate limiting
app.use('/api/v1/admin', strictRateLimiter);

// Sensitive operations - Extra protection
app.use('/api/v1/users/profile', strictRateLimiter);
app.use('/api/v1/users/password', strictRateLimiter);
app.use('/api/v1/security', strictRateLimiter);

// Body parser with size limits
app.use(express.json({ limit: '10kb' })); // Limit payload size
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Enhanced NoSQL injection sanitization
// Using custom implementation (express-mongo-sanitize incompatible with Node 22+)
// Location: utils/sanitization.js
// Handles: MongoDB operators, dot notation, null bytes, prototype pollution,
//          deep recursion attacks, and all OWASP NoSQL injection vectors
const { sanitizationMiddleware, detectMongoOperators } = require('./utils/sanitization');

// Apply sanitization to all requests
app.use(sanitizationMiddleware());

// Optional: Log detected injection attempts (for monitoring/alerting)
app.use((req, res, next) => {
  // Check original unsanitized data for operators (for logging only)
  // Note: This runs AFTER sanitization, so it's safe to check
  const operators = detectMongoOperators(req.body);

  if (operators.length > 0) {
    logger.warn('NoSQL injection attempt detected and blocked', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      operators: operators.map(op => op.operator),
      userAgent: req.get('user-agent')
    });

    // Optional: Track in security monitoring
    if (req.fingerprint) {
      // Security monitoring integration (if available)
    }
  }

  next();
});

// Response compression - reduces bandwidth usage
app.use(compression({
  filter: (req, res) => {
    // Don't compress if client sends x-no-compression header
    if (req.headers['x-no-compression']) {
      return false;
    }
    // Use compression's default filter function
    return compression.filter(req, res);
  },
  level: 6, // Balance between speed and compression ratio (0-9)
  threshold: 1024 // Only compress responses larger than 1KB
}));

// Request tracking middleware for analytics
app.use((req, res, next) => {
    // Start timer for response time tracking
    req.startTime = Date.now();
    
    // Save original end function
    const originalEnd = res.end;
    
    // Override end function to capture response time
    res.end = function() {
        const responseTime = Date.now() - req.startTime;
        req.responseTime = responseTime;
        
        // Record the request in analytics
        metricsRouter.recordRequest(req, res.statusCode === 429);
        
        // Call original end function
        originalEnd.apply(res, arguments);
    };
    
    next();
});

// Serve frontend HTML files only (public assets)
app.use(express.static('client/public'));

// Authenticated file access middleware
const authenticatedFileAccess = require('./middleware/auth').protect;

// Secure file access route with authentication
app.get('/uploads/:type/:filename', authenticatedFileAccess, async (req, res) => {
  try {
    const { type, filename } = req.params;
    
    // Validate file type directory
    const validTypes = ['profile-photos', 'documents'];
    if (!validTypes.includes(type)) {
      return res.status(404).send('Not found');
    }

    // Prevent directory traversal
    const safePath = path.normalize(filename).replace(/^(\.\.(\/|\\|$))+/, '');
    const filePath = path.join(__dirname, 'uploads', type, safePath);

    // Verify file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('File not found');
    }

    // Check user authorization for profile photos
    // More secure: extract user ID from filename pattern (userId_timestamp.ext)
    if (type === 'profile-photos') {
      const fileUserId = filename.split('_')[0];
      const requestUserId = req.user?._id?.toString();

      // Allow access if: user owns the file OR user is admin OR file is public profile photo
      const isOwner = fileUserId === requestUserId;
      const isAdmin = req.user?.role === 'admin';

      if (!isOwner && !isAdmin) {
        logger.warn('Unauthorized file access attempt', {
          requestedFile: filename,
          requestUser: requestUserId,
          fileOwner: fileUserId
        });
        return res.status(403).send('Unauthorized');
      }
    }

    // Stream file with correct content-type
    const contentType = mime.lookup(filePath) || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'inline');
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    logger.error('File access error', { error: error.message, path: req.path });
    res.status(500).send('Error accessing file');
  }
});

// API version information endpoint
app.get('/api/versions', getVersions);

// Root API info
app.get('/api', (req, res) => {
  res.json({
    name: 'Nocturnal API',
    version: 'v1',
    documentation: '/api/versions',
    endpoints: {
      v1: '/api/v1',
      versions: '/api/versions'
    }
  });
});

// API Documentation - Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Nocturnal API Documentation'
}));

// Redirect unversioned requests to latest version (optional - for backward compatibility)
// Comment out this line if you want to enforce explicit versioning
app.use(redirectToLatestVersion);

// Mount versioned routes
app.use('/api/v1', v1Routes);

// Legacy health check (for backward compatibility)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Server is running',
    apiVersion: 'unversioned (legacy)',
    recommendation: 'Use /api/v1/health for versioned endpoint'
  });
});

// Error handling (must be last)
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  logger.info('Server Started Successfully', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    processId: process.pid
  });
  console.log(`🚀 Server running on port ${PORT} - Logs: ./logs/`);
  console.log(`📊 Process ID: ${process.pid}`);

  // Signal PM2 that the app is ready (for cluster mode zero-downtime reloads)
  if (process.send) {
    process.send('ready');
    console.log('✅ PM2 ready signal sent');
  }
});

// Graceful shutdown handling
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  logger.info(`${signal} received - starting graceful shutdown`);

  // Stop accepting new connections
  server.close(async () => {
    console.log('✅ HTTP server closed');
    logger.info('HTTP server closed');

    try {
      // Cleanup rate limit intervals
      cleanupRateLimits();
      console.log('✅ Rate limit cleanup completed');

      // Close database connection
      await disconnectDB();
      console.log('✅ Database connections closed');
      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      logger.error('Error during graceful shutdown', { error: error.message });
      process.exit(1);
    }
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('⚠️ Forced shutdown - timeout exceeded');
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

// Listen for shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// PM2 Graceful Reload Support
process.on('message', (msg) => {
  if (msg === 'shutdown') {
    console.log('📬 Received shutdown message from PM2');
    gracefulShutdown('PM2_SHUTDOWN');
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack
  });
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  logger.error('Unhandled Promise Rejection', {
    reason: reason instanceof Error ? reason.message : reason,
    stack: reason instanceof Error ? reason.stack : undefined
  });
  gracefulShutdown('UNHANDLED_REJECTION');
});