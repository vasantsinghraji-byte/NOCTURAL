const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../../app');
const User = require('../../../models/user');
const WebAuthnChallenge = require('../../../models/webAuthnChallenge');
const WebAuthnRecoveryCode = require('../../../models/webAuthnRecoveryCode');

describe('Staging WebAuthn smoke account API', () => {
  let databaseAvailable = false;
  const originalEnv = {
    ENABLE_STAGING_TEST_APIS: process.env.ENABLE_STAGING_TEST_APIS,
    STAGING_TEST_API_SECRET: process.env.STAGING_TEST_API_SECRET,
    STAGING_WEBAUTHN_SMOKE_EMAIL_DOMAIN: process.env.STAGING_WEBAUTHN_SMOKE_EMAIL_DOMAIN
  };

  beforeAll(async () => {
    process.env.ENABLE_STAGING_TEST_APIS = 'true';
    process.env.STAGING_TEST_API_SECRET = 'integration-secret';
    process.env.STAGING_WEBAUTHN_SMOKE_EMAIL_DOMAIN = 'integration.nocturnal.test';
    if (mongoose.connection.readyState === 0) {
      try {
        await mongoose.connect(process.env.MONGODB_URI, {
          serverSelectionTimeoutMS: Number(process.env.TEST_MONGO_SERVER_SELECTION_TIMEOUT_MS) || 3000
        });
        databaseAvailable = true;
      } catch (error) {
        databaseAvailable = false;
        console.warn(`Skipping staging smoke API integration test: MongoDB unavailable (${error.message})`);
      }
    } else {
      databaseAvailable = true;
    }
  });

  beforeEach(async () => {
    if (!databaseAvailable) return;
    await User.deleteMany({ email: /^webauthn-smoke-/ });
  });

  afterEach(async () => {
    if (!databaseAvailable) return;
    await User.deleteMany({ email: /^webauthn-smoke-/ });
    await WebAuthnChallenge.deleteMany({});
    await WebAuthnRecoveryCode.deleteMany({});
  });

  afterAll(async () => {
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  });

  it('mints and revokes a short-lived staging smoke account against the isolated test database', async () => {
    if (!databaseAvailable) return;
    const createResponse = await request(app)
      .post('/api/v1/staging/webauthn-smoke/accounts')
      .set('X-Staging-Test-Secret', 'integration-secret')
      .send();

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.success).toBe(true);
    expect(createResponse.body.accountId).toBeTruthy();
    expect(createResponse.body.email).toMatch(/^webauthn-smoke-/);
    expect(createResponse.body.token).toBeTruthy();

    const createdUser = await User.findById(createResponse.body.accountId)
      .select('+smokeTestExpiresAt')
      .lean();
    expect(createdUser).toBeTruthy();
    expect(createdUser.email).toBe(createResponse.body.email);
    expect(createdUser.smokeTestExpiresAt).toBeTruthy();

    const revokeResponse = await request(app)
      .delete(`/api/v1/staging/webauthn-smoke/accounts/${createResponse.body.accountId}`)
      .set('X-Staging-Test-Secret', 'integration-secret')
      .send();

    expect(revokeResponse.status).toBe(200);
    expect(revokeResponse.body.success).toBe(true);
    expect(revokeResponse.body.revoked).toBe(true);
    await expect(User.findById(createResponse.body.accountId).lean()).resolves.toBeNull();
  });

  it('rejects staging smoke requests without the configured secret', async () => {
    if (!databaseAvailable) return;
    const response = await request(app)
      .post('/api/v1/staging/webauthn-smoke/accounts')
      .set('X-Staging-Test-Secret', 'wrong-secret')
      .send();

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });
});
