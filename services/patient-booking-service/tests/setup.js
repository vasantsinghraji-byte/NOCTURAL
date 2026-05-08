/**
 * Jest Test Setup
 * Configures test environment for patient-booking-service
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.MONGODB_URI = 'mongodb://localhost:27017/nocturnal-patient-booking-test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.LOG_LEVEL = 'error'; // Reduce noise in tests
process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.NOCTURNAL_TEST_LOGS = process.env.NOCTURNAL_TEST_LOGS || '0';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

// Mock external service calls by default
jest.mock('axios');

// Increase timeout for database operations
jest.setTimeout(10000);

beforeAll(async () => {
  if (process.env.PATIENT_BOOKING_TEST_DB === 'external') {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI);
    }
    return;
  }

  mongoServer = await MongoMemoryServer.create({
    instance: {
      dbName: 'nocturnal-patient-booking-test'
    }
  });

  process.env.MONGODB_URI = mongoServer.getUri();
  await mongoose.connect(process.env.MONGODB_URI);
});

// Global test utilities
global.mockRequest = (overrides = {}) => ({
  body: {},
  params: {},
  query: {},
  headers: {},
  user: null,
  ...overrides
});

global.mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.sendStatus = jest.fn().mockReturnValue(res);
  return res;
};

global.mockNext = () => jest.fn();

// Cleanup after all tests
afterAll(async () => {
  // Close database connections
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  if (mongoServer) {
    await mongoServer.stop();
  }
});
