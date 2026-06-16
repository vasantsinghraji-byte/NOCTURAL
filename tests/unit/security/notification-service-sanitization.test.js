jest.mock('../../../models/notification', () => ({
  createNotification: jest.fn(async (data) => ({ _id: 'notif-1', ...data }))
}));

jest.mock('../../../services/pushNotificationService', () => ({
  sendToOwner: jest.fn()
}));

jest.mock('../../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

const Notification = require('../../../models/notification');
const logger = require('../../../utils/logger');
const notificationService = require('../../../services/notificationService');

describe('notification service input sanitization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Notification.createNotification.mockImplementation(async (data) => ({ _id: 'notif-1', ...data }));
  });

  describe('sanitizeText', () => {
    it('strips a <script> payload from free-text fields', () => {
      const result = notificationService.sanitizeText('Hello<script>alert(1)</script> world');
      // Tags are removed; any inner text remains only as inert plain text (no markup).
      expect(result).toBe('Helloalert(1) world');
      expect(result).not.toMatch(/[<>]/);
    });

    it('removes inline event-handler tags and null bytes', () => {
      expect(notificationService.sanitizeText('<img src=x onerror=alert(1)>safe')).toBe('safe');
      expect(notificationService.sanitizeText('clean\0 text')).toBe('clean text');
    });

    it('leaves plain text untouched and passes through non-strings', () => {
      expect(notificationService.sanitizeText('Payment received')).toBe('Payment received');
      expect(notificationService.sanitizeText(undefined)).toBeUndefined();
    });
  });

  describe('sanitizeActionUrl', () => {
    it('rejects absolute, protocol-relative, and javascript: URLs', () => {
      expect(notificationService.sanitizeActionUrl('https://evil.example.com')).toBeUndefined();
      expect(notificationService.sanitizeActionUrl('//evil.example.com')).toBeUndefined();
      expect(notificationService.sanitizeActionUrl('javascript:alert(1)')).toBeUndefined();
      expect(notificationService.sanitizeActionUrl('/\\evil.example.com')).toBeUndefined();
      expect(notificationService.sanitizeActionUrl('/\t/evil.example.com')).toBeUndefined();
      expect(notificationService.sanitizeActionUrl('/\n/evil.example.com')).toBeUndefined();
      expect(notificationService.sanitizeActionUrl('/\r/evil.example.com')).toBeUndefined();
      expect(notificationService.sanitizeActionUrl('/not-an-allowlisted-path')).toBeUndefined();
    });

    it('allows internal root-relative paths', () => {
      expect(notificationService.sanitizeActionUrl('/roles/doctor/my-applications.html?id=1'))
        .toBe('/roles/doctor/my-applications.html?id=1');
    });
  });

  describe('createNotification', () => {
    it('persists sanitized title, message, and actionUrl', async () => {
      await notificationService.createNotification({
        user: 'user-1',
        type: 'SYSTEM_ANNOUNCEMENT',
        title: 'Hi<script></script>',
        message: '<b>bold</b> update',
        actionUrl: 'https://evil.example.com'
      });

      expect(Notification.createNotification).toHaveBeenCalledTimes(1);
      const persisted = Notification.createNotification.mock.calls[0][0];
      expect(persisted.title).toBe('Hi');
      expect(persisted.message).toBe('bold update');
      expect(persisted.actionUrl).toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(
        'Rejected non-internal notification actionUrl',
        expect.objectContaining({ actionUrl: 'https://evil.example.com' })
      );
    });
  });
});
