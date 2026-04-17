const baseConfig = require('./jest.config');

module.exports = {
  ...baseConfig,
  verbose: false,
  forceExit: true,
  detectOpenHandles: false,
  testPathIgnorePatterns: [
    ...(baseConfig.testPathIgnorePatterns || []),
    '/tests/models/',
    '/tests/unit/models/',
    '/tests/smoke/',
    '/services/patient-booking-service/tests/',
    'frontend-build-output-csp-contract'
  ]
};
