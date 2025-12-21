/**
 * Enhanced Security Middleware
 * Comprehensive security headers, CORS, CSP, and protection measures
 */

const helmet = require('helmet');
const logger = require('../utils/logger');

/**
 * Security Headers Configuration
 * Implements OWASP security best practices
 */
const securityHeaders = () => {
  return helmet({
    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          'https://cdn.jsdelivr.net',
          'https://unpkg.com',
          'https://www.google.com',
          'https://www.gstatic.com'
        ],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
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
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
      }
    },

    // Strict Transport Security (HTTPS only)
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },

    // X-Frame-Options: DENY
    frameguard: {
      action: 'deny'
    },

    // X-Content-Type-Options: nosniff
    noSniff: true,

    // X-XSS-Protection: 1; mode=block
    xssFilter: true,

    // Referrer-Policy
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin'
    },

    // X-DNS-Prefetch-Control: off
    dnsPrefetchControl: {
      allow: false
    },

    ieNoOpen: true,

    permittedCrossDomainPolicies: {
      permittedPolicies: 'none'
    }
  });
};

/**
 * Enhanced CORS Configuration
 */
const corsConfig = () => {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

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
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        logger.warn('CORS blocked request from unauthorized origin', { origin });
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-API-Key',
      'Accept',
      'Origin',
      'X-Service-Token'
    ],
    exposedHeaders: [
      'X-Total-Count',
      'X-Page-Count',
      'X-Rate-Limit-Limit',
      'X-Rate-Limit-Remaining',
      'X-Rate-Limit-Reset'
    ],
    maxAge: 86400
  };
};

/**
 * Remove sensitive headers from responses
 */
const removeSensitiveHeaders = (req, res, next) => {
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');
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

  req.fingerprint = fingerprint;
  next();
};

/**
 * Detect and block suspicious requests
 */
const detectSuspiciousRequests = (req, res, next) => {
  const suspicious = [];

  const sqlPattern = /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/gi;
  const queryString = JSON.stringify(req.query) + JSON.stringify(req.body);

  if (sqlPattern.test(queryString)) {
    suspicious.push('SQL_INJECTION_ATTEMPT');
  }

  const xssPattern = /<script|javascript:|onerror=|onload=/gi;
  if (xssPattern.test(queryString)) {
    suspicious.push('XSS_ATTEMPT');
  }

  const traversalPattern = /\.\.[\/\\]/;
  if (traversalPattern.test(req.url)) {
    suspicious.push('PATH_TRAVERSAL_ATTEMPT');
  }

  const cmdPattern = /[;&|`$]/;
  if (queryString.length > 4 && cmdPattern.test(queryString)) {
    suspicious.push('COMMAND_INJECTION_ATTEMPT');
  }

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

  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Expect-CT', 'max-age=86400, enforce');
  }

  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

  next();
};

/**
 * Log security events
 */
const logSecurityEvents = (req, res, next) => {
  const startTime = Date.now();

  logger.debug('Incoming request', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

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

module.exports = {
  securityHeaders,
  corsConfig,
  removeSensitiveHeaders,
  fingerprintRequest,
  detectSuspiciousRequests,
  preventParameterPollution,
  enforceHTTPS,
  addSecurityHeaders,
  logSecurityEvents
};
