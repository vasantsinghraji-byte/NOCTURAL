const mockSecurityAuditExportJob = {
  updateMany: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn()
};

jest.mock('../../../models/securityAuditExportJob', () => mockSecurityAuditExportJob);
jest.mock('../../../models/securityAuditEvent', () => ({
  create: jest.fn()
}));
jest.mock('../../../services/auditExportStorageService', () => ({
  deleteObject: jest.fn().mockResolvedValue(undefined),
  cleanupOrphanedObjects: jest.fn().mockResolvedValue(0)
}));
jest.mock('../../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  logSecurity: jest.fn()
}));
jest.mock('../../../utils/operationalMetrics', () => ({
  increment: jest.fn(),
  setGauge: jest.fn()
}));

const securityAuditService = require('../../../services/securityAuditService');
const operationalMetrics = require('../../../utils/operationalMetrics');

const chainLean = value => ({ lean: jest.fn().mockResolvedValue(value) });
const chainFind = value => ({
  sort: jest.fn(() => ({
    limit: jest.fn(() => ({
      lean: jest.fn().mockResolvedValue(value)
    }))
  }))
});

describe('Security audit export retry policy', () => {
  let setImmediateSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AUDIT_EXPORT_MAX_RETRY_ATTEMPTS = '3';
    setImmediateSpy = jest.spyOn(global, 'setImmediate').mockImplementation(() => 0);
  });

  afterEach(() => {
    delete process.env.AUDIT_EXPORT_MAX_RETRY_ATTEMPTS;
    delete process.env.AUDIT_EXPORT_RETRY_BACKOFF_MS;
    setImmediateSpy.mockRestore();
  });

  it('dead-letters exhausted failed jobs and schedules retryable jobs after nextRetryAt', async () => {
    const retryableJob = {
      _id: 'retryable-export-job',
      status: 'failed',
      attemptCount: 1,
      nextRetryAt: new Date(Date.now() - 1000)
    };
    mockSecurityAuditExportJob.updateMany.mockResolvedValue({ modifiedCount: 2 });
    mockSecurityAuditExportJob.find.mockReturnValue(chainFind([retryableJob]));
    mockSecurityAuditExportJob.findOneAndUpdate.mockReturnValue(chainLean({
      ...retryableJob,
      status: 'pending'
    }));

    const result = await securityAuditService.processPendingRetries({ limit: 5 });

    expect(result).toEqual({ scheduled: 1, deadLettered: 2 });
    expect(mockSecurityAuditExportJob.updateMany).toHaveBeenCalledWith(
      { status: 'failed', attemptCount: { $gte: 3 } },
      { $set: { status: 'dead_letter', nextRetryAt: null } }
    );
    expect(mockSecurityAuditExportJob.find).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      attemptCount: { $lt: 3 },
      nextRetryAt: { $lte: expect.any(Date) }
    }));
    expect(mockSecurityAuditExportJob.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: retryableJob._id,
        status: 'failed',
        attemptCount: { $lt: 3 }
      }),
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'pending' }),
        $unset: expect.objectContaining({ nextRetryAt: 1 })
      }),
      { new: true }
    );
    expect(operationalMetrics.increment).toHaveBeenCalledWith('security_audit_export_retry_limit_exhausted_total', 2);
    expect(operationalMetrics.increment).toHaveBeenCalledWith('security_audit_export_auto_retry_jobs_total', 1);
  });

  it('blocks manual retry while retry backoff is active', async () => {
    mockSecurityAuditExportJob.findOne.mockReturnValue(chainLean({
      _id: 'backoff-job',
      status: 'failed',
      attemptCount: 1,
      nextRetryAt: new Date(Date.now() + 60 * 1000)
    }));

    await expect(securityAuditService.retryExportJob({
      jobId: 'backoff-job',
      requestedBy: 'operator-user'
    })).rejects.toMatchObject({
      statusCode: 429,
      message: 'Audit export retry backoff is still active'
    });

    expect(operationalMetrics.increment).toHaveBeenCalledWith('security_audit_export_retry_backoff_blocked_total');
    expect(mockSecurityAuditExportJob.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('blocks manual retry after the max retry attempt limit', async () => {
    mockSecurityAuditExportJob.findOne.mockReturnValue(chainLean({
      _id: 'exhausted-job',
      status: 'failed',
      attemptCount: 3,
      nextRetryAt: new Date(Date.now() - 60 * 1000)
    }));

    await expect(securityAuditService.retryExportJob({
      jobId: 'exhausted-job',
      requestedBy: 'operator-user'
    })).rejects.toMatchObject({
      statusCode: 409,
      message: 'Audit export retry limit reached'
    });

    expect(operationalMetrics.increment).toHaveBeenCalledWith('security_audit_export_retry_blocked_total');
    expect(mockSecurityAuditExportJob.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
