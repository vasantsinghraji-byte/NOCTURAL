const baseConfig = require('./jest.config');

module.exports = {
  ...baseConfig,
  verbose: false,
  forceExit: false,
  detectOpenHandles: false,
  testPathIgnorePatterns: [
    ...(baseConfig.testPathIgnorePatterns || []),
    '/tests/models/',
    '/tests/unit/models/',
    '/tests/smoke/',
    '/services/patient-booking-service/tests/'
  ]
};
