const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Optional: Import transport for centralized logging
let LogstashTransport;
try {
  LogstashTransport = require('winston-logstash/lib/winston-logstash-latest');
} catch (e) {
  // Logstash transport not available
}

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '..', 'logs');
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

// Define separate format for console (more readable)
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
  defaultMeta: { service: 'nocturnal-api' },
  transports: [
    // Error logs
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Combined logs
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Security audit logs
    new winston.transports.File({
      filename: path.join(logsDir, 'security.log'),
      level: 'warn',
      maxsize: 5242880, // 5MB
      maxFiles: 10,
    })
  ],
  // Handle exceptions and rejections
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

// Add Logstash transport if enabled
if (process.env.ENABLE_LOGSTASH === 'true' && LogstashTransport) {
  logger.add(new LogstashTransport({
    port: process.env.LOGSTASH_PORT || 5000,
    host: process.env.LOGSTASH_HOST || 'localhost',
    node_name: process.env.NODE_NAME || 'nocturnal-api',
    max_connect_retries: -1,
    timeout_connect_retries: 5000
  }));
  logger.info('Logstash transport enabled');
}

// Add Loki transport if enabled (via HTTP)
if (process.env.ENABLE_LOKI === 'true') {
  const LokiTransport = require('winston-loki');
  logger.add(new LokiTransport({
    host: process.env.LOKI_HOST || 'http://localhost:3100',
    labels: {
      application: 'nocturnal-api',
      environment: process.env.NODE_ENV || 'development'
    },
    json: true,
    format: winston.format.json(),
    replaceTimestamp: true,
    onConnectionError: (err) => console.error('Loki connection error:', err)
  }));
  logger.info('Loki transport enabled');
}

// Create helper methods for structured logging
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
    action, // 'login', 'register', 'logout', 'token_refresh'
    email,
    success,
    reason,
    timestamp: new Date().toISOString()
  });
};

logger.logSecurity = (event, details) => {
  logger.warn('Security Event', {
    event, // 'rate_limit_exceeded', 'invalid_token', 'unauthorized_access'
    ...details,
    timestamp: new Date().toISOString()
  });
};

logger.logDatabase = (operation, collection, success, error = null) => {
  const level = success ? 'info' : 'error';
  logger.log(level, 'Database Operation', {
    operation, // 'create', 'read', 'update', 'delete'
    collection,
    success,
    error: error ? error.message : null
  });
};

logger.logPayment = (action, paymentId, amount, status, details = {}) => {
  logger.info('Payment Event', {
    action, // 'created', 'completed', 'failed', 'refunded'
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

// Stream for Morgan HTTP logger integration
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  }
};

module.exports = logger;
