/**
 * Environment Variable Validation
 *
 * Validates required environment variables at startup to fail fast
 * if configuration is missing or invalid.
 */

const logger = require('../utils/logger');

/**
 * Required environment variables
 */
const REQUIRED_VARS = {
  // Server Configuration
  PORT: {
    required: false,
    default: 5000,
    type: 'number',
    description: 'Server port'
  },
  NODE_ENV: {
    required: false,
    default: 'development',
    type: 'string',
    enum: ['development', 'staging', 'production', 'test'],
    description: 'Environment name'
  },

  // Database Configuration
  MONGODB_URI: {
    required: true,
    type: 'string',
    validate: (value) => {
      // Must start with mongodb:// or mongodb+srv://
      if (!value.startsWith('mongodb://') && !value.startsWith('mongodb+srv://')) {
        return 'MONGODB_URI must start with mongodb:// or mongodb+srv://';
      }
      // Must include authentication (username:password) - except in dev/test
      if (process.env.NODE_ENV === 'production' && !value.includes('@')) {
        return 'MONGODB_URI must include authentication (username:password@host)';
      }
      return null;
    },
    description: 'MongoDB connection string with authentication'
  },

  // Security Secrets
  JWT_SECRET: {
    required: true,
    type: 'string',
    validate: (value) => {
      if (value.length < 32) {
        return 'JWT_SECRET must be at least 32 characters long';
      }
      // Check if it looks like a secure random string
      if (/^(secret|test|123|abc)/i.test(value)) {
        return 'JWT_SECRET appears to be a weak/default value';
      }
      return null;
    },
    description: 'JWT signing secret (min 32 characters)'
  },

  ENCRYPTION_KEY: {
    required: true,
    type: 'string',
    validate: (value) => {
      if (value.length < 32) {
        return 'ENCRYPTION_KEY must be at least 32 characters long';
      }
      // Should be hexadecimal for crypto compatibility
      if (!/^[a-f0-9]{32,}$/i.test(value)) {
        return 'ENCRYPTION_KEY should be a hexadecimal string (32+ chars)';
      }
      return null;
    },
    description: 'Encryption key for sensitive data (hex, min 32 chars)'
  },

  // Optional but recommended
  ALLOWED_ORIGINS: {
    required: false,
    type: 'string',
    description: 'Comma-separated list of allowed CORS origins',
    example: 'http://localhost:3000,https://example.com'
  },

  // AI Integration (Optional)
  GEMINI_API_KEY: {
    required: false,
    type: 'string',
    description: 'Google Gemini API key for investigation report AI analysis',
    example: 'AIzaSy...'
  }
};

/**
 * Validation errors
 */
class EnvironmentValidationError extends Error {
  constructor(errors) {
    const message = 'Environment validation failed:\n' +
      errors.map(e => `  - ${e}`).join('\n');
    super(message);
    this.name = 'EnvironmentValidationError';
    this.errors = errors;
  }
}

/**
 * Validate a single environment variable
 */
function validateVar(name, config) {
  const value = process.env[name];
  const errors = [];

  // Check if required
  if (config.required && !value) {
    errors.push(`${name} is required but not set. ${config.description}`);
    if (config.example) {
      errors.push(`  Example: ${name}=${config.example}`);
    }
    return errors;
  }

  // If not set and not required, use default
  if (!value && config.default !== undefined) {
    process.env[name] = String(config.default);
    return errors;
  }

  // If not set and not required, skip further validation
  if (!value) {
    return errors;
  }

  // Type validation
  if (config.type === 'number') {
    const num = Number(value);
    if (isNaN(num)) {
      errors.push(`${name} must be a number, got: ${value}`);
    } else {
      process.env[name] = String(num);
    }
  }

  // Enum validation
  if (config.enum && !config.enum.includes(value)) {
    errors.push(`${name} must be one of: ${config.enum.join(', ')}. Got: ${value}`);
  }

  // Custom validation
  if (config.validate) {
    const error = config.validate(value);
    if (error) {
      errors.push(`${name}: ${error}`);
    }
  }

  return errors;
}

/**
 * Validate all environment variables
 */
function validateEnvironment(options = {}) {
  const {
    throwOnError = true,
    logWarnings = true
  } = options;

  const errors = [];
  const warnings = [];

  // Validate each required variable
  Object.entries(REQUIRED_VARS).forEach(([name, config]) => {
    const varErrors = validateVar(name, config);
    errors.push(...varErrors);
  });

  // Check for common mistakes
  if (process.env.NODE_ENV === 'production') {
    // Production-specific checks
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 64) {
      warnings.push('JWT_SECRET should be at least 64 characters in production');
    }

    if (process.env.MONGODB_URI && process.env.MONGODB_URI.includes('localhost')) {
      warnings.push('MONGODB_URI points to localhost in production environment');
    }

    if (!process.env.ALLOWED_ORIGINS) {
      warnings.push('ALLOWED_ORIGINS not set - CORS will use defaults');
    }
  }

  // Check for sensitive data exposure
  if (process.env.JWT_SECRET === process.env.ENCRYPTION_KEY) {
    errors.push('JWT_SECRET and ENCRYPTION_KEY must be different values');
  }

  // Log results
  if (errors.length > 0) {
    logger.error('Environment validation failed', { errors });

    if (throwOnError) {
      throw new EnvironmentValidationError(errors);
    }
  }

  if (warnings.length > 0 && logWarnings) {
    logger.warn('Environment validation warnings', { warnings });
  }

  // Log success
  if (errors.length === 0) {
    const envName = process.env.NODE_ENV || 'development';
    logger.info('Environment validation passed', {
      environment: envName,
      varsChecked: Object.keys(REQUIRED_VARS).length
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Get validation report
 */
function getValidationReport() {
  const report = {
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    variables: {}
  };

  Object.entries(REQUIRED_VARS).forEach(([name, config]) => {
    const value = process.env[name];
    report.variables[name] = {
      set: !!value,
      required: config.required,
      type: config.type,
      description: config.description,
      // Don't include actual value for security
      length: value ? value.length : 0
    };
  });

  return report;
}

/**
 * Express middleware for environment validation
 */
function envValidationMiddleware(req, res, next) {
  // Add validation status to request
  req.envValidation = getValidationReport();
  next();
}

/**
 * Environment validation endpoint (admin only)
 */
function createValidationEndpoint() {
  return (req, res) => {
    // Should be protected with admin auth middleware
    const report = getValidationReport();
    res.json({
      success: true,
      ...report
    });
  };
}

module.exports = {
  validateEnvironment,
  getValidationReport,
  envValidationMiddleware,
  createValidationEndpoint,
  EnvironmentValidationError,
  REQUIRED_VARS
};
