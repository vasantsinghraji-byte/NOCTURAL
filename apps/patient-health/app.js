/**
 * Patient-health Express app (restructure Phase 3 — DEV/VALIDATION ONLY).
 *
 * NOT a production deployment target. Exists to prove the copied
 * patient-health code boots and serves in isolation. It reuses the
 * monolith's security middleware stack and mirrors app.js ordering —
 * it does not invent a new security posture. Root middleware that is
 * not (yet) exported from @nocturnal/shared is required directly from
 * its original location (approved app-local wiring).
 */

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const { logger } = require('@nocturnal/shared');

// Reused monolith security stack (same modules the root app.js uses)
const {
  globalRateLimiter,
  apiRateLimiter,
  ddosProtection
} = require('../../middleware/rateLimitEnhanced');
const {
  securityHeaders,
  corsConfig,
  detectSuspiciousRequests,
  fingerprintRequest,
  preventParameterPollution,
  enforceHTTPS
} = require('../../middleware/security');
const { redirectToLatestVersion } = require('../../middleware/apiVersion');
const errorHandler = require('../../middleware/errorHandler');
const requestId = require('../../middleware/requestId');
const { MAX_CONTENT_LENGTH } = require('../../config/requestLimits');
const { sanitizationMiddleware } = require('../../utils/sanitization');

const v1Routes = require('./routes');

const app = express();
app.set('case sensitive routing', true);

if (process.env.TRUST_PROXY === 'false') {
  app.set('trust proxy', false);
} else {
  app.set('trust proxy', 1);
}

const isTest = process.env.NODE_ENV === 'test';
const shouldApplyRateLimits = !isTest && process.env.RATE_LIMIT_ENABLED !== 'false';
const isHealthCheckPath = (req) => {
  const requestPath = (req.originalUrl || req.path || '').split('?')[0];
  return requestPath === '/api/v1/health' || requestPath === '/api/health';
};

// Ordering below mirrors the monolith's app.js.
app.use(requestId);

const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS) || 30000;
app.use((req, res, next) => {
  req.setTimeout(REQUEST_TIMEOUT_MS, () => {
    if (!res.headersSent) {
      logger.warn('Request timed out', { method: req.method, path: req.path, ip: req.ip });
      res.status(408).json({ success: false, message: 'Request timed out' });
    }
  });
  next();
});

const corsOptions = corsConfig();
const applyApiCors = (req, res, next) => {
  if (isHealthCheckPath(req)) {
    return next();
  }
  return cors(corsOptions)(req, res, next);
};
app.use(/^\/api(?:\/|$)/i, applyApiCors);
app.options(/^\/api(?:\/|$).*/i, applyApiCors);

if (!isTest) {
  app.use(enforceHTTPS);
}

app.use(securityHeaders());

if (!isTest) {
  app.use(ddosProtection);
  app.use(fingerprintRequest);
  app.use(detectSuspiciousRequests);
}

app.use(preventParameterPollution);

if (shouldApplyRateLimits) {
  app.use(globalRateLimiter);
  app.use('/api/', apiRateLimiter);
}

app.use((req, res, next) => {
  const contentLength = parseInt(req.headers['content-length'], 10);
  if (contentLength && contentLength > MAX_CONTENT_LENGTH) {
    return res.status(413).json({ success: false, message: 'Request entity too large' });
  }
  next();
});

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

app.use(sanitizationMiddleware());

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

// Serve this app's copied patient frontend (dev convenience only)
app.use(express.static(path.resolve(__dirname, 'client/public')));

app.use(redirectToLatestVersion);
app.use('/api/v1', v1Routes);

app.use(errorHandler);

module.exports = app;
