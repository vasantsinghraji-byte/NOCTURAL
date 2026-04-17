const { coverageThreshold, ...baseConfig } = require('./jest.config');

module.exports = {
  ...baseConfig,
  verbose: false,
  forceExit: true,
  detectOpenHandles: false,
  // The fast CI suite runs only a focused subset of tests, so it should
  // publish coverage artifacts without inheriting the full-suite global gate.
  coverageThreshold: undefined,
  testPathIgnorePatterns: [
    ...(baseConfig.testPathIgnorePatterns || []),
    '/tests/models/',
    '/tests/unit/models/',
    '/tests/smoke/',
    '/services/patient-booking-service/tests/',
    'frontend-build-output-csp-contract'
  ]
};
