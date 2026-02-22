/**
 * Environment Configuration System
 *
 * Manages configuration across development, staging, and production environments.
 * Uses single .env file with NODE_ENV to control environment-specific behavior.
 *
 * Configuration Strategy:
 * - Single .env file contains all secrets and configuration
 * - NODE_ENV variable determines which config overrides apply
 * - Environment-specific settings are defined in code below
 * - No need for multiple .env.{environment} files
 *
 * Usage:
 *   Set NODE_ENV in your .env file or system environment:
 *   - development (default): Debug mode, relaxed rate limits
 *   - staging: Production-like with detailed errors
 *   - production: Strict security, minimal logging
 *   - test: Isolated test database, no rate limits
 */

const path = require('path');
const dotenv = require('dotenv');

// Load single .env file (contains all secrets)
dotenv.config();

// Determine current environment from loaded .env or system
const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Base configuration shared across all environments
 */
const baseConfig = {
    env: NODE_ENV,
    port: parseInt(process.env.PORT) || 5000,

    // Application
    app: {
        name: 'Nocturnal Healthcare Platform',
        version: '1.0.0',
        url: process.env.APP_URL || 'http://localhost:5000'
    },

    // Database
    database: {
        uri: process.env.MONGODB_URI,
        options: {
            maxPoolSize: 10,
            minPoolSize: 2,
            socketTimeoutMS: 45000,
            serverSelectionTimeoutMS: 5000,
            family: 4 // Use IPv4, skip trying IPv6
        }
    },

    // JWT
    jwt: {
        secret: process.env.JWT_SECRET,
        expiresIn: process.env.JWT_EXPIRE || '7d',
        refreshExpiresIn: '30d'
    },

    // Security
    security: {
        encryptionKey: process.env.ENCRYPTION_KEY,
        saltRounds: 10,
        maxLoginAttempts: 5,
        lockoutDuration: 15 * 60 * 1000 // 15 minutes
    },

    // CORS - localhost fallback only in development/test
    cors: {
        origin: process.env.ALLOWED_ORIGINS
            ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
            : (NODE_ENV === 'production' || NODE_ENV === 'staging')
                ? []
                : ['http://localhost:3000'],
        credentials: true
    },

    // File Upload
    upload: {
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB
        allowedTypes: ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'],
        uploadDir: path.join(process.cwd(), 'uploads')
    },

    // Pagination
    pagination: {
        defaultLimit: 20,
        maxLimit: 100
    },

    // Rate Limiting
    rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // requests per windowMs
        skipSuccessfulRequests: false
    },

    // Logging
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        format: 'json',
        directory: path.join(process.cwd(), 'logs')
    },

    // Firebase
    firebase: {
        enabled: process.env.FIREBASE_AUTH_ENABLED === 'true',
        credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS
    }
};

/**
 * Development environment configuration
 */
const developmentConfig = {
    ...baseConfig,

    database: {
        ...baseConfig.database,
        options: {
            ...baseConfig.database.options,
            maxPoolSize: 5,
            debug: true
        }
    },

    logging: {
        ...baseConfig.logging,
        level: 'debug',
        console: true,
        file: true
    },

    rateLimit: {
        ...baseConfig.rateLimit,
        max: 1000, // More lenient in development
        skipSuccessfulRequests: true
    },

    security: {
        ...baseConfig.security,
        strictSSL: false
    },

    // Development-specific features
    debug: true,
    hotReload: true,
    detailedErrors: true
};

/**
 * Staging environment configuration
 */
const stagingConfig = {
    ...baseConfig,

    database: {
        ...baseConfig.database,
        options: {
            ...baseConfig.database.options,
            maxPoolSize: 10
        }
    },

    logging: {
        ...baseConfig.logging,
        level: 'info',
        console: true,
        file: true
    },

    rateLimit: {
        ...baseConfig.rateLimit,
        max: 200
    },

    security: {
        ...baseConfig.security,
        strictSSL: true
    },

    // Staging-specific features
    debug: false,
    detailedErrors: true, // Still show errors for testing
    monitoring: true
};

/**
 * Production environment configuration
 */
const productionConfig = {
    ...baseConfig,

    database: {
        ...baseConfig.database,
        options: {
            ...baseConfig.database.options,
            maxPoolSize: 20,
            minPoolSize: 5,
            replicaSet: process.env.MONGODB_REPLICA_SET
        }
    },

    logging: {
        ...baseConfig.logging,
        level: 'error',
        console: false,
        file: true,
        sentry: process.env.SENTRY_DSN
    },

    rateLimit: {
        ...baseConfig.rateLimit,
        max: 100,
        skipSuccessfulRequests: false
    },

    security: {
        ...baseConfig.security,
        strictSSL: true,
        helmet: true,
        hsts: true
    },

    // Production-specific features
    debug: false,
    detailedErrors: false,
    monitoring: true,
    caching: true,
    compression: true,
    clustering: process.env.CLUSTER_MODE === 'true'
};

/**
 * Test environment configuration
 */
const testConfig = {
    ...baseConfig,

    database: {
        ...baseConfig.database,
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/nocturnal_test',
        options: {
            ...baseConfig.database.options,
            maxPoolSize: 2
        }
    },

    logging: {
        ...baseConfig.logging,
        level: 'error',
        console: false,
        file: false
    },

    rateLimit: {
        ...baseConfig.rateLimit,
        max: 10000, // No rate limiting in tests
        skip: () => true
    },

    jwt: {
        ...baseConfig.jwt,
        expiresIn: '1h' // Shorter expiry for tests
    },

    // Test-specific features
    debug: false,
    detailedErrors: true,
    mockExternalServices: true
};

/**
 * Get configuration for current environment
 */
const getConfig = () => {
    switch (NODE_ENV) {
        case 'production':
            return productionConfig;
        case 'staging':
            return stagingConfig;
        case 'test':
            return testConfig;
        case 'development':
        default:
            return developmentConfig;
    }
};

/**
 * Validate required configuration
 */
const validateConfig = (config) => {
    const required = [
        'database.uri',
        'jwt.secret',
        'security.encryptionKey'
    ];

    const missing = [];

    required.forEach(key => {
        const keys = key.split('.');
        let value = config;

        for (const k of keys) {
            value = value?.[k];
        }

        if (!value) {
            missing.push(key);
        }
    });

    // CORS origins are required in production/staging
    if ((NODE_ENV === 'production' || NODE_ENV === 'staging') && !process.env.ALLOWED_ORIGINS) {
        missing.push('cors.origin (ALLOWED_ORIGINS)');
    }

    if (missing.length > 0) {
        throw new Error(
            `Missing required configuration: ${missing.join(', ')}\n` +
            `Environment: ${NODE_ENV}\n` +
            `Please check your .env file or environment variables.`
        );
    }

    return true;
};

// Get current configuration
const config = getConfig();

// Validate configuration
try {
    validateConfig(config);
} catch (error) {
    console.error('Configuration Error:', error.message);
    process.exit(1);
}

// Export configuration
module.exports = config;

// Also export helper functions
module.exports.isDevelopment = () => NODE_ENV === 'development';
module.exports.isProduction = () => NODE_ENV === 'production';
module.exports.isStaging = () => NODE_ENV === 'staging';
module.exports.isTest = () => NODE_ENV === 'test';
