const ESM_ONLY_DEPS = ['htmlparser2', 'domhandler', 'domutils', 'domelementtype', 'entities', 'dom-serializer'];

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

  // Per-test timeout (30 s default, can be overridden per-test)
  testTimeout: 30000,

  // Max workers (parallel test execution)
  maxWorkers: '50%',

  // Transform: our code runs as-is. sanitize-html's parser (htmlparser2 and
  // its dom* helpers) ships ES modules only; Node 22 loads them natively, but
  // Jest can't require() ES modules, so only those packages go through Babel.
  transform: {
    [String.raw`[/\\]node_modules[/\\](${ESM_ONLY_DEPS.join('|')})[/\\].+\.js$`]: ['babel-jest', {
      babelrc: false,
      configFile: false,
      plugins: ['@babel/plugin-transform-export-namespace-from', '@babel/plugin-transform-modules-commonjs']
    }]
  },
  transformIgnorePatterns: [String.raw`[/\\]node_modules[/\\](?!(${ESM_ONLY_DEPS.join('|')})[/\\])`],

  // Global teardown — close DB connections, clear timers
  globalTeardown: '<rootDir>/tests/global-teardown.js',
};
