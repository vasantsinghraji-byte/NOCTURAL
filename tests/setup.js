/**
 * Jest Global Setup Configuration
 * Sets up test environment, database connections, and global utilities
 */

// Set test environment
process.env.NODE_ENV = 'test';
process.env.PORT = 5001; // Different port for tests

// Test database configuration (no auth for test DB)
process.env.MONGODB_URI = 'mongodb://localhost:27017/nocturnal_test';

// Disable authentication for tests (or use test credentials)
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-not-for-production';
process.env.JWT_EXPIRE = '1h';
process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters!';

// Disable rate limiting in tests
process.env.RATE_LIMIT_ENABLED = 'false';

// Disable external services
process.env.AWS_S3_ENABLED = 'false';
process.env.RAZORPAY_ENABLED = 'false';

// Set longer timeout for integration tests
jest.setTimeout(30000);

// Suppress console logs during tests (optional - uncomment to enable)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };

// Global test utilities
global.testUtils = {
  // Wait utility
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  // Random data generators
  randomEmail: () => `test${Date.now()}${Math.random().toString(36).substring(7)}@test.com`,
  randomPhone: () => `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
  randomString: (length = 10) => Math.random().toString(36).substring(2, length + 2),

  // Date helpers
  futureDate: (days = 7) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  },
  pastDate: (days = 7) => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
  },

  productionFixtureEnv: (overrides = {}) => ({
    NODE_ENV: 'production',
    PORT: '5000',
    MONGODB_URI: 'mongodb://fixtureUser:fixturePassword@127.0.0.1:27017/nocturnal_fixture?authSource=admin',
    JWT_SECRET: 'prod-smoke-jwt-secret-value-with-64-plus-characters-for-validation-pass-001',
    ENCRYPTION_KEY: '0123456789abcdeffedcba98765432100123456789abcdeffedcba9876543210',
    ALLOWED_ORIGINS: 'https://127.0.0.1',
    AWS_S3_ENABLED: 'false',
    RAZORPAY_ENABLED: 'false',
    RATE_LIMIT_ENABLED: 'false',
    ...overrides
  })
};
