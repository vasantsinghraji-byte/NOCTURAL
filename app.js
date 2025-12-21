/**
 * Express Application Configuration
 * Separated from server.js to allow importing in tests without starting the server
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const mime = require('mime-types');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const logger = require('./utils/logger');
const metricsRouter = require('./routes/admin/metrics');

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

// Import API versioning
const { redirectToLatestVersion, getVersions } = require('./middleware/apiVersion');
const v1Routes = require('./routes/v1');

// Import error handler
const errorHandler = require('./middleware/errorHandler');

const app = express();

// ============================================================================
// ENHANCED SECURITY MIDDLEWARE - Enterprise-Grade Protection
// ============================================================================

// Skip heavy middleware in test environment
const isTest = process.env.NODE_ENV === 'test';

// 0. Enforce HTTPS in production (redirect HTTP to HTTPS)
if (!isTest) {
  app.use(enforceHTTPS);
}

// 1. Enhanced Security Headers (CSP, HSTS, X-Frame-Options, etc.)
app.use(securityHeaders());

// 2. Enhanced CORS with origin whitelist
app.use(cors(corsConfig()));

// 3. DDoS Protection - IP-based request tracking with automatic blacklisting
if (!isTest) {
  app.use(ddosProtection);
}

// 4. Request fingerprinting for threat intelligence
if (!isTest) {
  app.use(fingerprintRequest);
}

// 5. Detect and block suspicious requests (SQL injection, XSS, etc.)
if (!isTest) {
  app.use(detectSuspiciousRequests);
}

// 6. Parameter pollution prevention
app.use(preventParameterPollution);

// 7. Global rate limiting (applies to all routes) - skip in tests
if (!isTest) {
  app.use(globalRateLimiter);
}

// ============================================================================
// ENHANCED RATE LIMITING - Endpoint-Specific Protection (skip in tests)
// ============================================================================

if (!isTest) {
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
}

// Body parser with size limits
app.use(express.json({ limit: '10kb' })); // Limit payload size
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Enhanced NoSQL injection sanitization
const { sanitizationMiddleware, detectMongoOperators } = require('./utils/sanitization');

// Apply sanitization to all requests
app.use(sanitizationMiddleware());

// Optional: Log detected injection attempts (for monitoring/alerting)
if (!isTest) {
  app.use((req, res, next) => {
    const operators = detectMongoOperators(req.body);

    if (operators.length > 0) {
      logger.warn('NoSQL injection attempt detected and blocked', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        operators: operators.map(op => op.operator),
        userAgent: req.get('user-agent')
      });
    }

    next();
  });
}

// Response compression - reduces bandwidth usage
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6,
  threshold: 1024
}));

// Request tracking middleware for analytics (skip in tests)
if (!isTest) {
  app.use((req, res, next) => {
    req.startTime = Date.now();

    const originalEnd = res.end;

    res.end = function() {
      const responseTime = Date.now() - req.startTime;
      req.responseTime = responseTime;
      metricsRouter.recordRequest(req, res.statusCode === 429);
      originalEnd.apply(res, arguments);
    };

    next();
  });
}

// Serve frontend HTML files only (public assets)
app.use(express.static('client/public'));

// Authenticated file access middleware
const authenticatedFileAccess = require('./middleware/auth').protect;

// Secure file access route with authentication
app.get('/uploads/:type/:filename', authenticatedFileAccess, async (req, res) => {
  try {
    const { type, filename } = req.params;

    const validTypes = ['profile-photos', 'documents'];
    if (!validTypes.includes(type)) {
      return res.status(404).send('Not found');
    }

    const safePath = path.normalize(filename).replace(/^(\.\.(\/|\\|$))+/, '');
    const filePath = path.join(__dirname, 'uploads', type, safePath);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send('File not found');
    }

    if (type === 'profile-photos') {
      const fileUserId = filename.split('_')[0];
      const requestUserId = req.user?._id?.toString();

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

    const contentType = mime.lookup(filePath) || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'inline');
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    logger.error('File access error', { error: error.message, path: req.path });
    res.status(500).send('Error accessing file');
  }
});

// ============================================================================
// LEGAL DOCUMENTS - Publicly Accessible (Required for Indian Compliance)
// ============================================================================
const legalRoutes = require('./routes/legal');
app.use('/legal', legalRoutes);

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
      versions: '/api/versions',
      legal: '/legal'
    }
  });
});

// API Documentation - Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Nocturnal API Documentation'
}));

// Redirect unversioned requests to latest version
app.use(redirectToLatestVersion);

// Mount versioned routes
app.use('/api/v1', v1Routes);

// Legacy health check
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

module.exports = app;
