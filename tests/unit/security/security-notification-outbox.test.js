jest.mock('../../../models/securityNotificationOutbox', () => ({
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn().mockResolvedValue({}),
  find: jest.fn()
}));
jest.mock('../../../services/securityNotificationService', () => ({
  deliverPasswordChanged: jest.fn()
}));
jest.mock('../../../utils/monitoring', () => ({
  triggerAlert: jest.fn()
}));
jest.mock('../../../utils/logger', () => ({
  error: jest.fn()
}));

const Outbox = require('../../../models/securityNotificationOutbox');
const delivery = require('../../../services/securityNotificationService');
const { encodePayload } = require('../../../services/securityNotificationPayloadCrypto');
const outboxService = require('../../../services/securityNotificationOutboxService');

describe('security notification outbox', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ENCRYPTION_KEY = require('crypto').createHash('sha256').update('test-encryption-key').digest('hex');
  });

  it('decrypts encrypted password-change payloads and marks delivery complete with retention', async () => {
    Outbox.findOneAndUpdate.mockResolvedValue({
      _id: 'outbox-1',
      event: 'PASSWORD_CHANGED',
      payloadEncrypted: encodePayload({ email: 'user@example.test' })
    });
    delivery.deliverPasswordChanged.mockResolvedValue();

    await expect(outboxService.processOne('outbox-1')).resolves.toBe(true);
    expect(delivery.deliverPasswordChanged).toHaveBeenCalledWith(expect.objectContaining({
      email: 'user@example.test',
      outboxId: 'outbox-1'
    }));
    expect(Outbox.updateOne).toHaveBeenCalledWith(
      { _id: 'outbox-1' },
      expect.objectContaining({ $set: expect.objectContaining({ status: 'COMPLETED', purgeAfter: expect.any(Date) }) })
    );
  });

  it('schedules retry when provider delivery fails', async () => {
    Outbox.findOneAndUpdate.mockResolvedValue({
      _id: 'outbox-1',
      event: 'PASSWORD_CHANGED',
      payload: {},
      attemptCount: 0,
      maxAttempts: 10
    });
    delivery.deliverPasswordChanged.mockRejectedValue(new Error('provider unavailable'));

    await expect(outboxService.processOne('outbox-1')).resolves.toBe(false);
    expect(Outbox.updateOne).toHaveBeenCalledWith(
      { _id: 'outbox-1' },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'RETRY_PENDING', attemptCount: 1 })
      })
    );
  });

  it('sets retention when moving a notification to dead letter', async () => {
    Outbox.findOneAndUpdate.mockResolvedValue({
      _id: 'outbox-1',
      event: 'PASSWORD_CHANGED',
      payload: {},
      attemptCount: 9,
      maxAttempts: 10
    });
    delivery.deliverPasswordChanged.mockRejectedValue(new Error('provider unavailable'));

    await expect(outboxService.processOne('outbox-1')).resolves.toBe(false);
    expect(Outbox.updateOne).toHaveBeenCalledWith(
      { _id: 'outbox-1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'DEAD_LETTER',
          attemptCount: 10,
          purgeAfter: expect.any(Date)
        })
      })
    );
  });
});
