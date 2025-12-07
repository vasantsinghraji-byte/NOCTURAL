const logger = require('./logger');

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

    // TODO: Implement your alert mechanism (email, SMS, Slack, etc.)
    // For now, we'll just log it
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