/**
 * Jest Configuration for Nocturnal Platform
 * Comprehensive testing setup for unit, integration, and E2E tests
 */

module.exports = {
  // Test environment
  testEnvironment: 'node',

  // Setup files
  setupFiles: ['<rootDir>/tests/setup.js'],

  // Coverage configuration
  collectCoverage: false, // Enable with --coverage flag
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],

  // Coverage thresholds (target: 80%)
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },

  // Files to collect coverage from
  collectCoverageFrom: [
    'models/**/*.js',
    'controllers/**/*.js',
    'middleware/**/*.js',
    'utils/**/*.js',
    'services/**/*.js',
    'routes/**/*.js',
    '!**/node_modules/**',
    '!**/coverage/**',
    '!**/tests/**',
    '!**/client/**'
  ],

  // Test match patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js'
  ],

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/client/',
    '/coverage/',
    '/dist/'
  ],

  // Module paths
  moduleDirectories: ['node_modules', '<rootDir>'],

  // Verbose output
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  // Force exit after tests complete
  forceExit: true,

  // Detect open handles
  detectOpenHandles: true,

  // Max workers (parallel test execution)
  maxWorkers: '50%',

  // Transform (if using babel/typescript)
  transform: {}

  // Global setup/teardown
  // globalSetup: '<rootDir>/tests/global-setup.js',
  // globalTeardown: '<rootDir>/tests/global-teardown.js',
};
