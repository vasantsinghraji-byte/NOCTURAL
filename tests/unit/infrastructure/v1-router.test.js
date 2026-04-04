const express = require('express');
const request = require('supertest');

function createMockRouter(label) {
  const router = express.Router();
  router.get('/__sentinel', (req, res) => {
    res.status(200).json({ route: label });
  });
  return router;
}

function mockV1RouteDependencies() {
  jest.doMock('../../../routes/auth', () => createMockRouter('auth'));
  jest.doMock('../../../routes/duties', () => createMockRouter('duties'));
  jest.doMock('../../../routes/applications', () => createMockRouter('applications'));
  jest.doMock('../../../routes/calendar', () => createMockRouter('calendar'));
  jest.doMock('../../../routes/earnings', () => createMockRouter('earnings'));
  jest.doMock('../../../routes/certifications', () => createMockRouter('certifications'));
  jest.doMock('../../../routes/reviews', () => createMockRouter('reviews'));
  jest.doMock('../../../routes/achievements', () => createMockRouter('achievements'));
  jest.doMock('../../../routes/messaging', () => createMockRouter('messaging'));
  jest.doMock('../../../routes/analyticsOptimized', () => createMockRouter('analytics'));
  jest.doMock('../../../routes/shiftSeries', () => createMockRouter('shift-series'));
  jest.doMock('../../../routes/hospitalSettings', () => createMockRouter('hospital-settings'));
  jest.doMock('../../../routes/uploads', () => createMockRouter('uploads'));
  jest.doMock('../../../routes/notifications', () => createMockRouter('notifications'));
  jest.doMock('../../../routes/payments', () => createMockRouter('payments'));
  jest.doMock('../../../routes/admin/metrics', () => ({ router: createMockRouter('admin-metrics') }));
  jest.doMock('../../../routes/patient', () => createMockRouter('patients'));
  jest.doMock('../../../routes/booking', () => createMockRouter('bookings'));
  jest.doMock('../../../routes/payment', () => createMockRouter('payments-b2c'));
  jest.doMock('../../../routes/patientDashboard', () => createMockRouter('patient-dashboard'));
  jest.doMock('../../../routes/healthData', () => createMockRouter('health-records'));
  jest.doMock('../../../routes/healthAnalytics', () => createMockRouter('health-analytics'));
  jest.doMock('../../../routes/healthIntake', () => createMockRouter('health-intake'));
  jest.doMock('../../../routes/doctorAccess', () => createMockRouter('doctor-access'));
  jest.doMock('../../../routes/patientAnalytics', () => createMockRouter('patient-analytics'));
  jest.doMock('../../../routes/security', () => createMockRouter('security'));
  jest.doMock('../../../utils/logger', () => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    logSecurity: jest.fn()
  }));
}

describe('V1 Router Payment Gating', () => {
  const originalEnabled = process.env.RAZORPAY_ENABLED;
  const originalKeyId = process.env.RAZORPAY_KEY_ID;
  const originalSecret = process.env.RAZORPAY_KEY_SECRET;

  afterEach(() => {
    jest.resetModules();
    process.env.RAZORPAY_ENABLED = originalEnabled;
    process.env.RAZORPAY_KEY_ID = originalKeyId;
    process.env.RAZORPAY_KEY_SECRET = originalSecret;
  });

  it('should not mount /payments-b2c when Razorpay is disabled and credentials are absent', async () => {
    process.env.RAZORPAY_ENABLED = 'false';
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;

    mockV1RouteDependencies();

    let v1Router;
    jest.isolateModules(() => {
      v1Router = require('../../../routes/v1');
    });

    const app = express();
    app.use('/api/v1', v1Router);

    await request(app)
      .get('/api/v1/payments-b2c/__sentinel')
      .expect(404);
  });
});
