/**
 * Application Monitoring Utility
 *
 * Provides error tracking, alerting, and integration with Sentry.
 * Automatically tracks error counts and triggers alerts when thresholds are exceeded.
 */

/**
 * Create monitoring instance
 * @param {Object} options - Configuration options
 * @param {string} options.serviceName - Name of the microservice
 * @param {string} options.sentryDsn - Sentry DSN (optional)
 * @returns {Object} Monitoring instance
 */
const createMonitoring = (options = {}) => {
  const { serviceName = 'nocturnal-service', sentryDsn } = options;

  // Lazy-load logger to avoid circular dependency
  const getLogger = () => require('./logger').default;

  // Sentry Integration (optional)
  let Sentry = null;
  if (sentryDsn) {
    try {
      Sentry = require('@sentry/node');
      Sentry.init({
        dsn: sentryDsn,
        environment: process.env.NODE_ENV || 'development',
        tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
        beforeSend(event) {
          if (event.request && event.request.headers) {
            delete event.request.headers.authorization;
            delete event.request.headers.cookie;
          }
          return event;
        }
      });
      console.log(`✅ Sentry monitoring initialized for ${serviceName}`);
    } catch (e) {
      console.log('ℹ️  Sentry not installed - error tracking disabled');
    }
  }

  const errorCounts = {
    authentication: 0,
    validation: 0,
    database: 0,
    fileUpload: 0,
    general: 0
  };

  const ERROR_THRESHOLDS = {
    authentication: 10,
    validation: 50,
    database: 5,
    fileUpload: 10,
    general: 20
  };

  const RESET_INTERVAL = 60 * 60 * 1000;

  let resetInterval = null;
  if (process.env.NODE_ENV !== 'test') {
    resetInterval = setInterval(() => {
      Object.keys(errorCounts).forEach(key => {
        errorCounts[key] = 0;
      });
    }, RESET_INTERVAL);
  }

  const monitoring = {
    trackError: (type, error, context = {}) => {
      errorCounts[type] = (errorCounts[type] || 0) + 1;

      const logger = getLogger();
      logger.error(`Error tracked: ${type}`, {
        error: error.message,
        stack: error.stack,
        count: errorCounts[type],
        service: serviceName,
        ...context
      });

      if (Sentry) {
        Sentry.withScope(scope => {
          scope.setTag('error_type', type);
          scope.setTag('service', serviceName);
          scope.setExtra('context', context);
          scope.setExtra('count', errorCounts[type]);
          Sentry.captureException(error);
        });
      }

      if (errorCounts[type] >= ERROR_THRESHOLDS[type]) {
        monitoring.triggerAlert(type, errorCounts[type], context);
      }
    },

    triggerAlert: (type, count, context) => {
      const logger = getLogger();
      logger.error('Error threshold exceeded', {
        type,
        count,
        threshold: ERROR_THRESHOLDS[type],
        service: serviceName,
        ...context
      });

      if (Sentry) {
        Sentry.captureMessage(
          `Alert: ${type} errors exceeded threshold (${count}/${ERROR_THRESHOLDS[type]}) in ${serviceName}`,
          'fatal'
        );
      }
    },

    trackEvent: (eventName, data = {}) => {
      const logger = getLogger();
      logger.info(`Event tracked: ${eventName}`, {
        service: serviceName,
        ...data
      });

      if (Sentry) {
        Sentry.addBreadcrumb({
          category: 'event',
          message: eventName,
          level: 'info',
          data: { service: serviceName, ...data }
        });
      }
    },

    getStats: () => {
      return {
        errorCounts: { ...errorCounts },
        thresholds: { ...ERROR_THRESHOLDS },
        service: serviceName
      };
    },

    resetCounters: (type) => {
      if (type) {
        errorCounts[type] = 0;
      } else {
        Object.keys(errorCounts).forEach(key => {
          errorCounts[key] = 0;
        });
      }
    },

    shutdown: () => {
      if (resetInterval) {
        clearInterval(resetInterval);
      }
    }
  };

  return monitoring;
};

// Export factory function
module.exports = createMonitoring;

// Export default instance for backward compatibility
module.exports.default = createMonitoring({ serviceName: 'nocturnal-shared' });
