const sendEachForMulticast = jest.fn();
const initializeApp = jest.fn();
const getApps = jest.fn(() => []);
const getMessaging = jest.fn(() => ({ sendEachForMulticast }));

jest.mock('firebase-admin/app', () => ({
  applicationDefault: jest.fn(() => 'application-default-credential'),
  getApps,
  initializeApp
}));

jest.mock('firebase-admin/messaging', () => ({
  getMessaging
}));

jest.mock('../../../services/mobileDeviceService', () => ({
  getEnabledTokens: jest.fn(),
  disableTokens: jest.fn()
}));

jest.mock('../../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn()
}));

const mobileDeviceService = require('../../../services/mobileDeviceService');
const pushNotificationService = require('../../../services/pushNotificationService');

describe('push notification service', () => {
  const originalEnabled = process.env.FIREBASE_PUSH_ENABLED;

  beforeEach(() => {
    jest.clearAllMocks();
    getApps.mockReturnValue([]);
    getMessaging.mockReturnValue({ sendEachForMulticast });
    delete process.env.FIREBASE_PUSH_ENABLED;
  });

  afterAll(() => {
    process.env.FIREBASE_PUSH_ENABLED = originalEnabled;
  });

  it('does not initialize Firebase unless push is explicitly enabled', async () => {
    const result = await pushNotificationService.sendToOwner({
      owner: 'user-1',
      userType: 'provider',
      title: 'Title',
      body: 'Body'
    });

    expect(result.error).toBe('Firebase push is disabled');
    expect(initializeApp).not.toHaveBeenCalled();
    expect(mobileDeviceService.getEnabledTokens).not.toHaveBeenCalled();
  });

  it('sends to enabled devices and disables invalid registration tokens', async () => {
    process.env.FIREBASE_PUSH_ENABLED = 'true';
    mobileDeviceService.getEnabledTokens.mockResolvedValue(['valid-token', 'invalid-token']);
    sendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 1,
      responses: [
        { success: true },
        {
          success: false,
          error: { code: 'messaging/registration-token-not-registered' }
        }
      ]
    });

    const result = await pushNotificationService.sendToOwner({
      owner: 'user-1',
      userType: 'provider',
      title: 'Title',
      body: 'Body',
      data: { notificationId: 123 }
    });

    expect(sendEachForMulticast).toHaveBeenCalledWith(expect.objectContaining({
      tokens: ['valid-token', 'invalid-token'],
      data: { notificationId: '123' }
    }));
    expect(mobileDeviceService.disableTokens).toHaveBeenCalledWith(['invalid-token']);
    expect(result).toEqual({
      sentCount: 1,
      failedCount: 1,
      error: '1 push notification(s) failed'
    });
  });
});
