const mongoose = require('mongoose');
const SecurityAuditExportJob = require('../../../models/securityAuditExportJob');
const SecurityAuditEvent = require('../../../models/securityAuditEvent');
const securityAuditService = require('../../../services/securityAuditService');

describe('Security audit export quota integration', () => {
  let databaseAvailable = false;
  let operatorId;
  const originalEnv = {
    AUDIT_EXPORT_OPERATOR_ACTIVE_LIMIT: process.env.AUDIT_EXPORT_OPERATOR_ACTIVE_LIMIT,
    AUDIT_EXPORT_OPERATOR_DAILY_LIMIT: process.env.AUDIT_EXPORT_OPERATOR_DAILY_LIMIT
  };

  beforeAll(async () => {
    process.env.AUDIT_EXPORT_OPERATOR_ACTIVE_LIMIT = '1';
    process.env.AUDIT_EXPORT_OPERATOR_DAILY_LIMIT = '2';
    operatorId = new mongoose.Types.ObjectId();

    if (mongoose.connection.readyState === 0) {
      try {
        await mongoose.connect(process.env.MONGODB_URI, {
          serverSelectionTimeoutMS: Number(process.env.TEST_MONGO_SERVER_SELECTION_TIMEOUT_MS) || 3000
        });
        databaseAvailable = true;
      } catch (error) {
        databaseAvailable = false;
        if (process.env.RUN_AUDIT_EXPORT_QUOTA_REAL_DB === 'true') {
          throw error;
        }
        console.warn(`Skipping audit export quota integration test: MongoDB unavailable (${error.message})`);
      }
    } else {
      databaseAvailable = true;
    }
  });

  beforeEach(async () => {
    if (!databaseAvailable) return;
    await SecurityAuditExportJob.deleteMany({ requestedBy: operatorId });
    await SecurityAuditEvent.deleteMany({ actorId: String(operatorId) });
  });

  afterEach(async () => {
    if (!databaseAvailable) return;
    await SecurityAuditExportJob.deleteMany({ requestedBy: operatorId });
    await SecurityAuditEvent.deleteMany({ actorId: String(operatorId) });
  });

  afterAll(async () => {
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
    if (databaseAvailable && mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  it('blocks export creation when the operator active-job quota is exhausted in MongoDB', async () => {
    if (!databaseAvailable) return;
    await SecurityAuditExportJob.create({
      requestedBy: operatorId,
      status: 'pending',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });

    await expect(securityAuditService.createExportJob({
      filters: { events: ['webauthn_passkey_revoked'] },
      requestedBy: operatorId
    })).rejects.toMatchObject({
      statusCode: 429,
      message: 'Audit export active-job quota exceeded'
    });

    const quota = await securityAuditService.getExportQuotaUsage({ requestedBy: operatorId });
    expect(quota.active).toMatchObject({ used: 1, limit: 1, remaining: 0 });
  });

  it('blocks export creation when the operator daily quota is exhausted in MongoDB', async () => {
    if (!databaseAvailable) return;
    await SecurityAuditExportJob.create([
      {
        requestedBy: operatorId,
        status: 'completed',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000)
      },
      {
        requestedBy: operatorId,
        status: 'cancelled',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000)
      }
    ]);

    await expect(securityAuditService.createExportJob({
      filters: { events: ['webauthn_passkey_revoked'] },
      requestedBy: operatorId
    })).rejects.toMatchObject({
      statusCode: 429,
      message: 'Audit export daily quota exceeded'
    });

    const quota = await securityAuditService.getExportQuotaUsage({ requestedBy: operatorId });
    expect(quota.daily).toMatchObject({ used: 2, limit: 2, remaining: 0 });
  });
});
