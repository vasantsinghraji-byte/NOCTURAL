const mockPlatformAdminGate = jest.fn();
const mockHospitalAdminGate = jest.fn();

jest.mock('../../../middleware/auth', () => ({
  protect: jest.fn(),
  authorize: jest.fn(role => role === 'platform_admin' ? mockPlatformAdminGate : mockHospitalAdminGate)
}));

jest.mock('../../../services/notificationService', () => ({
  createNotification: jest.fn()
}));

const { ROLES } = require('../../../constants/roles');
const notificationService = require('../../../services/notificationService');
const notificationRouter = require('../../../routes/notifications');
const { mockRequest, mockResponse, mockNext } = require('../../helpers');

function getHandler(method, routePath) {
  const layer = getRoute(method, routePath);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function getRoute(method, routePath) {
  return notificationRouter.stack.find(
    item => item.route && item.route.path === routePath && item.route.methods[method]
  );
}

describe('notification creation authorization', () => {
  const handler = getHandler('post', '/');

  beforeEach(() => {
    notificationService.createNotification.mockResolvedValue({ _id: 'notification-1' });
  });

  it('restricts the creation route to platform administrators', () => {
    const mountedHandlers = getRoute('post', '/').route.stack.map(item => item.handle);

    expect(mountedHandlers).toContain(mockPlatformAdminGate);
    expect(mountedHandlers).not.toContain(mockHospitalAdminGate);
    expect(ROLES.PLATFORM_ADMIN).toBe('platform_admin');
  });

  it('requires an explicit recipient', async () => {
    const res = mockResponse();

    await handler(mockRequest({ body: {}, user: { role: ROLES.PLATFORM_ADMIN } }), res, mockNext());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(notificationService.createNotification).not.toHaveBeenCalled();
  });

  it('prevents callers from impersonating arbitrary notification types and delivery settings', async () => {
    const res = mockResponse();
    const req = mockRequest({
      user: { role: ROLES.PLATFORM_ADMIN },
      body: {
        userId: 'recipient-1',
        type: 'PAYMENT_RECEIVED',
        title: 'Maintenance',
        message: 'Scheduled maintenance',
        actionUrl: '/roles/doctor/doctor-dashboard.html',
        priority: 'URGENT',
        channels: { push: true, email: true }
      }
    });

    await handler(req, res, mockNext());

    expect(notificationService.createNotification).toHaveBeenCalledWith({
      user: 'recipient-1',
      recipientModel: 'User',
      type: 'SYSTEM_ANNOUNCEMENT',
      title: 'Maintenance',
      message: 'Scheduled maintenance',
      actionUrl: '/roles/doctor/doctor-dashboard.html',
      priority: 'MEDIUM',
      channels: { inApp: true }
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
