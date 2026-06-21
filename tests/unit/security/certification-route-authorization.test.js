const mockPlatformAdminGate = jest.fn();
const mockHospitalAdminGate = jest.fn();

jest.mock('../../../middleware/auth', () => ({
  protect: jest.fn(),
  authorize: jest.fn(role => role === 'platform_admin' ? mockPlatformAdminGate : mockHospitalAdminGate)
}));

jest.mock('../../../models/certification', () => ({
  findById: jest.fn()
}));

const { ROLES } = require('../../../constants/roles');
const certificationRouter = require('../../../routes/certifications');

describe('certification verification authorization', () => {
  it('mounts verification behind the platform-admin gate, not the hospital-admin gate', () => {
    const route = certificationRouter.stack.find(
      item => item.route && item.route.path === '/:id/verify' && item.route.methods.post
    );
    const handlers = route.route.stack.map(item => item.handle);

    expect(handlers).toContain(mockPlatformAdminGate);
    expect(handlers).not.toContain(mockHospitalAdminGate);
    expect(ROLES.PLATFORM_ADMIN).toBe('platform_admin');
  });
});
