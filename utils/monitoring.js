/**
 * Application Monitoring Utility
 *
 * Provides error tracking, alerting, and integration with Sentry.
 * Automatically tracks error counts and triggers alerts when thresholds are exceeded.
 *
 * @module utils/monitoring
 *
 * Usage:
 *   const monitoring = require('./utils/monitoring');
 *   monitoring.trackError('authentication', error, { userId: '123' });
 *   const stats = monitoring.getStats();
 *
 * Configuration:
 *   Set SENTRY_DSN environment variable to enable Sentry integration
 */

const logger = require('./logger');

// Sentry Integration (optional - only if SENTRY_DSN is configured)
let Sentry = null;
if (process.env.SENTRY_DSN) {
  try {
    Sentry = require('@sentry/node');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      beforeSend(event) {
        // Filter out sensitive data
        if (event.request && event.request.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
        }
        return event;
      }
    });
    console.log('✅ Sentry monitoring initialized');
  } catch (e) {
    console.log('ℹ️  Sentry not installed - error tracking disabled');
  }
}

// Track error counts for monitoring
const errorCounts = {
  authentication: 0,
  validation: 0,
  database: 0,
  fileUpload: 0,
  general: 0
};

// Alert thresholds for different error types
const ERROR_THRESHOLDS = {
  authentication: 10, // Alert after 10 auth errors in window
  validation: 50,    // Alert after 50 validation errors
  database: 5,       // Alert after 5 database errors
  fileUpload: 10,    // Alert after 10 upload errors
  general: 20        // Alert after 20 general errors
};

// Reset window (e.g., every hour)
const RESET_INTERVAL = 60 * 60 * 1000; // 1 hour

// Reset error counts periodically
setInterval(() => {
  Object.keys(errorCounts).forEach(key => {
    errorCounts[key] = 0;
  });
}, RESET_INTERVAL);

const monitoring = {
  // Track an error and potentially trigger alert
  trackError: (type, error, context = {}) => {
    errorCounts[type] = (errorCounts[type] || 0) + 1;

    // Log the error
    logger.error(`Error tracked: ${type}`, {
      error: error.message,
      stack: error.stack,
      count: errorCounts[type],
      ...context
    });

    // Send to Sentry if configured
    if (Sentry) {
      Sentry.withScope(scope => {
        scope.setTag('error_type', type);
        scope.setExtra('context', context);
        scope.setExtra('count', errorCounts[type]);
        Sentry.captureException(error);
      });
    }

    // Check if we've hit the threshold
    if (errorCounts[type] >= ERROR_THRESHOLDS[type]) {
      monitoring.triggerAlert(type, errorCounts[type], context);
    }
  },

  // Trigger an alert (implement your alert mechanism here)
  triggerAlert: (type, count, context) => {
    logger.error('Error threshold exceeded', {
      type,
      count,
      threshold: ERROR_THRESHOLDS[type],
      ...context
    });

    // Send alert to Sentry as critical
    if (Sentry) {
      Sentry.captureMessage(`Alert: ${type} errors exceeded threshold (${count}/${ERROR_THRESHOLDS[type]})`, 'fatal');
    }
  },

  // Get current error statistics
  getStats: () => {
    return {
      errorCounts: { ...errorCounts },
      thresholds: { ...ERROR_THRESHOLDS }
    };
  },

  // Reset counters for a specific type
  resetCounters: (type) => {
    if (type) {
      errorCounts[type] = 0;
    } else {
      Object.keys(errorCounts).forEach(key => {
        errorCounts[key] = 0;
      });
    }
  }
};

module.exports = monitoring;