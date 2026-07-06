const mongoose = require('mongoose');

const mockHospitalAdminGate = jest.fn();
const mockOtherRoleGate = jest.fn();

jest.mock('../../../middleware/auth', () => ({
  protect: jest.fn(),
  authorize: jest.fn(role => role === 'admin' ? mockHospitalAdminGate : mockOtherRoleGate)
}));

jest.mock('../../../utils/pagination', () => ({
  paginationMiddleware: jest.fn((_req, _res, next) => next()),
  paginate: jest.fn()
}));

jest.mock('../../../models/review', () => ({
  getUserAverageRating: jest.fn()
}));

jest.mock('../../../models/duty', () => ({
  find: jest.fn(),
  findOne: jest.fn()
}));

jest.mock('../../../models/application', () => ({
  exists: jest.fn()
}));

const Review = require('../../../models/review');
const Duty = require('../../../models/duty');
const { paginate } = require('../../../utils/pagination');
const reviewsRouter = require('../../../routes/reviews');
const { mockRequest, mockResponse, mockNext } = require('../../helpers');

function getRoute(method, routePath) {
  return reviewsRouter.stack.find(
    item => item.route && item.route.path === routePath && item.route.methods[method]
  );
}

function getHandler(method, routePath) {
  const layer = getRoute(method, routePath);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

describe('review visibility authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    paginate.mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 10, total: 0 }
    });
    Review.getUserAverageRating.mockResolvedValue({
      avgRating: 0,
      totalReviews: 0,
      wouldRehirePercentage: 0
    });
  });

  it('keeps public user reviews restricted to PUBLIC visibility', async () => {
    const handler = getHandler('get', '/user/:userId');
    const userId = new mongoose.Types.ObjectId().toString();
    const res = mockResponse();

    await handler(mockRequest({
      params: { userId },
      pagination: { limit: 10 }
    }), res, mockNext());

    const reviewFilter = paginate.mock.calls[0][1];
    const averageFilter = Review.getUserAverageRating.mock.calls[0][1];

    expect(reviewFilter).toEqual({
      reviewedUser: expect.any(mongoose.Types.ObjectId),
      visibility: 'PUBLIC'
    });
    expect(reviewFilter.reviewedUser.toString()).toBe(userId);
    expect(averageFilter).toEqual({ visibility: 'PUBLIC' });
    expect(JSON.stringify(reviewFilter)).not.toContain('HOSPITAL_ONLY');
  });

  it('mounts hospital-only review lookup behind hospital admin authorization', () => {
    const handlers = getRoute('get', '/hospital/user/:userId').route.stack.map(item => item.handle);

    expect(handlers).toContain(mockHospitalAdminGate);
    expect(handlers).not.toContain(mockOtherRoleGate);
  });

  it('returns only hospital-only reviews tied to duties in the admin hospital scope', async () => {
    const handler = getHandler('get', '/hospital/user/:userId');
    const userId = new mongoose.Types.ObjectId().toString();
    const hospitalId = new mongoose.Types.ObjectId();
    const dutyIds = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
    Duty.find.mockReturnValue({
      distinct: jest.fn().mockResolvedValue(dutyIds)
    });
    const res = mockResponse();

    await handler(mockRequest({
      params: { userId },
      user: { _id: new mongoose.Types.ObjectId(), role: 'admin', hospitalId },
      pagination: { limit: 10 }
    }), res, mockNext());

    const reviewFilter = paginate.mock.calls[0][1];
    const averageFilter = Review.getUserAverageRating.mock.calls[0][1];

    expect(Duty.find).toHaveBeenCalledWith({ hospitalId });
    expect(reviewFilter).toEqual({
      reviewedUser: expect.any(mongoose.Types.ObjectId),
      visibility: 'HOSPITAL_ONLY',
      duty: { $in: dutyIds }
    });
    expect(reviewFilter.reviewedUser.toString()).toBe(userId);
    expect(averageFilter).toEqual(reviewFilter);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: []
    }));
  });

  it('rejects hospital-only lookup when the admin has no hospital scope', async () => {
    const handler = getHandler('get', '/hospital/user/:userId');
    const res = mockResponse();

    await handler(mockRequest({
      params: { userId: new mongoose.Types.ObjectId().toString() },
      user: { _id: new mongoose.Types.ObjectId(), role: 'admin' },
      pagination: { limit: 10 }
    }), res, mockNext());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(paginate).not.toHaveBeenCalled();
    expect(Duty.find).not.toHaveBeenCalled();
  });
});
