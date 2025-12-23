/**
 * Patient Booking Service Configuration
 * Centralized configuration for the patient booking microservice
 */

require('dotenv').config();

const config = {
  // Service Information
  service: {
    name: 'patient-booking-service',
    version: '1.0.0',
    port: process.env.PORT || 3001,
    env: process.env.NODE_ENV || 'development'
  },

  // Database Configuration
  database: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/nocturnal-patient-booking',
    options: {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    }
  },

  // Redis Configuration
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    password: process.env.REDIS_PASSWORD || null,
    db: 1 // Use database 1 for patient-booking-service
  },

  // RabbitMQ Configuration
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
    exchanges: {
      booking: 'booking.events',
      patient: 'patient.events',
      notification: 'notification.events'
    },
    queues: {
      bookingCreated: 'patient-booking.booking.created',
      bookingCancelled: 'patient-booking.booking.cancelled',
      patientRegistered: 'patient-booking.patient.registered'
    }
  },

  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'your-dev-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    serviceSecret: process.env.SERVICE_SECRET || process.env.JWT_SECRET
  },

  // External Services (for inter-service communication)
  services: {
    mainApi: {
      url: process.env.MAIN_API_URL || 'http://localhost:5000',
      timeout: 5000
    },
    notificationService: {
      url: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3003',
      timeout: 3000
    },
    paymentService: {
      url: process.env.PAYMENT_SERVICE_URL || 'http://localhost:3002',
      timeout: 10000
    }
  },

  // CORS Configuration
  cors: {
    origins: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : ['http://localhost:5500', 'http://127.0.0.1:5500']
  },

  // Rate Limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    dir: process.env.LOG_DIR || './logs'
  },

  // Monitoring
  monitoring: {
    sentryDsn: process.env.SENTRY_DSN || null,
    enableMetrics: process.env.ENABLE_METRICS === 'true'
  },

  // Circuit Breaker Configuration
  circuitBreaker: {
    timeout: 3000, // 3 seconds
    errorThresholdPercentage: 50,
    resetTimeout: 30000 // 30 seconds
  },

  // Pagination Defaults
  pagination: {
    defaultLimit: 20,
    maxLimit: 100
  }
};

// Validation
const requiredEnvVars = ['JWT_SECRET'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0 && config.service.env === 'production') {
  throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}

module.exports = config;
