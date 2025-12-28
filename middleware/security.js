/**
 * Enhanced Security Middleware
 * Comprehensive security headers, CORS, CSP, and protection measures
 */

const helmet = require('helmet');
const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Generate a cryptographically secure nonce for CSP
 * @returns {string} Base64-encoded nonce
 */
const generateNonce = () => {
  return crypto.randomBytes(16).toString('base64');
};

/**
 * Security Headers Configuration
 * Implements OWASP security best practices
 */
const securityHeaders = () => {
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Build scriptSrc dynamically based on environment
  const scriptSrc = [
    "'self'",
    'https://cdn.jsdelivr.net',
    'https://unpkg.com',
    'https://www.google.com',
    'https://www.gstatic.com',
    'https://checkout.razorpay.com',  // Razorpay checkout script
    'https://api.razorpay.com'
  ];

  // Only allow unsafe-eval in development (for debugging tools, hot reload, etc.)
  if (isDevelopment) {
    scriptSrc.push("'unsafe-eval'");
    scriptSrc.push("'unsafe-inline'"); // Only in dev - production should use nonces
  }
  // Note: For production inline scripts, use nonces via res.locals.cspNonce
  // Add nonce dynamically via the nonceMiddleware below

  return helmet({
    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc,
        scriptSrcAttr: isDevelopment ? ["'unsafe-inline'"] : ["'none'"], // Disable inline handlers in production
        styleSrc: [
          "'self'",
          "'unsafe-inline'", // Required for CSS frameworks - lower XSS risk than script unsafe-inline
          'https://fonts.googleapis.com',
          'https://cdn.jsdelivr.net',
          'https://cdnjs.cloudflare.com'
        ],
        fontSrc: [
          "'self'",
          'https://fonts.gstatic.com',
          'https://cdn.jsdelivr.net',
          'https://cdnjs.cloudflare.com'
        ],
        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          'https:',
          process.env.AWS_S3_BUCKET ? `https://${process.env.AWS_S3_BUCKET}.s3.amazonaws.com` : ''
        ].filter(Boolean),
        connectSrc: [
          "'self'",
          'https://api.razorpay.com',
          'https://checkout.razorpay.com',
          process.env.NODE_ENV === 'development' ? 'ws://localhost:*' : '',
          process.env.NODE_ENV === 'development' ? 'http://localhost:*' : ''
        ].filter(Boolean),
        frameSrc: [
          "'self'",
          'https://api.razorpay.com'
        ],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"], // Prevent clickjacking
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
      }
    },

    // Strict Transport Security (HTTPS only)
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    },

    // X-Frame-Options: DENY (prevent clickjacking)
    frameguard: {
      action: 'deny'
    },

    // X-Content-Type-Options: nosniff (prevent MIME sniffing)
    noSniff: true,

    // X-XSS-Protection: 1; mode=block
    xssFilter: true,

    // Referrer-Policy: strict-origin-when-cross-origin
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin'
    },

    // X-DNS-Prefetch-Control: off
    dnsPrefetchControl: {
      allow: false
    },

    // X-Download-Options: noopen (IE8+)
    ieNoOpen: true,

    // X-Permitted-Cross-Domain-Policies: none
    permittedCrossDomainPolicies: {
      permittedPolicies: 'none'
    }
  });
};

/**
 * Enhanced CORS Configuration
 * Strict origin validation with whitelist
 */
const corsConfig = () => {
  // Parse allowed origins from environment
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

  // Add default origins for development
  if (process.env.NODE_ENV === 'development') {
    allowedOrigins.push(
      'http://localhost:3000',
      'http://localhost:5000',
      'http://localhost:5500',
      'http://127.0.0.1:5500'
    );
  }

  return {
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) {
        return callback(null, true);
      }

      // Strict origin whitelist check - no bypasses
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn('CORS blocked request from unauthorized origin', {
          origin,
          allowedOrigins: allowedOrigins.length > 0 ? allowedOrigins : 'NONE CONFIGURED'
        });
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true, // Allow cookies
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-API-Key',
      'Accept',
      'Origin'
    ],
    exposedHeaders: [
      'X-Total-Count',
      'X-Page-Count',
      'X-Rate-Limit-Limit',
      'X-Rate-Limit-Remaining',
      'X-Rate-Limit-Reset'
    ],
    maxAge: 86400 // 24 hours preflight cache
  };
};

/**
 * Remove sensitive headers from responses
 */
const removeSensitiveHeaders = (req, res, next) => {
  // Remove server identification
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');

  // Add custom server header (obfuscation)
  res.setHeader('Server', 'Nocturnal');

  next();
};

/**
 * Request fingerprinting for anomaly detection
 */
const fingerprintRequest = (req, res, next) => {
  const fingerprint = {
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent'),
    acceptLanguage: req.get('accept-language'),
    acceptEncoding: req.get('accept-encoding'),
    timestamp: new Date()
  };

  // Attach to request for logging
  req.fingerprint = fingerprint;

  next();
};

/**
 * Detect and block suspicious requests
 */
const detectSuspiciousRequests = (req, res, next) => {
  const suspicious = [];

  // Check for SQL injection patterns
  const sqlPattern = /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/gi;
  const queryString = JSON.stringify(req.query) + JSON.stringify(req.body);

  if (sqlPattern.test(queryString)) {
    suspicious.push('SQL_INJECTION_ATTEMPT');
  }

  // Check for XSS patterns
  const xssPattern = /<script|javascript:|onerror=|onload=/gi;
  if (xssPattern.test(queryString)) {
    suspicious.push('XSS_ATTEMPT');
  }

  // Check for path traversal
  const traversalPattern = /\.\.[\/\\]/;
  if (traversalPattern.test(req.url)) {
    suspicious.push('PATH_TRAVERSAL_ATTEMPT');
  }

  // Check for command injection (only in actual content, not empty objects)
  const cmdPattern = /[;&|`$]/;
  if (queryString.length > 4 && cmdPattern.test(queryString)) {
    // Length > 4 to skip empty {} which is stringified from empty req.body/query
    suspicious.push('COMMAND_INJECTION_ATTEMPT');
  }

  // Log and block if suspicious
  if (suspicious.length > 0) {
    logger.error('Suspicious request detected', {
      ip: req.ip,
      url: req.url,
      method: req.method,
      patterns: suspicious,
      userAgent: req.get('user-agent'),
      fingerprint: req.fingerprint
    });

    return res.status(403).json({
      success: false,
      error: 'Forbidden - Suspicious activity detected'
    });
  }

  next();
};

/**
 * Prevent parameter pollution
 */
const preventParameterPollution = (req, res, next) => {
  // Check for duplicate parameters
  const params = { ...req.query, ...req.body };

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value) && value.length > 10) {
      logger.warn('Parameter pollution detected', {
        ip: req.ip,
        parameter: key,
        count: value.length
      });

      return res.status(400).json({
        success: false,
        error: 'Too many parameter values'
      });
    }
  }

  next();
};

/**
 * Enforce HTTPS in production
 */
const enforceHTTPS = (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
  }

  next();
};

/**
 * Add security-related response headers
 */
const addSecurityHeaders = (req, res, next) => {
  // Feature Policy / Permissions Policy
  res.setHeader('Permissions-Policy', [
    'geolocation=(self)',
    'microphone=()',
    'camera=()',
    'payment=(self)',
    'usb=()',
    'magnetometer=()',
    'gyroscope=()',
    'accelerometer=()'
  ].join(', '));

  // Expect-CT (Certificate Transparency)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Expect-CT', 'max-age=86400, enforce');
  }

  // Cross-Origin Resource Policy
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

  // Cross-Origin Embedder Policy
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

  // Cross-Origin Opener Policy
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

  next();
};

/**
 * Log security events
 */
const logSecurityEvents = (req, res, next) => {
  const startTime = Date.now();

  // Log request
  logger.debug('Incoming request', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - startTime;

    if (res.statusCode >= 400) {
      logger.warn('Request completed with error', {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration,
        ip: req.ip
      });
    }
  });

  next();
};

/**
 * CSP Nonce Middleware
 * Generates a unique nonce per request for inline scripts in production
 * Usage: Add nonce="<%= locals.cspNonce %>" to inline <script> tags
 */
const nonceMiddleware = (req, res, next) => {
  const nonce = generateNonce();
  res.locals.cspNonce = nonce;

  // Make nonce available for CSP header modification if needed
  req.cspNonce = nonce;

  next();
};

module.exports = {
  securityHeaders,
  corsConfig,
  removeSensitiveHeaders,
  fingerprintRequest,
  detectSuspiciousRequests,
  preventParameterPollution,
  enforceHTTPS,
  addSecurityHeaders,
  logSecurityEvents,
  nonceMiddleware,
  generateNonce
};
