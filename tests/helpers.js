/**
 * Test Helper Functions
 * Reusable utilities for setting up test scenarios
 */

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const Duty = require('../models/duty');
const Application = require('../models/application');

/**
 * Database Helpers
 */

// Connect to test database
async function connectTestDB() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
}

// Disconnect from test database
async function disconnectTestDB() {
  await mongoose.connection.close();
}

// Clear all collections
async function clearDatabase() {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
}

// Clear specific collection
async function clearCollection(collectionName) {
  if (mongoose.connection.collections[collectionName]) {
    await mongoose.connection.collections[collectionName].deleteMany({});
  }
}

/**
 * User Creation Helpers
 */

// Create a test user
async function createTestUser(overrides = {}) {
  const defaultUser = {
    name: 'Test User',
    email: global.testUtils.randomEmail(),
    password: 'Test@1234',
    phone: global.testUtils.randomPhone(),
    role: 'doctor',
    status: 'ACTIVE',
    isVerified: true,
    emailVerified: true,
    phoneVerified: true,
    profileCompleted: true
  };

  const userData = { ...defaultUser, ...overrides };
  const user = await User.create(userData);

  // Return user with plain password for testing
  return { ...user.toObject(), plainPassword: 'Test@1234' };
}

// Create multiple test users
async function createTestUsers(count = 3, role = 'doctor') {
  const users = [];
  for (let i = 0; i < count; i++) {
    const user = await createTestUser({
      name: `Test ${role} ${i + 1}`,
      role
    });
    users.push(user);
  }
  return users;
}

// Create admin user
async function createAdminUser() {
  return createTestUser({
    name: 'Admin User',
    email: 'admin@test.com',
    role: 'admin',
    permissions: ['all']
  });
}

// Create hospital user
async function createHospitalUser() {
  return createTestUser({
    name: 'Hospital Admin',
    email: 'hospital@test.com',
    role: 'hospital',
    hospital: 'Test Hospital',
    hospitalVerified: true
  });
}

/**
 * Authentication Helpers
 */

// Generate JWT token for user
function generateToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE
  });
}

// Create authenticated request headers
function createAuthHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

// Get auth token for user
async function getAuthToken(user) {
  return generateToken(user._id || user.id);
}

/**
 * Duty (Shift) Helpers
 */

// Create a test duty/shift
async function createTestDuty(hospital, overrides = {}) {
  const defaultDuty = {
    title: 'Night Shift - ER',
    specialty: 'Emergency Medicine',
    hospital: hospital._id || hospital,
    location: {
      address: '123 Test St',
      city: 'Test City',
      state: 'CA',
      zipCode: '12345',
      coordinates: { latitude: 37.7749, longitude: -122.4194 }
    },
    date: global.testUtils.futureDate(7),
    startTime: '20:00',
    endTime: '08:00',
    duration: 12,
    payRate: 75,
    totalPay: 900,
    requirements: {
      minExperience: 2,
      requiredCertifications: ['BLS', 'ACLS'],
      skills: ['Emergency Care']
    },
    description: 'Test duty description',
    status: 'OPEN',
    postedBy: hospital._id || hospital
  };

  const dutyData = { ...defaultDuty, ...overrides };
  return await Duty.create(dutyData);
}

// Create multiple test duties
async function createTestDuties(hospital, count = 5) {
  const duties = [];
  for (let i = 0; i < count; i++) {
    const duty = await createTestDuty(hospital, {
      title: `Test Duty ${i + 1}`,
      date: global.testUtils.futureDate(i + 1)
    });
    duties.push(duty);
  }
  return duties;
}

/**
 * Application Helpers
 */

// Create a test application
async function createTestApplication(duty, applicant, overrides = {}) {
  const defaultApplication = {
    duty: duty._id || duty,
    applicant: applicant._id || applicant,
    status: 'PENDING',
    appliedAt: new Date(),
    coverLetter: 'I am interested in this position'
  };

  const applicationData = { ...defaultApplication, ...overrides };
  return await Application.create(applicationData);
}

// Create multiple applications
async function createTestApplications(duty, applicants) {
  const applications = [];
  for (const applicant of applicants) {
    const app = await createTestApplication(duty, applicant);
    applications.push(app);
  }
  return applications;
}

/**
 * Request Mock Helpers
 */

// Create mock Express request
function mockRequest(overrides = {}) {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    user: null,
    ...overrides
  };
}

// Create mock Express response
function mockResponse() {
  const res = {
    statusCode: 200,
    data: null
  };

  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockImplementation((data) => {
    res.data = data;
    return res;
  });
  res.send = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);

  return res;
}

// Create mock next function
function mockNext() {
  return jest.fn();
}

/**
 * Validation Helpers
 */

// Check if object has required fields
function hasRequiredFields(obj, fields) {
  return fields.every(field => obj.hasOwnProperty(field) && obj[field] != null);
}

// Check if response matches expected structure
function validateResponseStructure(response, expectedStructure) {
  for (const [key, type] of Object.entries(expectedStructure)) {
    if (!response.hasOwnProperty(key)) {
      throw new Error(`Missing expected field: ${key}`);
    }
    if (typeof response[key] !== type) {
      throw new Error(`Field ${key} has wrong type. Expected ${type}, got ${typeof response[key]}`);
    }
  }
  return true;
}

/**
 * Async Error Testing Helper
 */
async function expectAsyncError(fn, errorMessage) {
  let error;
  try {
    await fn();
  } catch (e) {
    error = e;
  }
  expect(error).toBeDefined();
  if (errorMessage) {
    expect(error.message).toContain(errorMessage);
  }
}

module.exports = {
  // Database
  connectTestDB,
  disconnectTestDB,
  clearDatabase,
  clearCollection,

  // Users
  createTestUser,
  createTestUsers,
  createAdminUser,
  createHospitalUser,

  // Authentication
  generateToken,
  createAuthHeaders,
  getAuthToken,

  // Duties
  createTestDuty,
  createTestDuties,

  // Applications
  createTestApplication,
  createTestApplications,

  // Mocks
  mockRequest,
  mockResponse,
  mockNext,

  // Validation
  hasRequiredFields,
  validateResponseStructure,
  expectAsyncError
};
