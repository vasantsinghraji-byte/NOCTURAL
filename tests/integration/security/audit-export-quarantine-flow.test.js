const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../../../app');
const SecurityAuditExportJob = require('../../../models/securityAuditExportJob');
const SecurityAuditEvent = require('../../../models/securityAuditEvent');
const SecurityAuditLifecycleReportJob = require('../../../models/securityAuditLifecycleReportJob');
const User = require('../../../models/user');
const securityAuditService = require('../../../services/securityAuditService');
const { ROLES } = require('../../../constants/roles');
const { generateAccessToken, IDENTITY_TYPES } = require('../../../utils/authTokens');

describe('Security audit export quarantine flow integration', () => {
  let databaseAvailable = false;
  let operatorA;
  let operatorB;
  let operatorC;
  const originalEnv = {
    AUDIT_EXPORT_QUARANTINE_MAX_AGE_HOURS: process.env.AUDIT_EXPORT_QUARANTINE_MAX_AGE_HOURS,
    AUDIT_EXPORT_QUARANTINE_INVESTIGATION_SLA_HOURS: process.env.AUDIT_EXPORT_QUARANTINE_INVESTIGATION_SLA_HOURS,
    AUDIT_EXPORT_OPERATOR_APPROVAL_EMAILS: process.env.AUDIT_EXPORT_OPERATOR_APPROVAL_EMAILS,
    AUDIT_EXPORT_OPERATOR_SLACK_WEBHOOK_URL: process.env.AUDIT_EXPORT_OPERATOR_SLACK_WEBHOOK_URL,
    JWT_SECRET: process.env.JWT_SECRET
  };

  beforeAll(async () => {
    process.env.AUDIT_EXPORT_QUARANTINE_MAX_AGE_HOURS = '1';
    process.env.AUDIT_EXPORT_QUARANTINE_INVESTIGATION_SLA_HOURS = '1';
    delete process.env.AUDIT_EXPORT_OPERATOR_APPROVAL_EMAILS;
    delete process.env.AUDIT_EXPORT_OPERATOR_SLACK_WEBHOOK_URL;
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'audit-export-quarantine-flow-test-secret';
    operatorA = new mongoose.Types.ObjectId();
    operatorB = new mongoose.Types.ObjectId();
    operatorC = new mongoose.Types.ObjectId();

    if (mongoose.connection.readyState === 0) {
      try {
        await mongoose.connect(process.env.MONGODB_URI, {
          serverSelectionTimeoutMS: Number(process.env.TEST_MONGO_SERVER_SELECTION_TIMEOUT_MS) || 3000
        });
        databaseAvailable = true;
      } catch (error) {
        databaseAvailable = false;
        if (process.env.RUN_AUDIT_EXPORT_QUARANTINE_FLOW_REAL_DB === 'true') {
          throw error;
        }
        console.warn(`Skipping audit export quarantine flow integration test: MongoDB unavailable (${error.message})`);
      }
    } else {
      databaseAvailable = true;
    }
  });

  beforeEach(async () => {
    if (!databaseAvailable) return;
    await SecurityAuditExportJob.deleteMany({ requestedBy: { $in: [operatorA, operatorB, operatorC] } });
    await SecurityAuditLifecycleReportJob.deleteMany({ requestedBy: { $in: [operatorA, operatorB, operatorC] } });
    await SecurityAuditEvent.deleteMany({ targetType: 'security_audit_export' });
    await User.deleteMany({ _id: { $in: [operatorA, operatorB, operatorC] } });
  });

  afterEach(async () => {
    if (!databaseAvailable) return;
    await SecurityAuditExportJob.deleteMany({ requestedBy: { $in: [operatorA, operatorB, operatorC] } });
    await SecurityAuditLifecycleReportJob.deleteMany({ requestedBy: { $in: [operatorA, operatorB, operatorC] } });
    await SecurityAuditEvent.deleteMany({ targetType: 'security_audit_export' });
    await User.deleteMany({ _id: { $in: [operatorA, operatorB, operatorC] } });
  });

  afterAll(() => {
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  });

  it('requires a second operator before a quarantined export can be released', async () => {
    if (!databaseAvailable) return;
    const job = await SecurityAuditExportJob.create({
      requestedBy: operatorA,
      status: 'quarantined',
      completedAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });

    const requested = await securityAuditService.releaseQuarantinedExportJob({
      jobId: job._id,
      requestedBy: operatorA,
      investigationNote: 'Checksum mismatch investigated and approved for second review.'
    });

    expect(requested.status).toBe('quarantined');
    expect(requested.quarantineInvestigation.status).toBe('release_requested');
    expect(requested.quarantineInvestigation.history).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'release_requested',
        note: 'Checksum mismatch investigated and approved for second review.'
      })
    ]));

    await expect(securityAuditService.approveQuarantinedExportRelease({
      jobId: job._id,
      requestedBy: operatorA,
      investigationNote: 'Self approval should fail.'
    })).rejects.toMatchObject({
      statusCode: 409
    });

    const approved = await securityAuditService.approveQuarantinedExportRelease({
      jobId: job._id,
      requestedBy: operatorB,
      investigationNote: 'Second operator approves release.'
    });

    expect(approved.status).toBe('completed');
    expect(approved.quarantineInvestigation.status).toBe('released');
    expect(approved.quarantineInvestigation.releaseRequestedBy).toEqual(operatorA);
    expect(approved.quarantineInvestigation.releaseApprovedBy).toEqual(operatorB);
    expect(approved.quarantineInvestigation.history).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'release_approved', note: 'Second operator approves release.' })
    ]));
  });

  it('auto-deletes unreleased quarantined exports after max-age policy expiry', async () => {
    if (!databaseAvailable) return;
    const job = await SecurityAuditExportJob.create({
      requestedBy: operatorA,
      status: 'quarantined',
      completedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });

    const result = await securityAuditService.cleanupOverageQuarantinedExports();
    expect(result.deletedCount).toBe(1);

    const updated = await SecurityAuditExportJob.findById(job._id).lean();
    expect(updated.status).toBe('deleted');
    expect(updated.quarantineInvestigation.resolution).toBe('deleted');
    expect(updated.quarantineInvestigation.history).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'auto_deleted' })
    ]));
  });

  it('supports dry-run and deletion through the stale quarantine delete endpoint', async () => {
    if (!databaseAvailable) return;
    await User.create({
      _id: operatorA,
      name: 'Audit Operator A',
      email: 'audit.operator.a@example.test',
      password: 'OperatorPassword@123',
      role: ROLES.PLATFORM_ADMIN
    });
    const token = generateAccessToken(operatorA, IDENTITY_TYPES.USER, 0);
    const staleCompletedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const jobs = await SecurityAuditExportJob.create([
      {
        requestedBy: operatorA,
        status: 'quarantined',
        completedAt: staleCompletedAt,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000)
      },
      {
        requestedBy: operatorA,
        status: 'quarantined',
        completedAt: staleCompletedAt,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000)
      }
    ]);

    const dryRunResponse = await request(app)
      .post('/api/v1/admin/security-audit/exports/quarantine/stale/delete')
      .set('Authorization', `Bearer ${token}`)
      .send({
        dryRun: true,
        investigationNote: 'Preview stale quarantine cleanup.'
      });

    expect(dryRunResponse.status).toBe(200);
    expect(dryRunResponse.body.success).toBe(true);
    expect(dryRunResponse.body.dryRun).toBe(true);
    expect(dryRunResponse.body.candidateCount).toBe(2);
    expect(dryRunResponse.body.deletedCount).toBe(0);
    expect(dryRunResponse.body.candidateIds).toEqual(expect.arrayContaining(jobs.map(job => String(job._id))));

    const afterDryRun = await SecurityAuditExportJob.find({ _id: { $in: jobs.map(job => job._id) } }).lean();
    expect(afterDryRun.every(job => job.status === 'quarantined')).toBe(true);

    const deleteResponse = await request(app)
      .post('/api/v1/admin/security-audit/exports/quarantine/stale/delete')
      .set('Authorization', `Bearer ${token}`)
      .send({
        investigationNote: 'Bulk stale quarantine cleanup approved.'
      });

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.success).toBe(true);
    expect(deleteResponse.body.dryRun).toBe(false);
    expect(deleteResponse.body.candidateCount).toBe(2);
    expect(deleteResponse.body.deletedCount).toBe(2);

    const afterDelete = await SecurityAuditExportJob.find({ _id: { $in: jobs.map(job => job._id) } }).lean();
    expect(afterDelete.every(job => job.status === 'deleted')).toBe(true);
    expect(afterDelete).toEqual(expect.arrayContaining([
      expect.objectContaining({
        quarantineInvestigation: expect.objectContaining({
          resolution: 'deleted',
          history: expect.arrayContaining([
            expect.objectContaining({
              action: 'delete_confirmed',
              note: 'Bulk stale quarantine cleanup approved.'
            })
          ])
        })
      })
    ]));
  });

  it('rate-limits stale quarantine bulk delete requests from a non-loopback client IP', async () => {
    if (!databaseAvailable) return;
    await User.create({
      _id: operatorC,
      name: 'Audit Operator C',
      email: 'audit.operator.c@example.test',
      password: 'OperatorPassword@123',
      role: ROLES.PLATFORM_ADMIN
    });
    const token = generateAccessToken(operatorC, IDENTITY_TYPES.USER, 0);
    await SecurityAuditExportJob.create({
      requestedBy: operatorC,
      status: 'quarantined',
      completedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });

    const sendDryRun = () => request(app)
      .post('/api/v1/admin/security-audit/exports/quarantine/stale/delete')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Forwarded-For', '203.0.113.44')
      .send({ dryRun: true });

    expect((await sendDryRun()).status).toBe(200);
    expect((await sendDryRun()).status).toBe(200);
    expect((await sendDryRun()).status).toBe(200);

    const rateLimited = await sendDryRun();
    expect(rateLimited.status).toBe(429);
    expect(rateLimited.body.success).toBe(false);
  });

  it('creates a signed quarantine approval-history report job through the backend route', async () => {
    if (!databaseAvailable) return;
    await User.create({
      _id: operatorB,
      name: 'Audit Operator B',
      email: 'audit.operator.b@example.test',
      password: 'OperatorPassword@123',
      role: ROLES.PLATFORM_ADMIN
    });
    const token = generateAccessToken(operatorB, IDENTITY_TYPES.USER, 0);
    const job = await SecurityAuditExportJob.create({
      requestedBy: operatorA,
      status: 'quarantined',
      completedAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      quarantineInvestigation: {
        status: 'release_requested',
        releaseRequestedBy: operatorA,
        releaseRequestedAt: new Date(),
        history: [
          {
            action: 'release_requested',
            actor: operatorA,
            actorType: 'user',
            note: 'Investigated checksum mismatch.',
            createdAt: new Date()
          }
        ]
      }
    });

    const createResponse = await request(app)
      .post(`/api/v1/admin/security-audit/exports/${job._id}/quarantine/approval-history/report`)
      .set('Authorization', `Bearer ${token}`)
      .send();

    expect(createResponse.status).toBe(202);
    expect(createResponse.body.success).toBe(true);
    expect(createResponse.body.report.reportType).toBe('quarantine_approval_history');

    let reportJob;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      reportJob = await SecurityAuditLifecycleReportJob.findById(createResponse.body.report.id).lean();
      if (reportJob?.status === 'completed') break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    expect(reportJob.status).toBe('completed');
    expect(reportJob.rowCount).toBe(1);
  });
});
