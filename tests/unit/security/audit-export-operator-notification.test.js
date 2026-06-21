const mockUser = {
  find: jest.fn()
};
const mockEmailNotificationService = {
  sendAuditExportReleaseApprovalRequest: jest.fn()
};
const mockOperationalMetrics = {
  increment: jest.fn()
};
const mockLogger = {
  warn: jest.fn()
};

jest.mock('../../../models/user', () => mockUser);
jest.mock('../../../services/emailNotificationService', () => mockEmailNotificationService);
jest.mock('../../../utils/operationalMetrics', () => mockOperationalMetrics);
jest.mock('../../../utils/logger', () => mockLogger);

const chainUsers = users => ({
  select: jest.fn(() => ({
    lean: jest.fn().mockResolvedValue(users)
  }))
});

describe('Audit export operator notification service', () => {
  let originalSlackWebhook;
  let originalFallbackEmails;
  let originalFetch;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    originalSlackWebhook = process.env.AUDIT_EXPORT_OPERATOR_SLACK_WEBHOOK_URL;
    originalFallbackEmails = process.env.AUDIT_EXPORT_OPERATOR_APPROVAL_EMAILS;
    originalFetch = global.fetch;
    process.env.AUDIT_EXPORT_OPERATOR_SLACK_WEBHOOK_URL = 'https://slack.example.test/webhook';
    delete process.env.AUDIT_EXPORT_OPERATOR_APPROVAL_EMAILS;
    mockUser.find.mockReturnValue(chainUsers([]));
    mockEmailNotificationService.sendAuditExportReleaseApprovalRequest.mockResolvedValue({ sent: false, skipped: true });
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    if (originalSlackWebhook === undefined) delete process.env.AUDIT_EXPORT_OPERATOR_SLACK_WEBHOOK_URL;
    else process.env.AUDIT_EXPORT_OPERATOR_SLACK_WEBHOOK_URL = originalSlackWebhook;
    if (originalFallbackEmails === undefined) delete process.env.AUDIT_EXPORT_OPERATOR_APPROVAL_EMAILS;
    else process.env.AUDIT_EXPORT_OPERATOR_APPROVAL_EMAILS = originalFallbackEmails;
    global.fetch = originalFetch;
  });

  it('posts pending release approval notifications to Slack with export context', async () => {
    const service = require('../../../services/auditExportOperatorNotificationService');

    const result = await service.notifyQuarantineReleaseRequested({
      exportJobId: 'export-job-123',
      requestedBy: 'operator-a'
    });

    expect(result.failures).toBe(0);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://slack.example.test/webhook',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('export-job-123')
      })
    );
    expect(global.fetch.mock.calls[0][1].body).toContain('operator-a');
    expect(mockOperationalMetrics.increment).toHaveBeenCalledWith('security_audit_export_release_approval_notifications_total');
    expect(mockOperationalMetrics.increment).toHaveBeenCalledWith('security_audit_export_release_approval_notifications_sent_total', 1);
  });

  it('records notification failures without throwing to the release workflow', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    const service = require('../../../services/auditExportOperatorNotificationService');

    const result = await service.notifyQuarantineReleaseRequested({
      exportJobId: 'export-job-456',
      requestedBy: 'operator-a'
    });

    expect(result.failures).toBe(1);
    expect(mockOperationalMetrics.increment).toHaveBeenCalledWith(
      'security_audit_export_release_approval_notification_failures_total',
      1
    );
    expect(mockLogger.warn).toHaveBeenCalled();
  });
});
