const winston = require('winston');
const path = require('path');
const fs = require('fs');

/**
 * Create Winston logger with configurable transports
 * @param {Object} options - Logger configuration options
 * @param {string} options.serviceName - Name of the microservice
 * @param {string} options.logsDir - Directory for log files
 * @returns {Object} Winston logger instance
 */
const createLogger = (options = {}) => {
  const {
    serviceName = 'nocturnal-service',
    logsDir = path.join(process.cwd(), 'logs')
  } = options;

  // Create logs directory if it doesn't exist
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  // Define log format
  const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  );

  // Console format
  const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      let msg = `${timestamp} [${level}]: ${message}`;
      if (Object.keys(meta).length > 0) {
        msg += ` ${JSON.stringify(meta)}`;
      }
      return msg;
    })
  );

  // Create Winston logger
  const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    defaultMeta: { service: serviceName },
    transports: [
      new winston.transports.File({
        filename: path.join(logsDir, 'error.log'),
        level: 'error',
        maxsize: 5242880,
        maxFiles: 5,
      }),
      new winston.transports.File({
        filename: path.join(logsDir, 'combined.log'),
        maxsize: 5242880,
        maxFiles: 5,
      }),
      new winston.transports.File({
        filename: path.join(logsDir, 'security.log'),
        level: 'warn',
        maxsize: 5242880,
        maxFiles: 10,
      })
    ],
    exceptionHandlers: [
      new winston.transports.File({
        filename: path.join(logsDir, 'exceptions.log')
      })
    ],
    rejectionHandlers: [
      new winston.transports.File({
        filename: path.join(logsDir, 'rejections.log')
      })
    ]
  });

  // Add console transport in development
  if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
      format: consoleFormat,
      handleExceptions: true,
      handleRejections: true
    }));
  }

  // Add Loki transport if enabled
  if (process.env.ENABLE_LOKI === 'true') {
    try {
      const LokiTransport = require('winston-loki');
      logger.add(new LokiTransport({
        host: process.env.LOKI_HOST || 'http://localhost:3100',
        labels: {
          application: serviceName,
          environment: process.env.NODE_ENV || 'development'
        },
        json: true,
        format: winston.format.json(),
        replaceTimestamp: true,
        onConnectionError: (err) => console.error('Loki connection error:', err)
      }));
      logger.info('Loki transport enabled');
    } catch (e) {
      console.log('Loki transport not available');
    }
  }

  // Helper methods
  logger.logRequest = (req, res, responseTime) => {
    logger.info('HTTP Request', {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      responseTime: `${responseTime}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      userId: req.user ? req.user._id : null
    });
  };

  logger.logAuth = (action, email, success, reason = null) => {
    const level = success ? 'info' : 'warn';
    logger.log(level, 'Authentication Event', {
      action,
      email,
      success,
      reason,
      timestamp: new Date().toISOString()
    });
  };

  logger.logSecurity = (event, details) => {
    logger.warn('Security Event', {
      event,
      ...details,
      timestamp: new Date().toISOString()
    });
  };

  logger.logDatabase = (operation, collection, success, error = null) => {
    const level = success ? 'info' : 'error';
    logger.log(level, 'Database Operation', {
      operation,
      collection,
      success,
      error: error ? error.message : null
    });
  };

  logger.logPayment = (action, paymentId, amount, status, details = {}) => {
    logger.info('Payment Event', {
      action,
      paymentId,
      amount,
      status,
      ...details,
      timestamp: new Date().toISOString()
    });
  };

  logger.logFileUpload = (filename, userId, success, error = null) => {
    const level = success ? 'info' : 'error';
    logger.log(level, 'File Upload', {
      filename,
      userId,
      success,
      error: error ? error.message : null
    });
  };

  logger.stream = {
    write: (message) => {
      logger.info(message.trim());
    }
  };

  return logger;
};

// Export factory function
module.exports = createLogger;

// Export default logger for backward compatibility
module.exports.default = createLogger({ serviceName: 'nocturnal-shared' });
