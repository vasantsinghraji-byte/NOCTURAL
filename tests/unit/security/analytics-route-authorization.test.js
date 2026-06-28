const mongoose = require('mongoose');

const mockPlatformAdminGate = jest.fn();
const mockHospitalAdminGate = jest.fn();
const mockAnalyticsSave = jest.fn();

function MockDoctorAnalytics(data) {
  Object.assign(this, data);
  this.applicationStats = {};
  this.save = mockAnalyticsSave;
}

MockDoctorAnalytics.findOne = jest.fn();

jest.mock('../../../middleware/auth', () => ({
  protect: jest.fn(),
  authorize: jest.fn(role => role === 'platform_admin' ? mockPlatformAdminGate : mockHospitalAdminGate)
}));

jest.mock('../../../models/analytics', () => ({
  DoctorAnalytics: MockDoctorAnalytics,
  HospitalAnalytics: {
    findOne: jest.fn()
  }
}));

jest.mock('../../../models/application', () => ({
  aggregate: jest.fn(),
  countDocuments: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn()
}));

jest.mock('../../../models/duty', () => ({
  findById: jest.fn(),
  find: jest.fn()
}));

jest.mock('../../../models/hospitalSettings', () => ({
  getOrCreateSettings: jest.fn()
}));

const { ROLES } = require('../../../constants/roles');
const Application = require('../../../models/application');
const { DoctorAnalytics } = require('../../../models/analytics');
const legacyAnalyticsRouter = require('../../../routes/analytics');
const optimizedAnalyticsRouter = require('../../../routes/analyticsOptimized');
const { mockRequest, mockResponse, mockNext } = require('../../helpers');

function getRoute(router, method, routePath) {
  return router.stack.find(
    item => item.route && item.route.path === routePath && item.route.methods[method]
  );
}

function getHandler(router, method, routePath) {
  const layer = getRoute(router, method, routePath);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

describe.each([
  ['legacy analytics route', legacyAnalyticsRouter],
  ['optimized analytics route', optimizedAnalyticsRouter]
])('%s doctor update authorization', (_routeName, analyticsRouter) => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAnalyticsSave.mockResolvedValue();
    Application.aggregate.mockResolvedValue([{
      statusCounts: [{ _id: 'ACCEPTED', count: 1 }],
      totalCount: [{ total: 1 }],
      applicationsWithDuty: [{ responseTime: 20 }]
    }]);
  });

  it('restricts arbitrary doctor analytics mutation to platform administrators', () => {
    const mountedHandlers = getRoute(analyticsRouter, 'post', '/update-doctor/:userId').route.stack.map(item => item.handle);

    expect(mountedHandlers).toContain(mockPlatformAdminGate);
    expect(mountedHandlers).not.toContain(mockHospitalAdminGate);
    expect(ROLES.PLATFORM_ADMIN).toBe('platform_admin');
  });

  it('rejects invalid target user ids before analytics mutation', async () => {
    const handler = getHandler(analyticsRouter, 'post', '/update-doctor/:userId');
    const res = mockResponse();

    await handler(mockRequest({ params: { userId: 'not-an-object-id' } }), res, mockNext());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Invalid user ID'
    });
    expect(DoctorAnalytics.findOne).not.toHaveBeenCalled();
    expect(Application.aggregate).not.toHaveBeenCalled();
  });

  it('casts the target user id before querying analytics and application aggregates', async () => {
    const handler = getHandler(analyticsRouter, 'post', '/update-doctor/:userId');
    const userId = new mongoose.Types.ObjectId().toString();
    const analytics = {
      applicationStats: {},
      save: jest.fn().mockResolvedValue()
    };
    DoctorAnalytics.findOne.mockResolvedValue(analytics);
    const res = mockResponse();

    await handler(mockRequest({ params: { userId } }), res, mockNext());

    const analyticsFilter = DoctorAnalytics.findOne.mock.calls[0][0];
    const aggregateMatch = Application.aggregate.mock.calls[0][0][0].$match;

    expect(analyticsFilter.user).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(analyticsFilter.user.toString()).toBe(userId);
    expect(aggregateMatch.applicant).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(aggregateMatch.applicant.toString()).toBe(userId);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: 'Analytics updated successfully'
    }));
  });
});
