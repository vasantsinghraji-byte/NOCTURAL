'use strict';

/**
 * Phase 5-A route-availability guards (docs/PHASE5_DECISION_BRIEF.md,
 * docs/PHASE1_SPLIT_RECONCILED.md).
 *
 * The Product Owner decision (2026-07-05) is that every duty-shift route stays
 * live while the patient-health split continues. These tests prove, at the
 * router level, that:
 *
 *   1. The monolith v1 router still mounts every preserved duty-shift route
 *      and every patient-health route, each wired to its own route module.
 *   2. `/payments` stays mounted unconditionally while `/payments-b2c` stays
 *      feature-flagged (both the enabled and disabled sides of the gate).
 *   3. The patient-health app router keeps its patient-health subset mounted.
 *
 * If one of these tests fails, a route mount changed. Restore the mount or
 * take the change through the blueprint's approval process; do not weaken
 * this test.
 */

const express = require('express');
const request = require('supertest');

function createMockRouter(label) {
  const router = express.Router();
  router.get('/__sentinel', (req, res) => {
    res.status(200).json({ route: label });
  });
  return router;
}

// Preserved duty-shift mounts (decision brief) → owning route module.
const DUTY_SHIFT_MOUNTS = {
  '/duties': 'routes/duties',
  '/applications': 'routes/applications',
  '/calendar': 'routes/calendar',
  '/earnings': 'routes/earnings',
  '/certifications': 'routes/certifications',
  '/reviews': 'routes/reviews',
  '/achievements': 'routes/achievements',
  '/shift-series': 'routes/shiftSeries',
  '/hospital-settings': 'routes/hospitalSettings',
  '/hospital-waitlist': 'routes/hospitalWaitlist'
};

// Patient-health mounts expected in the monolith v1 router.
const PATIENT_HEALTH_MOUNTS = {
  '/patients': 'routes/patient',
  '/bookings': 'routes/booking',
  '/patient-dashboard': 'routes/patientDashboard',
  '/health-records': 'routes/healthData',
  '/health-analytics': 'routes/healthAnalytics',
  '/health-intake': 'routes/healthIntake',
  '/doctor-access': 'routes/doctorAccess',
  '/patient-analytics': 'routes/patientAnalytics'
};

function mockV1RouteDependencies() {
  const mockAt = (modulePath, label) => {
    jest.doMock(`../../../${modulePath}`, () => createMockRouter(label));
  };

  for (const [mount, modulePath] of Object.entries({ ...DUTY_SHIFT_MOUNTS, ...PATIENT_HEALTH_MOUNTS })) {
    mockAt(modulePath, mount);
  }

  mockAt('routes/auth', '/auth');
  mockAt('routes/messaging', '/messages');
  mockAt('routes/analyticsOptimized', '/analytics');
  mockAt('routes/uploads', '/uploads');
  mockAt('routes/notifications', '/notifications');
  mockAt('routes/payments', '/payments');
  mockAt('routes/payment', '/payments-b2c');
  mockAt('routes/admin/funnel', '/admin/funnel');
  mockAt('routes/admin/securityAudit', '/admin/security-audit');
  mockAt('routes/security', '/security');
  mockAt('routes/funnelEvents', '/funnel-events');
  mockAt('routes/mobileDevices', '/mobile-devices');
  mockAt('routes/webAuthn', '/webauthn');
  mockAt('routes/stagingWebAuthnSmoke', '/staging');
  jest.doMock('../../../routes/admin/metrics', () => ({ router: createMockRouter('/admin/metrics') }));
  jest.doMock('../../../utils/logger', () => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    logSecurity: jest.fn()
  }));
}

function buildV1App() {
  mockV1RouteDependencies();
  let v1Router;
  jest.isolateModules(() => {
    v1Router = require('../../../routes/v1');
  });
  const app = express();
  app.use('/api/v1', v1Router);
  return app;
}

const RAZORPAY_ENV_KEYS = ['RAZORPAY_ENABLED', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'];
const originalRazorpayEnv = {};

beforeAll(() => {
  for (const key of RAZORPAY_ENV_KEYS) {
    originalRazorpayEnv[key] = process.env[key];
  }
});

afterEach(() => {
  jest.resetModules();
  for (const key of RAZORPAY_ENV_KEYS) {
    if (originalRazorpayEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalRazorpayEnv[key];
    }
  }
});

describe('monolith v1 router — duty-shift routes stay live (Phase 5-A invariant)', () => {
  test.each(Object.keys(DUTY_SHIFT_MOUNTS))('%s remains mounted to its route module', async (mount) => {
    const app = buildV1App();
    const res = await request(app).get(`/api/v1${mount}/__sentinel`).expect(200);
    expect(res.body.route).toBe(mount);
  });
});

describe('monolith v1 router — patient-health routes stay reachable', () => {
  test.each(Object.keys(PATIENT_HEALTH_MOUNTS))('%s remains mounted to its route module', async (mount) => {
    const app = buildV1App();
    const res = await request(app).get(`/api/v1${mount}/__sentinel`).expect(200);
    expect(res.body.route).toBe(mount);
  });
});

describe('monolith v1 router — payment mount distinction is preserved', () => {
  test('/payments stays mounted even when Razorpay is disabled', async () => {
    process.env.RAZORPAY_ENABLED = 'false';
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;

    const app = buildV1App();
    const res = await request(app).get('/api/v1/payments/__sentinel').expect(200);
    expect(res.body.route).toBe('/payments');
    await request(app).get('/api/v1/payments-b2c/__sentinel').expect(404);
  });

  test('/payments-b2c mounts when Razorpay credentials are configured', async () => {
    process.env.RAZORPAY_ENABLED = 'true';
    process.env.RAZORPAY_KEY_ID = 'rzp_test_route_guard';
    process.env.RAZORPAY_KEY_SECRET = 'test_secret_route_guard';

    const app = buildV1App();
    const res = await request(app).get('/api/v1/payments-b2c/__sentinel').expect(200);
    expect(res.body.route).toBe('/payments-b2c');
  });
});

describe('patient-health app router — patient-health subset stays mounted', () => {
  const APP_ROUTE_MODULES = {
    '/patients': 'apps/patient-health/routes/patient',
    '/bookings': 'apps/patient-health/routes/booking',
    '/patient-dashboard': 'apps/patient-health/routes/patientDashboard',
    '/health-records': 'apps/patient-health/routes/healthData',
    '/health-analytics': 'apps/patient-health/routes/healthAnalytics',
    '/health-intake': 'apps/patient-health/routes/healthIntake',
    '/doctor-access': 'apps/patient-health/routes/doctorAccess',
    '/patient-analytics': 'apps/patient-health/routes/patientAnalytics'
  };

  function buildPatientHealthApp() {
    for (const [mount, modulePath] of Object.entries(APP_ROUTE_MODULES)) {
      jest.doMock(`../../../${modulePath}`, () => createMockRouter(mount));
    }
    jest.doMock('../../../apps/patient-health/routes/payment', () => createMockRouter('/payments-b2c'));
    jest.doMock('../../../utils/logger', () => ({
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      logSecurity: jest.fn()
    }));

    let appRouter;
    jest.isolateModules(() => {
      appRouter = require('../../../apps/patient-health/routes');
    });
    const app = express();
    app.use('/api/v1', appRouter);
    return app;
  }

  test.each(Object.keys(APP_ROUTE_MODULES))('%s remains mounted to its app-local route module', async (mount) => {
    const app = buildPatientHealthApp();
    const res = await request(app).get(`/api/v1${mount}/__sentinel`).expect(200);
    expect(res.body.route).toBe(mount);
  });

  test('/payments-b2c gating mirrors the monolith (absent when disabled, mounted when configured)', async () => {
    process.env.RAZORPAY_ENABLED = 'false';
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    let app = buildPatientHealthApp();
    await request(app).get('/api/v1/payments-b2c/__sentinel').expect(404);

    jest.resetModules();
    process.env.RAZORPAY_ENABLED = 'true';
    process.env.RAZORPAY_KEY_ID = 'rzp_test_route_guard';
    process.env.RAZORPAY_KEY_SECRET = 'test_secret_route_guard';
    app = buildPatientHealthApp();
    const res = await request(app).get('/api/v1/payments-b2c/__sentinel').expect(200);
    expect(res.body.route).toBe('/payments-b2c');
  });
});
