const jwt = require('jsonwebtoken');
const crypto = require('crypto');

jest.mock('../../models/user', () => ({
  findById: jest.fn(),
  findOne: jest.fn()
}));

jest.mock('../../models/refreshSession', () => ({
  create: jest.fn().mockResolvedValue({}),
  findOneAndUpdate: jest.fn().mockResolvedValue(null),
  updateOne: jest.fn().mockResolvedValue({}),
  updateMany: jest.fn().mockResolvedValue({})
}));

jest.mock('../../models/idempotencyKey', () => ({
  create: jest.fn().mockResolvedValue({}),
  findOne: jest.fn().mockResolvedValue(null),
  updateOne: jest.fn().mockResolvedValue({}),
  deleteOne: jest.fn().mockResolvedValue({})
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  logSecurity: jest.fn(),
  logAuth: jest.fn()
}));

const User = require('../../models/user');
const {
  generateToken,
  JWT_ACCESS_SIGN_OPTIONS
} = require('../../middleware/auth');

const mockUserStore = new Map();

const toTestObjectId = (value) => {
  const candidate = String(value || '');
  if (/^[a-f\d]{24}$/i.test(candidate)) {
    return candidate;
  }
  return crypto.createHash('sha256').update(candidate).digest('hex').slice(0, 24);
};

function createPersistedUser(overrides = {}) {
  const baseUser = {
    _id: toTestObjectId(overrides._id || global.testUtils.randomString(24)),
    name: 'Test User',
    email: global.testUtils.randomEmail(),
    phone: '+919876543210',
    role: 'doctor',
    password: 'Test@1234',
    isVerified: true,
    isActive: true,
    location: { city: 'Old City', state: 'KA' },
    notificationSettings: { email: true },
    isAvailableForShifts: true,
    onboardingCompleted: false,
    specialty: 'Emergency Medicine',
    licenseNumber: 'DOC-OLD-001',
    professional: {
      primarySpecialization: 'Emergency Medicine',
      yearsOfExperience: 3
    },
    bankDetails: null,
    lastActive: null,
    passwordChangedAt: null,
    comparePassword: jest.fn().mockImplementation(async function comparePassword(candidatePassword) {
      return candidatePassword === this.password;
    }),
    calculateProfileStrength: jest.fn(() => 100),
    save: jest.fn().mockImplementation(async function saveMock() {
      if (this.password !== this._lastSavedPassword) {
        this.passwordChangedAt = new Date();
        this._lastSavedPassword = this.password;
      }
      mockUserStore.set(this._id, this);
      return this;
    }),
    toObject: function toObject() {
      return {
        _id: this._id,
        name: this.name,
        email: this.email,
        phone: this.phone,
        role: this.role,
        lastActive: this.lastActive,
        passwordChangedAt: this.passwordChangedAt,
        isVerified: this.isVerified,
        isActive: this.isActive,
        location: this.location,
        notificationSettings: this.notificationSettings,
        isAvailableForShifts: this.isAvailableForShifts,
        onboardingCompleted: this.onboardingCompleted,
        specialty: this.specialty,
        licenseNumber: this.licenseNumber,
        professional: this.professional,
        hospitalId: this.hospitalId,
        bankDetails: this.bankDetails
      };
    }
  };

  const user = Object.assign(baseUser, overrides, { _id: baseUser._id });
  user.id = user._id;
  user._lastSavedPassword = user.password;
  mockUserStore.set(user._id, user);
  return user;
}

function findUserById(id) {
  const user = mockUserStore.get(String(id)) || null;

  return {
    select: jest.fn().mockResolvedValue(user),
    then: (resolve, reject) => Promise.resolve(user).then(resolve, reject),
    catch: (reject) => Promise.resolve(user).catch(reject)
  };
}

function findUserByEmail(email) {
  const user = Array.from(mockUserStore.values()).find((entry) => entry.email === email) || null;

  return {
    select: jest.fn().mockResolvedValue(user),
    then: (resolve, reject) => Promise.resolve(user).then(resolve, reject),
    catch: (reject) => Promise.resolve(user).catch(reject)
  };
}

function setupAuthIntegrationHarness() {
  let app;

  beforeAll(() => {
    User.findById.mockImplementation((id) => findUserById(id));
    User.findOne.mockImplementation((query) => findUserByEmail(query.email));
    app = require('../../app');
  });

  beforeEach(() => {
    mockUserStore.clear();
    User.findById.mockClear();
    User.findOne.mockClear();
    User.findById.mockImplementation((id) => findUserById(id));
    User.findOne.mockImplementation((query) => findUserByEmail(query.email));
  });

  return {
    getApp: () => app
  };
}

module.exports = {
  jwt,
  generateToken,
  JWT_ACCESS_SIGN_OPTIONS,
  createPersistedUser,
  setupAuthIntegrationHarness
};
