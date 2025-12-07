# Testing Guide

> **Comprehensive testing strategy for Nocturnal platform**

---

## Current Test Coverage Status

**Baseline Coverage** (as of November 21, 2024):

```
Statement Coverage:  3.83%
Branch Coverage:     2.66%
Function Coverage:   4.81%
Line Coverage:       3.83%

Target Coverage:     70%
Gap to Close:        66.17%
```

### Coverage by Module

| Module | Statements | Branches | Functions | Lines | Status |
|--------|------------|----------|-----------|-------|--------|
| **models/user.js** | 88.42% | 82.6% | 60% | 86.11% | ✅ Good |
| **utils/encryption.js** | 33.33% | 40% | 50% | 36.36% | ⚠️ Needs work |
| **All other files** | 0% | 0% | 0% | 0% | 🔴 Critical |

---

## Table of Contents

- [Quick Start](#quick-start)
- [Test Infrastructure](#test-infrastructure)
- [MongoDB Authentication Fix](#mongodb-authentication-fix)
- [Writing Tests](#writing-tests)
- [Coverage Goals](#coverage-goals)
- [Running Tests](#running-tests)
- [CI/CD Integration](#cicd-integration)

---

## Quick Start

### Prerequisites

- MongoDB running locally
- Test database: `nocturnal_test`
- No authentication required for test DB (or test credentials configured)

### Run Tests

```bash
# Run all tests
npm test

# Run with coverage report
npm run test:coverage

# Run specific test suite
npm run test:unit
npm run test:integration
npm run test:e2e

# Watch mode (development)
npm run test:watch

# Run tests in CI environment
npm run test:ci
```

---

## Test Infrastructure

### Configuration Files

**jest.config.js** - Main Jest configuration
```javascript
module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
  collectCoverageFrom: [
    '**/*.js',
    '!**/node_modules/**',
    '!**/tests/**',
    '!**/coverage/**'
  ],
  coverageThreshold: {
    global: {
      statements: 70,
      branches: 70,
      functions: 70,
      lines: 70
    }
  }
};
```

**tests/setup.js** - Global test setup
- Sets `NODE_ENV=test`
- Configures test database
- Loads test environment variables
- Provides global test utilities

**tests/helpers.js** - Test helper functions
- Database connection management
- Collection cleanup
- Factory functions for test data

---

## MongoDB Authentication Fix

### Issue

Tests fail with:
```
MongoServerError: Command delete requires authentication
```

### Solution Options

#### Option 1: Disable Auth for Test Database (Recommended for Development)

1. **Connect to MongoDB without auth:**
```bash
mongosh --noauth
```

2. **Create test database without authentication:**
```javascript
use nocturnal_test
db.createCollection('test')
```

3. **Update `.env.test`:**
```env
MONGODB_URI=mongodb://localhost:27017/nocturnal_test
```

#### Option 2: Create Test User with Authentication

1. **Create test database user:**
```bash
mongosh
use admin
db.auth('admin', 'admin_password')

use nocturnal_test
db.createUser({
  user: "test_user",
  pwd: "test_password",
  roles: [
    { role: "readWrite", db: "nocturnal_test" },
    { role: "dbAdmin", db: "nocturnal_test" }
  ]
})
```

2. **Update `.env.test`:**
```env
MONGODB_URI=mongodb://test_user:test_password@localhost:27017/nocturnal_test?authSource=nocturnal_test
```

#### Option 3: Use MongoDB Memory Server (Best for CI/CD)

Install MongoDB Memory Server:
```bash
npm install --save-dev mongodb-memory-server
```

Update `tests/setup.js`:
```javascript
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  process.env.MONGODB_URI = mongoUri;
});

afterAll(async () => {
  if (mongoServer) {
    await mongoServer.stop();
  }
});
```

**Benefits:**
- No local MongoDB required
- Fast test execution
- Clean state for each test run
- Works in CI/CD environments

---

## Writing Tests

### Test Structure

```
tests/
├── setup.js                    # Global setup
├── helpers.js                  # Test utilities
├── factories.js                # Test data factories
├── unit/                       # Unit tests
│   ├── models/
│   │   ├── user.test.js       # ✅ 88% coverage
│   │   ├── duty.test.js       # ❌ Not created
│   │   └── application.test.js # ❌ Not created
│   ├── middleware/
│   │   ├── auth.test.js       # ❌ Not created
│   │   ├── security.test.js   # ❌ Not created
│   │   └── rateLimitEnhanced.test.js
│   └── utils/
│       ├── encryption.test.js # ⚠️ 33% coverage
│       └── pagination.test.js
├── integration/                # Integration tests
│   ├── auth.test.js
│   ├── duties.test.js
│   └── applications.test.js
└── e2e/                        # End-to-end tests
    └── registration-flow.test.js
```

### Example: Unit Test Template

```javascript
/**
 * @jest-environment node
 */

const mongoose = require('mongoose');
const YourModel = require('../../models/yourModel');
const { connectDB, clearDatabase, closeDatabase } = require('../helpers');

describe('YourModel', () => {
  // Setup: Connect to test database
  beforeAll(async () => {
    await connectDB();
  });

  // Cleanup: Clear data after each test
  afterEach(async () => {
    await clearDatabase();
  });

  // Teardown: Close connection
  afterAll(async () => {
    await closeDatabase();
  });

  describe('Validation', () => {
    it('should require mandatory fields', async () => {
      const doc = new YourModel({});

      await expect(doc.save()).rejects.toThrow();
    });

    it('should accept valid data', async () => {
      const doc = new YourModel({
        field1: 'value1',
        field2: 'value2'
      });

      const saved = await doc.save();
      expect(saved._id).toBeDefined();
      expect(saved.field1).toBe('value1');
    });
  });

  describe('Methods', () => {
    it('should execute custom method correctly', async () => {
      const doc = await YourModel.create({ /* valid data */ });

      const result = doc.yourMethod();

      expect(result).toBe(expectedValue);
    });
  });
});
```

### Example: Integration Test Template

```javascript
const request = require('supertest');
const app = require('../../server');
const { connectDB, clearDatabase, closeDatabase } = require('../helpers');
const { createUser, createToken } = require('../factories');

describe('API Integration Tests', () => {
  let authToken;
  let testUser;

  beforeAll(async () => {
    await connectDB();
  });

  beforeEach(async () => {
    testUser = await createUser({ role: 'doctor' });
    authToken = createToken(testUser._id);
  });

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  describe('POST /api/v1/endpoint', () => {
    it('should create resource with valid data', async () => {
      const response = await request(app)
        .post('/api/v1/endpoint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          field1: 'value1',
          field2: 'value2'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('_id');
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/v1/endpoint')
        .send({});

      expect(response.status).toBe(401);
    });

    it('should validate input data', async () => {
      const response = await request(app)
        .post('/api/v1/endpoint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // Invalid data
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});
```

---

## Coverage Goals

### Priority 1: Critical Security (Target: 90%+)

**Why:** Security vulnerabilities have highest impact

- [ ] `middleware/auth.js` - JWT authentication
- [ ] `middleware/security.js` - Attack prevention
- [ ] `middleware/rateLimitEnhanced.js` - DDoS protection
- [ ] `utils/encryption.js` - Data encryption
- [ ] `utils/encryptionV2.js` - Enhanced encryption

### Priority 2: Business Logic (Target: 85%+)

**Why:** Core functionality must work correctly

- [ ] `models/user.js` - ✅ Already at 88%
- [ ] `models/duty.js` - Match scoring algorithm
- [ ] `models/application.js` - Application processing
- [ ] `services/authService.js` - Authentication logic
- [ ] `services/dutyService.js` - Duty management
- [ ] `controllers/*` - Request handling

### Priority 3: Data Layer (Target: 80%+)

**Why:** Data integrity is critical

- [ ] All remaining models (18 total)
- [ ] `config/database.js` - Connection management
- [ ] Database reconnection logic
- [ ] Index creation scripts

### Priority 4: API Layer (Target: 75%+)

**Why:** API contract must be reliable

- [ ] All route handlers
- [ ] Input validation middleware
- [ ] Error handling
- [ ] Response formatting

### Priority 5: Utilities (Target: 70%+)

**Why:** Support functions should be tested

- [ ] `utils/logger.js`
- [ ] `utils/monitoring.js`
- [ ] `utils/pagination.js`
- [ ] `utils/responseHelper.js`

---

## Running Tests

### Local Development

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode for TDD
npm run test:watch

# Run specific test file
npm test tests/unit/models/user.test.js

# Run tests matching pattern
npm test -- --testNamePattern="should validate email"
```

### Coverage Report

After running `npm run test:coverage`, open:
```
coverage/lcov-report/index.html
```

**Coverage report shows:**
- Overall coverage percentages
- File-by-file breakdown
- Highlighted uncovered lines
- Branch coverage details

### Debugging Tests

```bash
# Run with verbose output
npm test -- --verbose

# Run single test in debug mode
node --inspect-brk node_modules/.bin/jest tests/unit/models/user.test.js

# Then open Chrome DevTools:
# chrome://inspect
```

---

## CI/CD Integration

### GitHub Actions Workflow

**File:** `.github/workflows/ci.yml`

```yaml
name: CI - Test & Coverage

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      mongodb:
        image: mongo:8
        ports:
          - 27017:27017
        options: >-
          --health-cmd "mongosh --eval 'db.runCommand({ ping: 1 })'"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run linter
        run: npm run lint

      - name: Run tests with coverage
        run: npm run test:ci
        env:
          MONGODB_URI: mongodb://localhost:27017/nocturnal_test
          NODE_ENV: test

      - name: Check coverage threshold
        run: |
          COVERAGE=$(node -p "require('./coverage/coverage-summary.json').total.lines.pct")
          echo "Coverage: $COVERAGE%"
          if (( $(echo "$COVERAGE < 70" | bc -l) )); then
            echo "❌ Coverage $COVERAGE% is below 70% threshold"
            exit 1
          fi
          echo "✅ Coverage $COVERAGE% meets 70% threshold"

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
          flags: unittests
          name: codecov-umbrella

      - name: Comment PR with coverage
        if: github.event_name == 'pull_request'
        uses: romeovs/lcov-reporter-action@v0.3.1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          lcov-file: ./coverage/lcov.info
```

---

## Test Utilities

### Available Global Utilities

From `tests/setup.js`:

```javascript
// Wait utility
await global.testUtils.wait(1000); // Wait 1 second

// Random data generators
const email = global.testUtils.randomEmail();
// → test1732182345abc@test.com

const phone = global.testUtils.randomPhone();
// → +11234567890

const string = global.testUtils.randomString(20);
// → abcdef1234567890

// Date helpers
const futureDate = global.testUtils.futureDate(7);  // 7 days from now
const pastDate = global.testUtils.pastDate(7);      // 7 days ago
```

### Test Factories

**File:** `tests/factories.js`

```javascript
const { faker } = require('@faker-js/faker');
const User = require('../models/user');
const jwt = require('jsonwebtoken');

/**
 * Create test user
 */
async function createUser(overrides = {}) {
  const userData = {
    name: faker.person.fullName(),
    email: faker.internet.email().toLowerCase(),
    password: 'Test123!@#',
    role: 'doctor',
    phone: faker.phone.number(),
    ...overrides
  };

  return await User.create(userData);
}

/**
 * Create JWT token for testing
 */
function createToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: '1h'
  });
}

/**
 * Create test duty
 */
async function createDuty(overrides = {}) {
  // ... duty creation logic
}

module.exports = {
  createUser,
  createToken,
  createDuty
};
```

---

## Best Practices

### 1. Test Isolation

❌ **Bad:**
```javascript
let sharedUser;

beforeAll(async () => {
  sharedUser = await createUser();
});

it('test 1', () => {
  sharedUser.name = 'Modified';
  // This affects other tests!
});
```

✅ **Good:**
```javascript
beforeEach(async () => {
  // Fresh user for each test
  testUser = await createUser();
});

afterEach(async () => {
  // Clean up
  await clearDatabase();
});
```

### 2. Descriptive Test Names

❌ **Bad:**
```javascript
it('works', () => { /* ... */ });
it('test 2', () => { /* ... */ });
```

✅ **Good:**
```javascript
it('should return 401 when JWT token is missing', () => { /* ... */ });
it('should hash password before saving to database', () => { /* ... */ });
```

### 3. Arrange-Act-Assert Pattern

```javascript
it('should calculate profile strength correctly', () => {
  // Arrange: Set up test data
  const user = new User({
    name: 'Test',
    email: 'test@test.com',
    role: 'doctor'
  });

  // Act: Execute the code being tested
  const strength = user.calculateProfileStrength();

  // Assert: Verify the result
  expect(strength).toBe(25);
});
```

### 4. Test Edge Cases

```javascript
describe('calculateProfileStrength', () => {
  it('should return 25 for basic info only', () => { /* ... */ });
  it('should return 100 for complete profile', () => { /* ... */ });
  it('should not exceed 100 even with extra data', () => { /* ... */ });
  it('should return 0 for empty user object', () => { /* ... */ });
  it('should handle null values gracefully', () => { /* ... */ });
});
```

---

## Roadmap to 70% Coverage

### Week 1: Critical Security (Priority 1)
- [ ] Day 1-2: Authentication middleware tests
- [ ] Day 3-4: Security middleware tests
- [ ] Day 5: Encryption utilities tests
- **Target:** 20% overall coverage

### Week 2: Business Logic (Priority 2)
- [ ] Day 1-2: User service tests
- [ ] Day 3-4: Duty service tests
- [ ] Day 5: Controller tests
- **Target:** 40% overall coverage

### Week 3: Data Layer (Priority 3)
- [ ] Day 1-3: Model tests (all 18 models)
- [ ] Day 4: Database configuration tests
- [ ] Day 5: Integration tests
- **Target:** 60% overall coverage

### Week 4: API Layer (Priority 4)
- [ ] Day 1-2: Route handler tests
- [ ] Day 3: Validation middleware tests
- [ ] Day 4-5: End-to-end tests
- **Target:** 70% overall coverage

---

## Troubleshooting

### Issue: Tests fail with MongoDB connection error

**Solution:** Check MongoDB is running and test database is accessible
```bash
mongosh nocturnal_test --eval "db.runCommand({ ping: 1 })"
```

### Issue: "Jest has detected the following 1 open handle"

**Solution:** Ensure database connections are closed
```javascript
afterAll(async () => {
  await mongoose.connection.close();
});
```

### Issue: Tests timeout

**Solution:** Increase timeout in jest.config.js
```javascript
module.exports = {
  testTimeout: 30000 // 30 seconds
};
```

---

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [MongoDB Memory Server](https://github.com/nodkz/mongodb-memory-server)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)

---

**Last Updated:** November 21, 2024
**Current Coverage:** 3.83%
**Target Coverage:** 70%
**Gap:** 66.17%
