jest.mock('../../../middleware/auth', () => ({
  protect: jest.fn(),
  authorize: jest.fn(() => jest.fn())
}));

jest.mock('../../../models/certification', () => {
  const Certification = jest.fn();
  Certification.findOne = jest.fn();
  Certification.findById = jest.fn();
  Certification.prototype.save = jest.fn();
  return Certification;
});

jest.mock('../../../models/earning', () => {
  const Earning = jest.fn();
  Earning.prototype.generateInvoiceNumber = jest.fn();
  Earning.prototype.save = jest.fn();
  return Earning;
});

jest.mock('../../../models/shiftSeries', () => {
  const ShiftSeries = jest.fn();
  ShiftSeries.prototype.save = jest.fn();
  return ShiftSeries;
});

jest.mock('../../../models/review', () => {
  const Review = jest.fn();
  Review.getUserAverageRating = jest.fn();
  Review.prototype.save = jest.fn();
  return Review;
});

jest.mock('../../../models/duty', () => ({ findById: jest.fn(), findOne: jest.fn() }));
jest.mock('../../../models/application', () => ({ findById: jest.fn(), exists: jest.fn() }));
jest.mock('../../../models/analytics', () => ({ DoctorAnalytics: {} }));
jest.mock('../../../models/user', () => ({ findByIdAndUpdate: jest.fn() }));

const Certification = require('../../../models/certification');
const Earning = require('../../../models/earning');
const ShiftSeries = require('../../../models/shiftSeries');
const Review = require('../../../models/review');
const Duty = require('../../../models/duty');
const Application = require('../../../models/application');
const User = require('../../../models/user');
const certificationRouter = require('../../../routes/certifications');
const earningsRouter = require('../../../routes/earnings');
const shiftSeriesRouter = require('../../../routes/shiftSeries');
const reviewsRouter = require('../../../routes/reviews');
const pickAllowedFields = require('../../../utils/pickAllowedFields');
const { mockRequest, mockResponse, mockNext } = require('../../helpers');

function getHandler(router, method, routePath) {
  const layer = router.stack.find(
    item => item.route && item.route.path === routePath && item.route.methods[method]
  );
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

describe('sensitive model mass-assignment allowlists', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Review.getUserAverageRating.mockResolvedValue({ avgRating: 5 });
    User.findByIdAndUpdate.mockResolvedValue({});
    Duty.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: 'duty-1' }) });
    Application.exists.mockResolvedValue(true);
  });

  it('copies only explicitly allowed fields', () => {
    expect(pickAllowedFields({ name: 'Allowed', status: 'FORGED' }, ['name']))
      .toEqual({ name: 'Allowed' });
  });

  it('blocks protected certification fields on create', async () => {
    const handler = getHandler(certificationRouter, 'post', '/');
    const req = mockRequest({
      user: { _id: 'provider-1' },
      body: {
        name: 'BLS',
        type: 'CERTIFICATION',
        issuingAuthority: 'Authority',
        issueDate: '2026-01-01',
        user: 'attacker-selected-user',
        status: 'SUSPENDED',
        verificationStatus: 'VERIFIED',
        verifiedBy: 'attacker'
      }
    });

    await handler(req, mockResponse(), mockNext());

    expect(Certification).toHaveBeenCalledWith({
      name: 'BLS',
      type: 'CERTIFICATION',
      issuingAuthority: 'Authority',
      issueDate: '2026-01-01',
      user: 'provider-1'
    });
  });

  it('blocks protected certification fields on update', async () => {
    const handler = getHandler(certificationRouter, 'put', '/:id');
    const certification = {
      name: 'Old',
      verificationStatus: 'VERIFIED',
      verifiedBy: 'platform-admin',
      verifiedAt: new Date('2026-01-01'),
      set: jest.fn(function(updates) {
        Object.assign(this, updates);
      }),
      save: jest.fn()
    };
    Certification.findOne.mockResolvedValue(certification);
    const req = mockRequest({
      // Routes now validate ids via normalizeObjectId, so use a valid ObjectId.
      params: { id: 'aaaaaaaaaaaaaaaaaaaaaaaa' },
      user: { _id: 'provider-1' },
      body: {
        name: 'Updated',
        user: 'attacker-selected-user',
        verificationStatus: 'VERIFIED',
        verifiedBy: 'attacker'
      }
    });

    await handler(req, mockResponse(), mockNext());

    expect(certification).toEqual(expect.objectContaining({
      name: 'Updated',
      verificationStatus: 'PENDING'
    }));
    expect(certification).not.toHaveProperty('user');
    expect(certification.verifiedBy).toBeUndefined();
    expect(certification.verifiedAt).toBeUndefined();
    expect(certification.set).toHaveBeenCalledWith({ name: 'Updated' });
  });

  it('rejects invalid values in the dedicated verification workflow', async () => {
    const handler = getHandler(certificationRouter, 'post', '/:id/verify');
    const req = mockRequest({
      params: { id: 'cert-1' },
      user: { _id: 'platform-admin' },
      body: { verificationStatus: 'PENDING' }
    });
    const res = mockResponse();

    await handler(req, res, mockNext());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(Certification.findById).not.toHaveBeenCalled();
  });

  it('blocks protected earning fields while binding the tenant', async () => {
    const handler = getHandler(earningsRouter, 'post', '/');
    Duty.findById.mockResolvedValue({
      _id: 'duty-1',
      hospital: 'Hospital A',
      hospitalId: 'hospital-a'
    });
    Application.findById.mockResolvedValue({ duty: 'duty-1', applicant: 'provider-1' });
    const req = mockRequest({
      user: { _id: 'admin-1', hospital: 'Hospital A', hospitalId: 'hospital-a' },
      body: {
        user: 'provider-1',
        duty: 'duty-1',
        application: 'application-1',
        totalAmount: 1000,
        hospital: 'Hospital B',
        hospitalId: 'hospital-b',
        netAmount: 1,
        paymentStatus: 'PAID',
        invoiceNumber: 'FORGED'
      }
    });

    await handler(req, mockResponse(), mockNext());

    expect(Earning).toHaveBeenCalledWith({
      user: 'provider-1',
      duty: 'duty-1',
      application: 'application-1',
      totalAmount: 1000,
      hospitalId: 'hospital-a'
    });
  });

  it('blocks protected shift-series fields while binding ownership and tenant', async () => {
    const handler = getHandler(shiftSeriesRouter, 'post', '/');
    const req = mockRequest({
      user: { _id: 'admin-1', hospital: 'Hospital A', hospitalId: 'hospital-a' },
      body: {
        title: 'Allowed title',
        shifts: [{
          date: '2026-06-16',
          startTime: '08:00',
          endTime: '16:00',
          hourlyRate: 100,
          status: 'FILLED',
          dutyId: 'forged-duty'
        }],
        totalShifts: 99,
        hospitalId: 'hospital-b',
        postedBy: 'attacker',
        discountedRate: 1,
        totalCompensation: 1,
        status: 'FILLED',
        applicants: [{ user: 'attacker' }],
        createdDuties: true
      }
    });

    await handler(req, mockResponse(), mockNext());

    expect(ShiftSeries).toHaveBeenCalledWith({
      title: 'Allowed title',
      shifts: [{
        date: '2026-06-16',
        startTime: '08:00',
        endTime: '16:00',
        hourlyRate: 100
      }],
      totalShifts: 1,
      hospitalId: 'hospital-a',
      postedBy: 'admin-1'
    });
  });

  it('blocks protected review fields while binding the reviewer', async () => {
    const handler = getHandler(reviewsRouter, 'post', '/');
    // Valid ObjectIds — the route normalizes duty/reviewedUser via normalizeObjectId.
    const dutyId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
    const reviewedUserId = 'cccccccccccccccccccccccc';
    const req = mockRequest({
      user: { _id: 'admin-1', hospitalId: 'hospital-a' },
      body: {
        duty: dutyId,
        reviewedUser: reviewedUserId,
        rating: 5,
        visibility: 'PRIVATE',
        reviewer: 'attacker',
        verified: false,
        response: { comment: 'Forged response' },
        helpful: { count: 999 }
      }
    });

    await handler(req, mockResponse(), mockNext());

    // Only allowlisted fields reach the model; reviewer is bound to req.user
    // (not the attacker-supplied value); protected fields are dropped.
    expect(Review).toHaveBeenCalledTimes(1);
    const reviewArg = Review.mock.calls[0][0];
    expect(Object.keys(reviewArg).sort()).toEqual(['duty', 'rating', 'reviewedUser', 'reviewer']);
    expect(reviewArg.reviewer).toBe('admin-1');
    expect(reviewArg.rating).toBe(5);
    expect(String(reviewArg.duty)).toBe(dutyId);
    expect(String(reviewArg.reviewedUser)).toBe(reviewedUserId);
  });
});
