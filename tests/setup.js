/**
 * Jest Global Setup Configuration
 * Sets up test environment, database connections, and global utilities
 */

// Set test environment
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.PORT = process.env.PORT || '5001'; // Different port for tests
process.env.DOTENV_CONFIG_QUIET = process.env.DOTENV_CONFIG_QUIET || 'true';
process.env.NOCTURNAL_TEST_LOGS = process.env.NOCTURNAL_TEST_LOGS || '0';

// Test database configuration (no auth for test DB)
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/nocturnal_test';

// Disable authentication for tests (or use test credentials)
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-testing-only-not-for-production';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '1h';
// Field encryption needs exactly 64 hex characters (32 bytes); a SHA-256 hex digest always is.
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
  || require('crypto').createHash('sha256').update('nabz-test-fixture-field-encryption').digest('hex');

// MongoDB driver 7.8 loads Node's `os` with a dynamic import(), which Jest's CommonJS sandbox
// can't run (it needs --experimental-vm-modules). The import fails silently, the handshake goes
// out without its required `driver` block and every connection is refused. Hand the driver `os`
// through its own `runtimeAdapters` option instead. Tests only; real servers load it normally.
{
  const runtimeAdapters = require('mongodb/lib/runtime_adapters');
  const resolve = runtimeAdapters.resolveRuntimeAdapters;
  runtimeAdapters.resolveRuntimeAdapters = (options = {}) =>
    resolve({ ...options, runtimeAdapters: { os: require('os'), ...options.runtimeAdapters } });
}

// A developer .env may send legacy pages to the Nabz website; tests check the pages themselves.
process.env.WEB_REDIRECT_URL = '';

// Disable rate limiting in tests
process.env.RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_ENABLED || 'false';

// Disable external services
process.env.AWS_S3_ENABLED = process.env.AWS_S3_ENABLED || 'false';
process.env.RAZORPAY_ENABLED = process.env.RAZORPAY_ENABLED || 'false';

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
    ENCRYPTION_KEY: require('crypto').createHash('sha256').update('test-fixture-encryption-key').digest('hex'),
    ALLOWED_ORIGINS: 'https://127.0.0.1',
    AWS_S3_ENABLED: 'false',
    RAZORPAY_ENABLED: 'false',
    RATE_LIMIT_ENABLED: 'false',
    ...overrides
  })
};
