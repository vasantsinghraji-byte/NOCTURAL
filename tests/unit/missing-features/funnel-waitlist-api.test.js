const express = require('express');
const request = require('supertest');

jest.mock('../../../models/hospitalWaitlist', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn(),
  aggregate: jest.fn(),
  findByIdAndUpdate: jest.fn()
}));

jest.mock('../../../services/emailNotificationService', () => ({
  sendHospitalWaitlistConfirmation: jest.fn().mockResolvedValue({ sent: false }),
  sendHospitalWaitlistAdminNotification: jest.fn().mockResolvedValue({ sent: false })
}));

jest.mock('../../../services/funnelAnalyticsService', () => ({
  incrementEvent: jest.fn().mockResolvedValue(),
  getDailyReport: jest.fn().mockResolvedValue({ rows: [], totals: {} })
}));

jest.mock('../../../middleware/auth', () => ({
  protect: (req, _res, next) => {
    req.user = { _id: 'admin-user-id', role: 'admin' };
    next();
  },
  authorize: () => (_req, _res, next) => next()
}));

const HospitalWaitlist = require('../../../models/hospitalWaitlist');
const emailNotificationService = require('../../../services/emailNotificationService');
const funnelAnalyticsService = require('../../../services/funnelAnalyticsService');
const hospitalWaitlistRoutes = require('../../../routes/hospitalWaitlist');
const funnelEventRoutes = require('../../../routes/funnelEvents');
const adminFunnelRoutes = require('../../../routes/admin/funnel');

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/hospital-waitlist', hospitalWaitlistRoutes);
  app.use('/api/v1/funnel-events', funnelEventRoutes);
  app.use('/api/v1/admin/funnel', adminFunnelRoutes);
  return app;
};

const validWaitlistPayload = {
  facilityName: 'City General Hospital',
  facilityType: 'hospital',
  contactName: 'Admin User',
  email: 'admin@example.com',
  phone: '+919876543210',
  city: 'Mumbai',
  state: 'Maharashtra',
  expectedNeed: 'Night duty nurses'
};

describe('public funnel optional improvements', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createApp();
  });

  it('stores privacy-safe CTA events as aggregate analytics', async () => {
    const res = await request(app)
      .post('/api/v1/funnel-events')
      .send({
        event: 'book_home_care_click',
        path: '/index.html',
        target: '/roles/patient/patient-register.html'
      });

    expect(res.status).toBe(204);
    expect(funnelAnalyticsService.incrementEvent).toHaveBeenCalledWith({
      event: 'book_home_care_click',
      path: '/index.html',
      target: '/roles/patient/patient-register.html'
    });
  });

  it('creates a hospital waitlist lead and triggers non-blocking notifications', async () => {
    const lead = { _id: 'lead-id', ...validWaitlistPayload };
    HospitalWaitlist.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    HospitalWaitlist.create.mockResolvedValue(lead);

    const res = await request(app)
      .post('/api/v1/hospital-waitlist')
      .send(validWaitlistPayload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(HospitalWaitlist.create).toHaveBeenCalledWith(expect.objectContaining({
      facilityName: validWaitlistPayload.facilityName,
      emailKey: validWaitlistPayload.email,
      organizationKey: 'city general hospital|mumbai'
    }));
    expect(emailNotificationService.sendHospitalWaitlistConfirmation).toHaveBeenCalledWith(lead);
    expect(emailNotificationService.sendHospitalWaitlistAdminNotification).toHaveBeenCalledWith(lead);
  });

  it('returns a friendly duplicate waitlist response for repeated email or facility', async () => {
    HospitalWaitlist.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: 'existing-lead' })
    });

    const res = await request(app)
      .post('/api/v1/hospital-waitlist')
      .send(validWaitlistPayload);

    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);
    expect(res.body.message).toMatch(/already on the hospital waitlist/i);
    expect(HospitalWaitlist.create).not.toHaveBeenCalled();
  });

  it('silently suppresses honeypot spam submissions', async () => {
    const res = await request(app)
      .post('/api/v1/hospital-waitlist')
      .send({ ...validWaitlistPayload, companyWebsite: 'https://spam.example' });

    expect(res.status).toBe(204);
    expect(HospitalWaitlist.findOne).not.toHaveBeenCalled();
    expect(HospitalWaitlist.create).not.toHaveBeenCalled();
  });

  it('lists waitlist leads for the admin view', async () => {
    const lead = { _id: 'lead-id', ...validWaitlistPayload, status: 'new' };
    HospitalWaitlist.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([lead])
    });
    HospitalWaitlist.countDocuments.mockResolvedValue(1);
    HospitalWaitlist.aggregate.mockResolvedValue([{ _id: 'new', count: 1 }]);

    const res = await request(app).get('/api/v1/admin/funnel/waitlist');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.leads).toHaveLength(1);
    expect(res.body.summary.new).toBe(1);
  });
});
