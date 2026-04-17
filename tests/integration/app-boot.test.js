/**
 * Contract / Boot Test
 *
 * Exercises the real app boot path (require('../../app')) — NOT mocked routers.
 * Verifies that middleware is wired, API routes are mounted, and security
 * headers are present, catching startup regressions that unit tests miss.
 */

const request = require('supertest');

let app;

beforeAll(() => {
  // Require the real app — this is the boot path under test.
  // The test setup.js already sets NODE_ENV=test and disables external services.
  app = require('../../app');
});

afterAll(async () => {
  // Clean up any mongoose connection opened during boot
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  } catch (_e) { /* ignore */ }
});

describe('App Integration: GET /api/v1/health and core API mount', () => {
  test('GET /api/v1/health returns 200 or 503 with expected shape', async () => {
    const res = await request(app).get('/api/v1/health');

    // Accept both 200 (DB connected) and 503 (DB not connected in test)
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('version', 'v1');
    expect(res.body).toHaveProperty('timestamp');
  });

  test('GET /api returns API info', async () => {
    const res = await request(app).get('/api');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('name', 'Nocturnal API');
    expect(res.body.endpoints).toHaveProperty('v1', '/api/v1');
  });

  test('Security headers are set on responses', async () => {
    const res = await request(app).get('/api');

    // Helmet CSP header
    expect(res.headers).toHaveProperty('content-security-policy');
    // HSTS
    expect(res.headers).toHaveProperty('strict-transport-security');
    // X-Content-Type-Options
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  test('API version header is set on v1 routes', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.headers['x-api-version']).toBe('v1');
  });

  test('Unknown API routes return 404 or redirect', async () => {
    const res = await request(app).get('/api/v1/nonexistent-route-xyz');

    // Express default 404 or custom error handler
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('Auth routes are mounted (POST /api/v1/auth/login returns 400 without body)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({});

    // 400 = validation error (no email/password), proves route is mounted
    expect([400, 422, 429]).toContain(res.status);
  });
});
