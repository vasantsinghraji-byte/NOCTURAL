/* eslint-disable security/detect-non-literal-fs-filename -- Audit exports write CSV files to a configured runtime export directory. */
const fs = require('fs');
const fsPromises = require('fs').promises;
const os = require('os');
const path = require('path');
const { finished } = require('stream/promises');
const SecurityAuditEvent = require('../models/securityAuditEvent');
const logger = require('../utils/logger');
const mongoose = require('mongoose');
const operationalMetrics = require('../utils/operationalMetrics');

const unavailableExportDependency = (name) => new Proxy({}, {
  get(_target, property) {
    if (property === 'then') return undefined;
    return () => {
      throw new Error(`${name} is provided by the audit export module`);
    };
  }
});

const optionalExportRequire = (modulePath, name) => {
  try {
    return require(modulePath);
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND' && error.message.includes(modulePath)) {
      return unavailableExportDependency(name);
    }
    throw error;
  }
};

const SecurityAuditExportJob = optionalExportRequire('../models/securityAuditExportJob', 'SecurityAuditExportJob');
const SecurityAuditLifecycleReportJob = optionalExportRequire('../models/securityAuditLifecycleReportJob', 'SecurityAuditLifecycleReportJob');
const auditExportStorageService = optionalExportRequire('./auditExportStorageService', 'auditExportStorageService');
const auditExportOperatorNotificationService = optionalExportRequire(
  './auditExportOperatorNotificationService',
  'auditExportOperatorNotificationService'
);

const EXPORT_COLUMNS = ['createdAt', 'event', 'actorType', 'actorId', 'targetType', 'targetId', 'outcome', 'ipAddress', 'userAgent', 'metadata'];
const AUDIT_EXPORT_EVENTS = {
  CREATED: 'security_audit_export_created',
  DOWNLOADED: 'security_audit_export_downloaded',
  CANCELLED: 'security_audit_export_cancelled',
  RETRIED: 'security_audit_export_retried',
  CHECKSUM_MISMATCH: 'security_audit_export_checksum_mismatch',
  CLEANUP_DELETED: 'security_audit_export_cleanup_deleted',
  QUARANTINE_RELEASE_REQUESTED: 'security_audit_export_quarantine_release_requested',
  QUARANTINE_RELEASED: 'security_audit_export_quarantine_released',
  QUARANTINE_DELETED: 'security_audit_export_quarantine_deleted',
  LIFECYCLE_REPORT_CREATED: 'security_audit_export_lifecycle_report_created',
  LIFECYCLE_REPORT_DOWNLOADED: 'security_audit_export_lifecycle_report_downloaded',
  QUARANTINE_APPROVAL_HISTORY_REPORT_CREATED: 'security_audit_export_quarantine_approval_history_report_created',
  QUARANTINE_APPROVAL_HISTORY_REPORT_DOWNLOADED: 'security_audit_export_quarantine_approval_history_report_downloaded'
};

const sanitizeMetadata = (metadata = {}) => {
  const sanitized = { ...metadata };
  for (const key of ['token', 'refreshToken', 'password', 'currentPassword', 'newPassword', 'recoveryCode']) {
    delete sanitized[key];
  }
  return sanitized;
};

const buildQuery = ({ events, actorId, actorType, targetType, targetId, outcome } = {}) => {
  const query = {};

  if (Array.isArray(events) && events.length > 0) query.event = { $in: events };
  if (actorId) query.actorId = actorId;
  if (actorType) query.actorType = actorType;
  if (targetType) query.targetType = targetType;
  if (targetId) query.targetId = targetId;
  if (outcome) query.outcome = outcome;

  return query;
};

const exportDirectory = () => process.env.AUDIT_EXPORT_DIR ||
  path.join(os.tmpdir(), 'nocturnal-audit-exports');
const exportRetentionMs = () => (Number(process.env.AUDIT_EXPORT_RETENTION_HOURS) || 24) * 60 * 60 * 1000;
const exportOrphanGraceMs = () => (Number(process.env.AUDIT_EXPORT_ORPHAN_GRACE_HOURS) || 24) * 60 * 60 * 1000;
const exportMaxRows = () => Number(process.env.AUDIT_EXPORT_MAX_ROWS) || 250000;
const exportMaxRetryAttempts = () => Number(process.env.AUDIT_EXPORT_MAX_RETRY_ATTEMPTS) || 3;
const exportOperatorDailyLimit = () => Number(process.env.AUDIT_EXPORT_OPERATOR_DAILY_LIMIT) || 25;
const exportOperatorActiveLimit = () => Number(process.env.AUDIT_EXPORT_OPERATOR_ACTIVE_LIMIT) || 3;
const exportLifecycleReportMaxEvents = () => Number(process.env.AUDIT_EXPORT_LIFECYCLE_REPORT_MAX_EVENTS) || 10000;
const quarantineInvestigationSlaHours = () => Number(process.env.AUDIT_EXPORT_QUARANTINE_INVESTIGATION_SLA_HOURS) || 24;
const quarantineMaxAgeHours = () => Number(process.env.AUDIT_EXPORT_QUARANTINE_MAX_AGE_HOURS) || 168;
const exportRetryBackoffMs = attemptCount =>
  (Number(process.env.AUDIT_EXPORT_RETRY_BACKOFF_MS) || 30 * 1000) * Math.max(1, attemptCount || 1);
const normalizeInvestigationNote = note => String(note || '').trim().slice(0, 2000);
const investigationHistoryEntry = ({ action, actor, note }) => ({
  action,
  actor,
  actorType: actor ? 'user' : 'system',
  note: normalizeInvestigationNote(note),
  createdAt: new Date()
});
const csvEscape = value => {
  const stringValue = String(value === undefined || value === null ? '' : value);
  const formulaSafe = /^[=+\-@]/.test(stringValue) ? `'${stringValue}` : stringValue;
  return `"${formulaSafe.replace(/"/g, '""')}"`;
};
const csvRow = event => EXPORT_COLUMNS.map((column) => {
  const value = column === 'metadata' ? JSON.stringify(event.metadata || {}) : event[column];
  return csvEscape(value);
}).join(',');
const LIFECYCLE_REPORT_COLUMNS = ['createdAt', 'event', 'actorType', 'actorId', 'outcome', 'ipAddress', 'userAgent', 'metadata'];
const lifecycleReportRow = event => LIFECYCLE_REPORT_COLUMNS.map((column) => {
  const value = column === 'metadata' ? JSON.stringify(event.metadata || {}) : event[column];
  return csvEscape(value);
}).join(',');
const QUARANTINE_APPROVAL_HISTORY_COLUMNS = ['createdAt', 'action', 'actorType', 'actor', 'note'];
const quarantineApprovalHistoryRow = entry => QUARANTINE_APPROVAL_HISTORY_COLUMNS.map((column) => {
  const value = column === 'actor' && entry.actor ? String(entry.actor) : entry[column];
  return csvEscape(value);
}).join(',');
const formatJob = job => ({
  id: String(job._id),
  requestedBy: job.requestedBy ? String(job.requestedBy) : undefined,
  status: job.status,
  rowCount: job.rowCount || 0,
  estimatedRows: job.estimatedRows || 0,
  progressPercent: job.status === 'completed'
    ? 100
    : Math.max(0, Math.min(100, Number(job.progressPercent) || 0)),
  attemptCount: job.attemptCount || 0,
  maxRetryAttempts: exportMaxRetryAttempts(),
  nextRetryAt: job.nextRetryAt,
  retryAllowed: job.status === 'failed'
    && (job.attemptCount || 0) < exportMaxRetryAttempts()
    && (!job.nextRetryAt || new Date(job.nextRetryAt) <= new Date()),
  quarantineAgeHours: job.status === 'quarantined' && job.completedAt
    ? Math.max(0, (Date.now() - new Date(job.completedAt).getTime()) / (60 * 60 * 1000))
    : undefined,
  quarantineOverSla: job.status === 'quarantined' && job.completedAt
    ? (Date.now() - new Date(job.completedAt).getTime()) > quarantineInvestigationSlaHours() * 60 * 60 * 1000
    : false,
  quarantineSlaHours: quarantineInvestigationSlaHours(),
  quarantineMaxAgeHours: quarantineMaxAgeHours(),
  checksumAlgorithm: job.checksum?.algorithm,
  checksumVerifiedAt: job.checksum?.verifiedAt,
  quarantineInvestigation: job.quarantineInvestigation ? {
    status: job.quarantineInvestigation.status,
    resolution: job.quarantineInvestigation.resolution,
    releaseRequestedBy: job.quarantineInvestigation.releaseRequestedBy,
    releaseRequestedAt: job.quarantineInvestigation.releaseRequestedAt,
    releaseApprovedBy: job.quarantineInvestigation.releaseApprovedBy,
    releaseApprovedAt: job.quarantineInvestigation.releaseApprovedAt,
    resolvedBy: job.quarantineInvestigation.resolvedBy,
    resolvedAt: job.quarantineInvestigation.resolvedAt,
    history: (job.quarantineInvestigation.history || []).map(entry => ({
      action: entry.action,
      note: entry.note,
      actor: entry.actor,
      actorType: entry.actorType,
      createdAt: entry.createdAt
    }))
  } : undefined,
  error: job.error,
  storageProvider: job.storageProvider || 'local',
  encryptionMode: job.encryption?.mode,
  downloadFileName: job.downloadFileName,
  createdAt: job.createdAt,
  startedAt: job.startedAt,
  completedAt: job.completedAt,
  expiresAt: job.expiresAt
});
const formatReportJob = job => ({
  id: String(job._id),
  exportJob: String(job.exportJob),
  reportType: job.reportType || 'lifecycle',
  status: job.status,
  rowCount: job.rowCount || 0,
  error: job.error,
  storageProvider: job.storageProvider || 'local',
  encryptionMode: job.encryption?.mode,
  checksumAlgorithm: job.checksum?.algorithm,
  checksumVerifiedAt: job.checksum?.verifiedAt,
  downloadFileName: job.downloadFileName,
  createdAt: job.createdAt,
  startedAt: job.startedAt,
  completedAt: job.completedAt,
  expiresAt: job.expiresAt
});

const serviceError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const enforceExportQuota = async ({ requestedBy }) => {
  const [activeCount, dailyCount] = await Promise.all([
    SecurityAuditExportJob.countDocuments({
      requestedBy,
      status: { $in: ['pending', 'running'] }
    }),
    SecurityAuditExportJob.countDocuments({
      requestedBy,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    })
  ]);

  if (activeCount >= exportOperatorActiveLimit()) {
    operationalMetrics.increment('security_audit_export_quota_blocked_total');
    throw serviceError(429, 'Audit export active-job quota exceeded');
  }

  if (dailyCount >= exportOperatorDailyLimit()) {
    operationalMetrics.increment('security_audit_export_quota_blocked_total');
    throw serviceError(429, 'Audit export daily quota exceeded');
  }
};

const getExportQuotaUsage = async ({ requestedBy }) => {
  const windowStartedAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [activeCount, dailyCount] = await Promise.all([
    SecurityAuditExportJob.countDocuments({
      requestedBy,
      status: { $in: ['pending', 'running'] }
    }),
    SecurityAuditExportJob.countDocuments({
      requestedBy,
      createdAt: { $gte: windowStartedAt }
    })
  ]);
  const activeLimit = exportOperatorActiveLimit();
  const dailyLimit = exportOperatorDailyLimit();

  return {
    active: {
      used: activeCount,
      limit: activeLimit,
      remaining: Math.max(activeLimit - activeCount, 0)
    },
    daily: {
      used: dailyCount,
      limit: dailyLimit,
      remaining: Math.max(dailyLimit - dailyCount, 0),
      windowStartedAt,
      resetsAt: new Date(windowStartedAt.getTime() + 24 * 60 * 60 * 1000)
    }
  };
};

const getExportRetentionSummary = async ({ requestedBy }) => {
  const now = Date.now();
  const buckets = [
    { key: 'lt_1h', label: '<1h', minAgeMs: 0, maxAgeMs: 60 * 60 * 1000 },
    { key: '1h_24h', label: '1h-24h', minAgeMs: 60 * 60 * 1000, maxAgeMs: 24 * 60 * 60 * 1000 },
    { key: '1d_7d', label: '1d-7d', minAgeMs: 24 * 60 * 60 * 1000, maxAgeMs: 7 * 24 * 60 * 60 * 1000 },
    { key: 'gt_7d', label: '>7d', minAgeMs: 7 * 24 * 60 * 60 * 1000, maxAgeMs: Infinity }
  ];
  const statuses = ['pending', 'quarantined', 'deleted'];
  const summary = {};

  statuses.forEach((status) => {
    summary[status] = buckets.map(bucket => ({
      key: bucket.key,
      label: bucket.label,
      count: 0
    }));
  });

  const jobs = await SecurityAuditExportJob.find({
    requestedBy,
    status: { $in: statuses }
  }).select('status createdAt completedAt').lean();

  jobs.forEach((job) => {
    const referenceTime = new Date(job.completedAt || job.createdAt || now).getTime();
    const ageMs = Math.max(now - referenceTime, 0);
    const bucket = buckets.find(item => ageMs >= item.minAgeMs && ageMs < item.maxAgeMs) || buckets[buckets.length - 1];
    const target = summary[job.status].find(item => item.key === bucket.key);
    if (target) target.count += 1;
  });

  return {
    generatedAt: new Date(now),
    buckets,
    statuses: summary
  };
};

const updateQuarantineSlaMetrics = async () => {
  const cutoff = new Date(Date.now() - quarantineInvestigationSlaHours() * 60 * 60 * 1000);
  const count = await SecurityAuditExportJob.countDocuments({
    status: 'quarantined',
    completedAt: { $lte: cutoff }
  });
  operationalMetrics.setGauge('security_audit_exports_quarantined_over_sla', count);
  operationalMetrics.setGauge('security_audit_export_quarantine_investigation_sla_hours', quarantineInvestigationSlaHours());
  return { quarantinedOverSla: count, slaHours: quarantineInvestigationSlaHours() };
};

const record = async ({
  event,
  actorId,
  actorType = 'system',
  targetType,
  targetId,
  outcome = 'success',
  req,
  metadata
}) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      logger.logSecurity(event, { actorId, actorType, targetType, targetId, outcome });
      return;
    }
    await SecurityAuditEvent.create({
      event,
      actorId,
      actorType,
      targetType,
      targetId: targetId ? String(targetId) : undefined,
      outcome,
      ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress,
      userAgent: req?.get ? req.get('user-agent') : req?.headers?.['user-agent'],
      metadata: sanitizeMetadata(metadata)
    });
  } catch (error) {
    operationalMetrics.increment('security_audit_persistence_failures_total');
    logger.error('Security audit event persistence failed', {
      event,
      error: error.message
    });
  }
};

const list = async ({
  events,
  actorId,
  actorType,
  targetType,
  targetId,
  outcome,
  page = 1,
  limit = 50
} = {}) => {
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const query = buildQuery({ events, actorId, actorType, targetType, targetId, outcome });

  const [eventsResult, total] = await Promise.all([
    SecurityAuditEvent.find(query)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    SecurityAuditEvent.countDocuments(query)
  ]);

  return {
    events: eventsResult,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.ceil(total / safeLimit)
    }
  };
};

const cleanupExpiredExports = async () => {
  const expired = await SecurityAuditExportJob.find({ expiresAt: { $lte: new Date() } }).lean();
  await Promise.all(expired.map(async (job) => {
    await auditExportStorageService.deleteObject(job).catch(() => {});
  }));
  if (expired.length > 0) {
    await SecurityAuditExportJob.deleteMany({ _id: { $in: expired.map(job => job._id) } });
  }

  const activeJobs = await SecurityAuditExportJob.find({
    status: { $in: ['pending', 'running', 'completed', 'quarantined'] }
  }).select('filePath storageProvider storageKey').lean();
  const activeReportJobs = await SecurityAuditLifecycleReportJob.find({
    status: { $in: ['pending', 'running', 'completed'] }
  }).select('filePath storageProvider storageKey').lean();
  const deletedOrphans = await auditExportStorageService.cleanupOrphanedObjects({
    activeJobs: [...activeJobs, ...activeReportJobs],
    localDirectory: exportDirectory(),
    olderThan: new Date(Date.now() - exportOrphanGraceMs())
  }).catch((error) => {
    logger.warn('Audit export orphan cleanup failed', { error: error.message });
    return 0;
  });
  if (deletedOrphans > 0) {
    operationalMetrics.increment('security_audit_export_orphans_deleted_total', deletedOrphans);
  }

  const deletedCount = expired.length + deletedOrphans;
  if (deletedCount > 0) {
    await record({
      event: AUDIT_EXPORT_EVENTS.CLEANUP_DELETED,
      actorType: 'system',
      targetType: 'security_audit_export',
      outcome: 'success',
      metadata: {
        expiredJobs: expired.length,
        orphanedObjects: deletedOrphans,
        deletedCount
      }
    });
  }
};

const cleanupExpiredLifecycleReports = async () => {
  const expiredReports = await SecurityAuditLifecycleReportJob.find({ expiresAt: { $lte: new Date() } }).lean();
  await Promise.all(expiredReports.map(async (job) => {
    await auditExportStorageService.deleteObject(job).catch(() => {});
  }));
  if (expiredReports.length > 0) {
    await SecurityAuditLifecycleReportJob.deleteMany({ _id: { $in: expiredReports.map(job => job._id) } });
  }
  return { deletedCount: expiredReports.length };
};

const cleanupOverageQuarantinedExports = async () => {
  const cutoff = new Date(Date.now() - quarantineMaxAgeHours() * 60 * 60 * 1000);
  const overageJobs = await SecurityAuditExportJob.find({
    status: 'quarantined',
    completedAt: { $lte: cutoff },
    'quarantineInvestigation.resolution': { $exists: false }
  }).lean();

  await Promise.all(overageJobs.map(async (job) => {
    await auditExportStorageService.deleteObject(job).catch(() => {});
    await SecurityAuditExportJob.updateOne(
      { _id: job._id, status: 'quarantined' },
      {
        $set: {
          status: 'deleted',
          error: 'Auto-deleted after quarantine max-age policy',
          completedAt: new Date(),
          'quarantineInvestigation.status': 'deleted',
          'quarantineInvestigation.resolution': 'deleted',
          'quarantineInvestigation.resolvedAt': new Date()
        },
        $unset: {
          filePath: 1,
          storageKey: 1,
          downloadFileName: 1
        },
        $push: {
          'quarantineInvestigation.history': investigationHistoryEntry({
            action: 'auto_deleted',
            note: `Auto-deleted after ${quarantineMaxAgeHours()} hour quarantine max-age policy`
          })
        }
      }
    );
    await record({
      event: AUDIT_EXPORT_EVENTS.QUARANTINE_DELETED,
      actorType: 'system',
      targetType: 'security_audit_export',
      targetId: job._id,
      outcome: 'warning',
      metadata: {
        reason: 'quarantine_max_age_auto_delete',
        maxAgeHours: quarantineMaxAgeHours()
      }
    });
  }));

  if (overageJobs.length > 0) {
    operationalMetrics.increment('security_audit_export_quarantine_auto_deleted_total', overageJobs.length);
  }
  return { deletedCount: overageJobs.length };
};

const bulkDeleteStaleQuarantinedExports = async ({ requestedBy, investigationNote, olderThanHours, dryRun = false, req }) => {
  const note = normalizeInvestigationNote(investigationNote);
  const ageHours = Math.max(Number(olderThanHours) || quarantineInvestigationSlaHours(), 1);
  const cutoff = new Date(Date.now() - ageHours * 60 * 60 * 1000);
  const staleJobs = await SecurityAuditExportJob.find({
    requestedBy,
    status: 'quarantined',
    completedAt: { $lte: cutoff },
    'quarantineInvestigation.resolution': { $exists: false }
  }).lean();

  if (dryRun) {
    operationalMetrics.increment('security_audit_export_quarantine_bulk_delete_dry_run_requests_total');
    operationalMetrics.increment('security_audit_export_quarantine_bulk_delete_dry_run_candidate_total', staleJobs.length);
    operationalMetrics.incrementLabeled('security_audit_export_quarantine_bulk_delete_dry_run_candidate_by_operator_total', {
      operator_id: String(requestedBy)
    }, staleJobs.length);
    return {
      dryRun: true,
      candidateCount: staleJobs.length,
      candidateIds: staleJobs.map(job => String(job._id)),
      deletedCount: 0,
      olderThanHours: ageHours
    };
  }

  await Promise.all(staleJobs.map(async (job) => {
    await auditExportStorageService.deleteObject(job).catch(() => {});
    await SecurityAuditExportJob.updateOne(
      { _id: job._id, requestedBy, status: 'quarantined' },
      {
        $set: {
          status: 'deleted',
          error: 'Bulk deleted by operator after stale quarantine investigation',
          completedAt: new Date(),
          'quarantineInvestigation.status': 'deleted',
          'quarantineInvestigation.resolution': 'deleted',
          'quarantineInvestigation.resolvedBy': requestedBy,
          'quarantineInvestigation.resolvedAt': new Date()
        },
        $unset: {
          filePath: 1,
          storageKey: 1,
          downloadFileName: 1
        },
        $push: {
          'quarantineInvestigation.history': investigationHistoryEntry({
            action: 'delete_confirmed',
            actor: requestedBy,
            note: note || `Bulk deleted after ${ageHours} hour stale quarantine policy`
          })
        }
      }
    );
    await record({
      event: AUDIT_EXPORT_EVENTS.QUARANTINE_DELETED,
      actorId: requestedBy,
      actorType: 'user',
      targetType: 'security_audit_export',
      targetId: job._id,
      req,
      outcome: 'warning',
      metadata: {
        reason: 'operator_bulk_delete_stale_quarantine',
        olderThanHours: ageHours,
        investigationNote: note
      }
    });
  }));

  if (staleJobs.length > 0) {
    operationalMetrics.increment('security_audit_export_quarantine_bulk_deleted_total', staleJobs.length);
    operationalMetrics.incrementLabeled('security_audit_export_quarantine_bulk_deleted_by_operator_total', {
      operator_id: String(requestedBy)
    }, staleJobs.length);
  }

  return {
    dryRun: false,
    candidateCount: staleJobs.length,
    deletedCount: staleJobs.length,
    olderThanHours: ageHours
  };
};

const deleteExportJobs = async ({ jobs, actorId, req, reason }) => {
  const reportJobs = await SecurityAuditLifecycleReportJob.find({
    exportJob: { $in: jobs.map(job => job._id) }
  }).lean();
  await Promise.all(jobs.map(async (job) => {
    await auditExportStorageService.deleteObject(job).catch(() => {});
  }));
  await Promise.all(reportJobs.map(async (job) => {
    await auditExportStorageService.deleteObject(job).catch(() => {});
  }));
  if (jobs.length > 0) {
    await SecurityAuditExportJob.deleteMany({ _id: { $in: jobs.map(job => job._id) } });
    if (reportJobs.length > 0) {
      await SecurityAuditLifecycleReportJob.deleteMany({ _id: { $in: reportJobs.map(job => job._id) } });
    }
    operationalMetrics.increment('security_audit_export_bulk_cleanup_deleted_total', jobs.length);
    await record({
      event: AUDIT_EXPORT_EVENTS.CLEANUP_DELETED,
      actorId,
      actorType: actorId ? 'user' : 'system',
      targetType: 'security_audit_export',
      req,
      outcome: 'success',
      metadata: {
        reason,
        deletedCount: jobs.length,
        statuses: [...new Set(jobs.map(job => job.status))]
      }
    });
  }
  return { deletedCount: jobs.length };
};

const progressPercent = ({ rowCount, estimatedRows, status }) => {
  if (status === 'completed') return 100;
  if (!estimatedRows) return 0;
  return Math.max(0, Math.min(99, Math.floor((rowCount / estimatedRows) * 100)));
};

const persistProgress = async ({ job, rowCount }) => {
  const percent = progressPercent({
    rowCount,
    estimatedRows: job.estimatedRows,
    status: job.status
  });
  await SecurityAuditExportJob.updateOne(
    { _id: job._id, status: 'running' },
    {
      $set: {
        rowCount,
        progressPercent: percent,
        lastProgressAt: new Date()
      }
    }
  );
};

const processExportJob = async (jobId) => {
  const job = await SecurityAuditExportJob.findById(jobId);
  if (!job || job.status !== 'pending') return;
  const startedAtMs = Date.now();

  const directory = exportDirectory();
  await fsPromises.mkdir(directory, { recursive: true });
  const downloadFileName = `security-audit-${job._id}.csv`;
  const filePath = path.join(directory, downloadFileName);
  let rowCount = 0;

  try {
    operationalMetrics.increment('security_audit_export_attempts_total');
    job.status = 'running';
    job.startedAt = new Date();
    job.filePath = filePath;
    job.storageProvider = auditExportStorageService.provider();
    job.downloadFileName = downloadFileName;
    job.attemptCount = (job.attemptCount || 0) + 1;
    job.progressPercent = 0;
    job.nextRetryAt = undefined;
    job.lastProgressAt = new Date();
    await job.save();

    const output = fs.createWriteStream(filePath, { encoding: 'utf8' });
    output.write(`${EXPORT_COLUMNS.join(',')}\n`);
    const cursor = SecurityAuditEvent.find(buildQuery(job.filters))
      .sort({ createdAt: -1 })
      .limit(exportMaxRows())
      .lean()
      .cursor();

    for await (const event of cursor) {
      if (rowCount > 0 && rowCount % 1000 === 0) {
        const latest = await SecurityAuditExportJob.findById(jobId).select('status').lean();
        if (!latest || latest.status === 'cancelled') {
          throw new Error('Audit export cancelled');
        }
      }
      if (!output.write(`${csvRow(event)}\n`)) {
        await new Promise(resolve => output.once('drain', resolve));
      }
      rowCount += 1;
      if (rowCount % 1000 === 0) {
        await persistProgress({ job, rowCount });
      }
    }

    output.end();
    await finished(output);
    const bytesWritten = (await fsPromises.stat(filePath)).size;
    const latestBeforeUpload = await SecurityAuditExportJob.findById(jobId).select('status').lean();
    if (!latestBeforeUpload || latestBeforeUpload.status === 'cancelled') {
      throw new Error('Audit export cancelled');
    }

    const storageResult = await auditExportStorageService.putFile({
      localPath: filePath,
      jobId: String(job._id),
      fileName: downloadFileName
    });

    job.status = 'completed';
    job.rowCount = rowCount;
    job.completedAt = new Date();
    job.storageProvider = storageResult.storageProvider;
    job.storageKey = storageResult.storageKey;
    job.filePath = storageResult.filePath;
    job.downloadFileName = storageResult.downloadFileName;
    job.encryption = storageResult.encryption;
    job.checksum = storageResult.checksum;
    job.progressPercent = 100;
    job.lastProgressAt = new Date();
    await job.save();
    if (storageResult.storageProvider !== 'local') {
      await fsPromises.unlink(filePath).catch(() => {});
    }
    const durationMs = Date.now() - startedAtMs;
    operationalMetrics.increment('security_audit_exports_completed_total');
    operationalMetrics.increment('security_audit_export_duration_ms_total', durationMs);
    operationalMetrics.increment('security_audit_export_bytes_written_total', bytesWritten);
    operationalMetrics.setGauge('security_audit_export_last_duration_ms', durationMs);
    operationalMetrics.setGauge('security_audit_export_last_bytes_written', bytesWritten);
  } catch (error) {
    await fsPromises.unlink(filePath).catch(() => {});
    const cancelled = error.message === 'Audit export cancelled';
    const checksumMismatch = /checksum verification failed/i.test(error.message);
    const exhausted = !cancelled && !checksumMismatch && (job.attemptCount || 0) >= exportMaxRetryAttempts();
    job.status = cancelled ? 'cancelled' : (checksumMismatch ? 'quarantined' : (exhausted ? 'dead_letter' : 'failed'));
    job.error = error.message;
    job.progressPercent = progressPercent({
      rowCount,
      estimatedRows: job.estimatedRows,
      status: job.status
    });
    if (job.status === 'failed') {
      job.nextRetryAt = new Date(Date.now() + exportRetryBackoffMs(job.attemptCount || 1));
    }
    job.completedAt = new Date();
    await job.save().catch(() => {});
    const durationMs = Date.now() - startedAtMs;
    operationalMetrics.increment(job.status === 'cancelled'
      ? 'security_audit_exports_cancelled_total'
      : 'security_audit_exports_failed_total');
    if (job.status === 'dead_letter') {
      operationalMetrics.increment('security_audit_export_retry_limit_exhausted_total');
    }
    if (job.status === 'quarantined') {
      operationalMetrics.increment('security_audit_export_checksum_mismatch_total');
      await record({
        event: AUDIT_EXPORT_EVENTS.CHECKSUM_MISMATCH,
        actorType: 'system',
        targetType: 'security_audit_export',
        targetId: job._id,
        outcome: 'failure',
        metadata: {
          storageProvider: job.storageProvider,
          error: error.message
        }
      });
    }
    operationalMetrics.increment('security_audit_export_duration_ms_total', durationMs);
    operationalMetrics.setGauge('security_audit_export_last_duration_ms', durationMs);
    logger.error('Security audit export failed', { jobId: String(jobId), error: error.message });
  }
};

const createExportJob = async ({ filters, requestedBy, req }) => {
  await cleanupExpiredExports().catch(error => logger.warn('Security audit export cleanup failed', {
    error: error.message
  }));
  await enforceExportQuota({ requestedBy });

  const estimatedRows = Math.min(
    await SecurityAuditEvent.countDocuments(buildQuery(filters)),
    exportMaxRows()
  );

  const job = await SecurityAuditExportJob.create({
    requestedBy,
    filters,
    estimatedRows,
    expiresAt: new Date(Date.now() + exportRetentionMs())
  });

  await record({
    event: AUDIT_EXPORT_EVENTS.CREATED,
    actorId: requestedBy,
    actorType: 'user',
    targetType: 'security_audit_export',
    targetId: job._id,
    req,
    outcome: 'success',
    metadata: { filters, estimatedRows }
  });
  operationalMetrics.increment('security_audit_export_created_total');

  setImmediate(() => {
    processExportJob(job._id).catch(error => logger.error('Security audit export worker failed', {
      jobId: String(job._id),
      error: error.message
    }));
  });

  return formatJob(job);
};

const getExportJob = async ({ jobId, requestedBy }) => {
  const job = await SecurityAuditExportJob.findOne({ _id: jobId, requestedBy }).lean();
  return job ? formatJob(job) : null;
};

const listExportJobs = async ({
  requestedBy,
  page = 1,
  limit = 25,
  status,
  storageProvider,
  missingInvestigationNote,
  approvalQueue
}) => {
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);
  const query = approvalQueue
    ? {
        status: 'quarantined',
        requestedBy: { $ne: requestedBy },
        'quarantineInvestigation.releaseRequestedBy': { $exists: true, $ne: null },
        'quarantineInvestigation.releaseApprovedBy': { $exists: false }
      }
    : { requestedBy };
  if (status && !approvalQueue) query.status = status;
  if (storageProvider) query.storageProvider = storageProvider;
  if (missingInvestigationNote) {
    query['quarantineInvestigation.history'] = {
      $not: { $elemMatch: { note: { $exists: true, $ne: '' } } }
    };
  }
  const [jobs, total] = await Promise.all([
    SecurityAuditExportJob.find(query)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    SecurityAuditExportJob.countDocuments(query)
  ]);

  return {
    exports: jobs.map(formatJob),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.ceil(total / safeLimit)
    }
  };
};

const cancelExportJob = async ({ jobId, requestedBy, req }) => {
  const job = await SecurityAuditExportJob.findOneAndUpdate(
    { _id: jobId, requestedBy, status: { $in: ['pending', 'running'] } },
    { $set: { status: 'cancelled', completedAt: new Date(), error: 'Cancelled by operator' } },
    { new: true }
  ).lean();
  if (!job) return null;
  await auditExportStorageService.deleteObject(job).catch(() => {});
  operationalMetrics.increment('security_audit_exports_cancelled_total');
  await record({
    event: AUDIT_EXPORT_EVENTS.CANCELLED,
    actorId: requestedBy,
    actorType: 'user',
    targetType: 'security_audit_export',
    targetId: job._id,
    req,
    outcome: 'success',
    metadata: {
      status: job.status,
      storageProvider: job.storageProvider,
      rowCount: job.rowCount || 0
    }
  });
  return formatJob(job);
};

const getExportDownload = async ({ jobId, requestedBy }) => {
  const job = await SecurityAuditExportJob.findOne({ _id: jobId, requestedBy, status: 'completed' }).lean();
  if (!job) return null;

  if (job.storageProvider === 'gcs' || job.storageProvider === 's3') {
    const url = await auditExportStorageService.signedDownloadUrl(job);
    if (url) {
      operationalMetrics.increment('security_audit_export_signed_download_issued_total');
    }
    return url ? { type: 'redirect', url, job } : null;
  }

  if (!job.filePath) return null;
  await fsPromises.access(job.filePath, fs.constants.R_OK);
  return {
    type: 'file',
    filePath: job.filePath,
    filename: job.downloadFileName || path.basename(job.filePath),
    job
  };
};

const releaseQuarantinedExportJob = async ({ jobId, requestedBy, investigationNote, req }) => {
  const note = normalizeInvestigationNote(investigationNote);
  const job = await SecurityAuditExportJob.findOneAndUpdate(
    { _id: jobId, requestedBy, status: 'quarantined' },
    {
      $set: {
        'quarantineInvestigation.status': 'release_requested',
        'quarantineInvestigation.releaseRequestedBy': requestedBy,
        'quarantineInvestigation.releaseRequestedAt': new Date()
      },
      $push: {
        'quarantineInvestigation.history': investigationHistoryEntry({
          action: 'release_requested',
          actor: requestedBy,
          note
        })
      }
    },
    { new: true }
  ).lean();
  if (!job) return null;
  operationalMetrics.increment('security_audit_export_quarantine_release_requested_total');
  operationalMetrics.incrementLabeled('security_audit_export_quarantine_release_requested_by_operator_total', {
    operator_id: String(requestedBy)
  });
  await record({
    event: AUDIT_EXPORT_EVENTS.QUARANTINE_RELEASE_REQUESTED,
    actorId: requestedBy,
    actorType: 'user',
    targetType: 'security_audit_export',
    targetId: job._id,
    req,
    outcome: 'warning',
    metadata: {
      storageProvider: job.storageProvider,
      checksumAlgorithm: job.checksum?.algorithm,
      checksumVerifiedAt: job.checksum?.verifiedAt,
      investigationNote: note,
      requiresSecondOperatorApproval: true
    }
  });
  auditExportOperatorNotificationService.notifyQuarantineReleaseRequested({
    exportJobId: String(job._id),
    requestedBy
  }).catch(error => logger.warn('Audit export release approval notification failed', {
    jobId: String(job._id),
    error: error.message
  }));
  return formatJob(job);
};

const approveQuarantinedExportRelease = async ({ jobId, requestedBy, investigationNote, req }) => {
  const note = normalizeInvestigationNote(investigationNote);
  const existing = await SecurityAuditExportJob.findOne({
    _id: jobId,
    status: 'quarantined',
    'quarantineInvestigation.releaseRequestedBy': { $exists: true, $ne: null }
  }).lean();
  if (!existing) return null;
  if (String(existing.quarantineInvestigation?.releaseRequestedBy) === String(requestedBy)) {
    throw serviceError(409, 'A different platform operator must approve quarantined export release');
  }

  const job = await SecurityAuditExportJob.findOneAndUpdate(
    {
      _id: jobId,
      status: 'quarantined',
      'quarantineInvestigation.releaseRequestedBy': { $exists: true, $ne: requestedBy },
      'quarantineInvestigation.releaseApprovedBy': { $exists: false }
    },
    {
      $set: {
        status: 'completed',
        error: null,
        completedAt: new Date(),
        progressPercent: 100,
        'quarantineInvestigation.status': 'released',
        'quarantineInvestigation.resolution': 'released',
        'quarantineInvestigation.releaseApprovedBy': requestedBy,
        'quarantineInvestigation.releaseApprovedAt': new Date(),
        'quarantineInvestigation.resolvedBy': requestedBy,
        'quarantineInvestigation.resolvedAt': new Date()
      },
      $unset: { nextRetryAt: 1 },
      $push: {
        'quarantineInvestigation.history': investigationHistoryEntry({
          action: 'release_approved',
          actor: requestedBy,
          note
        })
      }
    },
    { new: true }
  ).lean();
  if (!job) return null;
  operationalMetrics.increment('security_audit_export_quarantine_released_total');
  operationalMetrics.incrementLabeled('security_audit_export_quarantine_released_by_operator_total', {
    operator_id: String(requestedBy)
  });
  await record({
    event: AUDIT_EXPORT_EVENTS.QUARANTINE_RELEASED,
    actorId: requestedBy,
    actorType: 'user',
    targetType: 'security_audit_export',
    targetId: job._id,
    req,
    outcome: 'warning',
    metadata: {
      storageProvider: job.storageProvider,
      checksumAlgorithm: job.checksum?.algorithm,
      checksumVerifiedAt: job.checksum?.verifiedAt,
      investigationNote: note,
      releaseRequestedBy: String(existing.quarantineInvestigation.releaseRequestedBy),
      resolution: 'released'
    }
  });
  return formatJob(job);
};

const deleteQuarantinedExportJob = async ({ jobId, requestedBy, investigationNote, req }) => {
  const job = await SecurityAuditExportJob.findOne({ _id: jobId, requestedBy, status: 'quarantined' }).lean();
  if (!job) return null;
  const note = normalizeInvestigationNote(investigationNote);
  const reportJobs = await SecurityAuditLifecycleReportJob.find({ exportJob: job._id, requestedBy }).lean();
  await auditExportStorageService.deleteObject(job).catch(() => {});
  await Promise.all(reportJobs.map(async (reportJob) => {
    await auditExportStorageService.deleteObject(reportJob).catch(() => {});
  }));
  const updatedJob = await SecurityAuditExportJob.findOneAndUpdate(
    { _id: job._id },
    {
      $set: {
        status: 'deleted',
        completedAt: new Date(),
        error: 'Deleted by operator after quarantine investigation',
        'quarantineInvestigation.status': 'deleted',
        'quarantineInvestigation.resolution': 'deleted',
        'quarantineInvestigation.resolvedBy': requestedBy,
        'quarantineInvestigation.resolvedAt': new Date()
      },
      $push: {
        'quarantineInvestigation.history': investigationHistoryEntry({
          action: 'delete_confirmed',
          actor: requestedBy,
          note
        })
      },
      $unset: {
        filePath: 1,
        storageKey: 1,
        downloadFileName: 1
      }
    },
    { new: true }
  ).lean();
  if (reportJobs.length > 0) {
    await SecurityAuditLifecycleReportJob.deleteMany({ _id: { $in: reportJobs.map(reportJob => reportJob._id) } });
  }
  operationalMetrics.increment('security_audit_export_quarantine_deleted_total');
  operationalMetrics.incrementLabeled('security_audit_export_quarantine_deleted_by_operator_total', {
    operator_id: String(requestedBy)
  });
  await record({
    event: AUDIT_EXPORT_EVENTS.QUARANTINE_DELETED,
    actorId: requestedBy,
    actorType: 'user',
    targetType: 'security_audit_export',
    targetId: job._id,
    req,
    outcome: 'success',
    metadata: {
      storageProvider: job.storageProvider,
      rowCount: job.rowCount || 0,
      investigationNote: note,
      resolution: 'deleted',
      deletedLifecycleReports: reportJobs.length
    }
  });
  return { deleted: true, export: formatJob(updatedJob || job) };
};

const markExportDownloaded = async ({ job, requestedBy, req }) => {
  operationalMetrics.increment('security_audit_export_downloaded_total');
  return record({
    event: AUDIT_EXPORT_EVENTS.DOWNLOADED,
    actorId: requestedBy,
    actorType: 'user',
    targetType: 'security_audit_export',
    targetId: job._id,
    req,
    outcome: 'success',
    metadata: {
      storageProvider: job.storageProvider,
      rowCount: job.rowCount || 0
    }
  });
};

const scheduleRetry = async ({ job, actorId, actorType = 'system', req }) => {
  const claimed = await SecurityAuditExportJob.findOneAndUpdate(
    {
      _id: job._id,
      status: 'failed',
      attemptCount: { $lt: exportMaxRetryAttempts() },
      $or: [
        { nextRetryAt: { $exists: false } },
        { nextRetryAt: { $lte: new Date() } }
      ]
    },
    {
      $set: {
        status: 'pending',
        rowCount: 0,
        progressPercent: 0,
        lastProgressAt: new Date()
      },
      $unset: {
        error: 1,
        startedAt: 1,
        completedAt: 1,
        filePath: 1,
        storageKey: 1,
        downloadFileName: 1,
        encryption: 1,
        checksum: 1,
        nextRetryAt: 1
      }
    },
    { new: true }
  ).lean();
  if (!claimed) return null;
  operationalMetrics.increment(actorType === 'system'
    ? 'security_audit_export_auto_retry_started_total'
    : 'security_audit_export_retry_started_total');
  await record({
    event: AUDIT_EXPORT_EVENTS.RETRIED,
    actorId,
    actorType,
    targetType: 'security_audit_export',
    targetId: job._id,
    req,
    outcome: 'success',
    metadata: { attemptCount: job.attemptCount || 0, automatic: actorType === 'system' }
  });
  setImmediate(() => {
    processExportJob(job._id).catch(error => logger.error('Security audit export retry worker failed', {
      jobId: String(job._id),
      error: error.message
    }));
  });
  return claimed;
};

const retryExportJob = async ({ jobId, requestedBy, req }) => {
  const job = await SecurityAuditExportJob.findOne({ _id: jobId, requestedBy, status: 'failed' }).lean();
  if (!job) return null;
  if ((job.attemptCount || 0) >= exportMaxRetryAttempts()) {
    operationalMetrics.increment('security_audit_export_retry_blocked_total');
    throw serviceError(409, 'Audit export retry limit reached');
  }
  if (job.nextRetryAt && new Date(job.nextRetryAt) > new Date()) {
    operationalMetrics.increment('security_audit_export_retry_backoff_blocked_total');
    throw serviceError(429, 'Audit export retry backoff is still active');
  }
  await auditExportStorageService.deleteObject(job).catch(() => {});
  await scheduleRetry({ job, actorId: requestedBy, actorType: 'user', req });

  return getExportJob({ jobId, requestedBy });
};

const processPendingRetries = async ({ limit = 25 } = {}) => {
  const exhausted = await SecurityAuditExportJob.updateMany(
    { status: 'failed', attemptCount: { $gte: exportMaxRetryAttempts() } },
    { $set: { status: 'dead_letter', nextRetryAt: null } }
  );
  if (exhausted.modifiedCount > 0) {
    operationalMetrics.increment('security_audit_export_retry_limit_exhausted_total', exhausted.modifiedCount);
  }

  const retryable = await SecurityAuditExportJob.find({
    status: 'failed',
    attemptCount: { $lt: exportMaxRetryAttempts() },
    nextRetryAt: { $lte: new Date() }
  }).sort({ nextRetryAt: 1 }).limit(limit).lean();

  const results = await Promise.all(retryable.map(job => scheduleRetry({ job })));
  const scheduled = results.filter(Boolean).length;
  if (scheduled > 0) {
    operationalMetrics.increment('security_audit_export_auto_retry_jobs_total', scheduled);
  }
  return {
    scheduled,
    deadLettered: exhausted.modifiedCount || 0
  };
};

const bulkCleanupExportJobs = async ({ requestedBy, req }) => {
  const jobs = await SecurityAuditExportJob.find({
    requestedBy,
    $or: [
      { expiresAt: { $lte: new Date() } },
      { status: 'cancelled' }
    ]
  }).lean();
  return deleteExportJobs({
    jobs,
    actorId: requestedBy,
    req,
    reason: 'operator_bulk_cleanup_expired_cancelled'
  });
};

const processExportAuditReportJob = async (reportJobId) => {
  const reportJob = await SecurityAuditLifecycleReportJob.findById(reportJobId);
  if (!reportJob || reportJob.status !== 'pending') return;

  const directory = exportDirectory();
  await fsPromises.mkdir(directory, { recursive: true });
  const downloadFileName = `security-audit-export-lifecycle-${reportJob.exportJob}-${reportJob._id}.csv`;
  const filePath = path.join(directory, downloadFileName);
  let rowCount = 0;

  try {
    reportJob.status = 'running';
    reportJob.startedAt = new Date();
    reportJob.filePath = filePath;
    reportJob.storageProvider = auditExportStorageService.provider();
    reportJob.downloadFileName = downloadFileName;
    await reportJob.save();

    const output = fs.createWriteStream(filePath, { encoding: 'utf8' });
    output.write(`${LIFECYCLE_REPORT_COLUMNS.join(',')}\n`);
    const cursor = SecurityAuditEvent.find({
      targetType: 'security_audit_export',
      targetId: String(reportJob.exportJob)
    }).sort({ createdAt: -1 }).lean().cursor();

    for await (const event of cursor) {
      if (!output.write(`${lifecycleReportRow(event)}\n`)) {
        await new Promise(resolve => output.once('drain', resolve));
      }
      rowCount += 1;
    }

    output.end();
    await finished(output);
    const storageResult = await auditExportStorageService.putFile({
      localPath: filePath,
      jobId: String(reportJob._id),
      fileName: downloadFileName
    });

    reportJob.status = 'completed';
    reportJob.rowCount = rowCount;
    reportJob.completedAt = new Date();
    reportJob.storageProvider = storageResult.storageProvider;
    reportJob.storageKey = storageResult.storageKey;
    reportJob.filePath = storageResult.filePath;
    reportJob.downloadFileName = storageResult.downloadFileName;
    reportJob.encryption = storageResult.encryption;
    reportJob.checksum = storageResult.checksum;
    await reportJob.save();
    if (storageResult.storageProvider !== 'local') {
      await fsPromises.unlink(filePath).catch(() => {});
    }
  } catch (error) {
    await fsPromises.unlink(filePath).catch(() => {});
    reportJob.status = 'failed';
    reportJob.error = error.message;
    reportJob.completedAt = new Date();
    await reportJob.save().catch(() => {});
    logger.error('Security audit lifecycle report failed', {
      reportJobId: String(reportJobId),
      exportJobId: String(reportJob.exportJob),
      error: error.message
    });
  }
};

const createExportAuditReportJob = async ({ jobId, requestedBy, req }) => {
  const exportJob = await SecurityAuditExportJob.findOne({ _id: jobId, requestedBy }).lean();
  if (!exportJob) return null;
  const reportJob = await SecurityAuditLifecycleReportJob.create({
    requestedBy,
    exportJob: exportJob._id,
    reportType: 'lifecycle',
    expiresAt: new Date(Date.now() + exportRetentionMs())
  });
  await record({
    event: AUDIT_EXPORT_EVENTS.LIFECYCLE_REPORT_CREATED,
    actorId: requestedBy,
    actorType: 'user',
    targetType: 'security_audit_export',
    targetId: exportJob._id,
    req,
    outcome: 'success',
    metadata: { reportJobId: String(reportJob._id) }
  });
  setImmediate(() => {
    processExportAuditReportJob(reportJob._id).catch(error => logger.error('Security audit lifecycle report worker failed', {
      reportJobId: String(reportJob._id),
      error: error.message
    }));
  });
  return formatReportJob(reportJob);
};

const getExportAuditReportJob = async ({ jobId, reportJobId, requestedBy }) => {
  const reportJob = await SecurityAuditLifecycleReportJob.findOne({
    _id: reportJobId,
    requestedBy,
    exportJob: jobId,
    reportType: 'lifecycle'
  }).lean();
  return reportJob ? formatReportJob(reportJob) : null;
};

const getExportAuditReportDownload = async ({ jobId, reportJobId, requestedBy }) => {
  const reportJob = await SecurityAuditLifecycleReportJob.findOne({
    _id: reportJobId,
    requestedBy,
    exportJob: jobId,
    reportType: 'lifecycle',
    status: 'completed'
  }).lean();
  if (!reportJob) return null;

  if (reportJob.storageProvider === 'gcs' || reportJob.storageProvider === 's3') {
    const url = await auditExportStorageService.signedDownloadUrl(reportJob);
    if (url) {
      operationalMetrics.increment('security_audit_export_signed_download_issued_total');
    }
    return url ? { type: 'redirect', url, reportJob } : null;
  }

  if (!reportJob.filePath) return null;
  await fsPromises.access(reportJob.filePath, fs.constants.R_OK);
  return {
    type: 'file',
    filePath: reportJob.filePath,
    filename: reportJob.downloadFileName || path.basename(reportJob.filePath),
    reportJob
  };
};

const processQuarantineApprovalHistoryReportJob = async (reportJobId) => {
  const reportJob = await SecurityAuditLifecycleReportJob.findById(reportJobId);
  if (!reportJob || reportJob.status !== 'pending') return;

  const directory = exportDirectory();
  await fsPromises.mkdir(directory, { recursive: true });
  const downloadFileName = `security-audit-export-quarantine-approval-history-${reportJob.exportJob}-${reportJob._id}.csv`;
  const filePath = path.join(directory, downloadFileName);
  let rowCount = 0;

  try {
    reportJob.status = 'running';
    reportJob.startedAt = new Date();
    reportJob.filePath = filePath;
    reportJob.storageProvider = auditExportStorageService.provider();
    reportJob.downloadFileName = downloadFileName;
    await reportJob.save();

    const exportJob = await SecurityAuditExportJob.findById(reportJob.exportJob).lean();
    if (!exportJob) {
      throw new Error('Audit export job not found for quarantine approval history report');
    }

    const output = fs.createWriteStream(filePath, { encoding: 'utf8' });
    output.write(`${QUARANTINE_APPROVAL_HISTORY_COLUMNS.join(',')}\n`);
    for (const entry of exportJob.quarantineInvestigation?.history || []) {
      if (!output.write(`${quarantineApprovalHistoryRow(entry)}\n`)) {
        await new Promise(resolve => output.once('drain', resolve));
      }
      rowCount += 1;
    }

    output.end();
    await finished(output);
    const storageResult = await auditExportStorageService.putFile({
      localPath: filePath,
      jobId: String(reportJob._id),
      fileName: downloadFileName
    });

    reportJob.status = 'completed';
    reportJob.rowCount = rowCount;
    reportJob.completedAt = new Date();
    reportJob.storageProvider = storageResult.storageProvider;
    reportJob.storageKey = storageResult.storageKey;
    reportJob.filePath = storageResult.filePath;
    reportJob.downloadFileName = storageResult.downloadFileName;
    reportJob.encryption = storageResult.encryption;
    reportJob.checksum = storageResult.checksum;
    await reportJob.save();
    if (storageResult.storageProvider !== 'local') {
      await fsPromises.unlink(filePath).catch(() => {});
    }
  } catch (error) {
    await fsPromises.unlink(filePath).catch(() => {});
    reportJob.status = 'failed';
    reportJob.error = error.message;
    reportJob.completedAt = new Date();
    await reportJob.save().catch(() => {});
    logger.error('Security audit quarantine approval history report failed', {
      reportJobId: String(reportJobId),
      exportJobId: String(reportJob.exportJob),
      error: error.message
    });
  }
};

const createQuarantineApprovalHistoryReportJob = async ({ jobId, requestedBy, req }) => {
  const exportJob = await SecurityAuditExportJob.findById(jobId).lean();
  if (!exportJob) return null;
  const reportJob = await SecurityAuditLifecycleReportJob.create({
    requestedBy,
    exportJob: exportJob._id,
    reportType: 'quarantine_approval_history',
    expiresAt: new Date(Date.now() + exportRetentionMs())
  });
  await record({
    event: AUDIT_EXPORT_EVENTS.QUARANTINE_APPROVAL_HISTORY_REPORT_CREATED,
    actorId: requestedBy,
    actorType: 'user',
    targetType: 'security_audit_export',
    targetId: exportJob._id,
    req,
    outcome: 'success',
    metadata: { reportJobId: String(reportJob._id), reportType: 'quarantine_approval_history' }
  });
  setImmediate(() => {
    processQuarantineApprovalHistoryReportJob(reportJob._id).catch(error => logger.error('Security audit quarantine approval history report worker failed', {
      reportJobId: String(reportJob._id),
      error: error.message
    }));
  });
  return formatReportJob(reportJob);
};

const getQuarantineApprovalHistoryReportJob = async ({ jobId, reportJobId, requestedBy }) => {
  const reportJob = await SecurityAuditLifecycleReportJob.findOne({
    _id: reportJobId,
    requestedBy,
    exportJob: jobId,
    reportType: 'quarantine_approval_history'
  }).lean();
  return reportJob ? formatReportJob(reportJob) : null;
};

const getQuarantineApprovalHistoryReportDownload = async ({ jobId, reportJobId, requestedBy }) => {
  const reportJob = await SecurityAuditLifecycleReportJob.findOne({
    _id: reportJobId,
    requestedBy,
    exportJob: jobId,
    reportType: 'quarantine_approval_history',
    status: 'completed'
  }).lean();
  if (!reportJob) return null;

  if (reportJob.storageProvider === 'gcs' || reportJob.storageProvider === 's3') {
    const url = await auditExportStorageService.signedDownloadUrl(reportJob);
    if (url) {
      operationalMetrics.increment('security_audit_export_signed_download_issued_total');
    }
    return url ? { type: 'redirect', url, reportJob } : null;
  }

  if (!reportJob.filePath) return null;
  await fsPromises.access(reportJob.filePath, fs.constants.R_OK);
  return {
    type: 'file',
    filePath: reportJob.filePath,
    filename: reportJob.downloadFileName || path.basename(reportJob.filePath),
    reportJob
  };
};

const markQuarantineApprovalHistoryReportDownloaded = async ({ reportJob, requestedBy, req }) => {
  return record({
    event: AUDIT_EXPORT_EVENTS.QUARANTINE_APPROVAL_HISTORY_REPORT_DOWNLOADED,
    actorId: requestedBy,
    actorType: 'user',
    targetType: 'security_audit_export',
    targetId: reportJob.exportJob,
    req,
    outcome: 'success',
    metadata: {
      reportJobId: String(reportJob._id),
      reportType: 'quarantine_approval_history',
      storageProvider: reportJob.storageProvider,
      rowCount: reportJob.rowCount || 0
    }
  });
};

const markExportAuditReportDownloaded = async ({ reportJob, requestedBy, req }) => {
  return record({
    event: AUDIT_EXPORT_EVENTS.LIFECYCLE_REPORT_DOWNLOADED,
    actorId: requestedBy,
    actorType: 'user',
    targetType: 'security_audit_export',
    targetId: reportJob.exportJob,
    req,
    outcome: 'success',
    metadata: {
      reportJobId: String(reportJob._id),
      storageProvider: reportJob.storageProvider,
      rowCount: reportJob.rowCount || 0
    }
  });
};

const getExportAuditReport = async ({ jobId, requestedBy }) => {
  const result = await getExportAuditEvents({
    jobId,
    requestedBy,
    page: 1,
    limit: exportLifecycleReportMaxEvents()
  });
  if (!result) return null;

  const columns = ['createdAt', 'event', 'actorType', 'actorId', 'outcome', 'ipAddress', 'userAgent', 'metadata'];
  const rows = result.events.map(event => columns.map(column => {
    const value = column === 'metadata' ? JSON.stringify(event.metadata || {}) : event[column];
    return csvEscape(value);
  }).join(','));

  return {
    filename: `security-audit-export-lifecycle-${jobId}.csv`,
    csv: `${columns.join(',')}\n${rows.join('\n')}${rows.length ? '\n' : ''}`
  };
};

const getQuarantineApprovalHistoryReport = async ({ jobId }) => {
  const job = await SecurityAuditExportJob.findById(jobId).lean();
  if (!job) return null;

  const columns = ['createdAt', 'action', 'actorType', 'actor', 'note'];
  const rows = (job.quarantineInvestigation?.history || []).map(entry => columns.map((column) => {
    const value = column === 'actor' && entry.actor ? String(entry.actor) : entry[column];
    return csvEscape(value);
  }).join(','));

  return {
    filename: `security-audit-export-quarantine-approval-history-${jobId}.csv`,
    csv: `${columns.join(',')}\n${rows.join('\n')}${rows.length ? '\n' : ''}`
  };
};

const getExportAuditEvents = async ({ jobId, requestedBy, page = 1, limit = 25 }) => {
  const job = await SecurityAuditExportJob.findOne({ _id: jobId, requestedBy }).lean();
  if (!job) return null;
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);
  const query = {
    targetType: 'security_audit_export',
    targetId: String(jobId)
  };
  const [events, total] = await Promise.all([
    SecurityAuditEvent.find(query)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    SecurityAuditEvent.countDocuments(query)
  ]);
  return {
    export: formatJob(job),
    events,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.ceil(total / safeLimit)
    }
  };
};

module.exports = {
  record,
  list,
  listExportJobs,
  getExportQuotaUsage,
  getExportRetentionSummary,
  createExportJob,
  getExportJob,
  cancelExportJob,
  getExportDownload,
  markExportDownloaded,
  releaseQuarantinedExportJob,
  approveQuarantinedExportRelease,
  deleteQuarantinedExportJob,
  retryExportJob,
  getExportAuditEvents,
  getExportAuditReport,
  createQuarantineApprovalHistoryReportJob,
  getQuarantineApprovalHistoryReportJob,
  getQuarantineApprovalHistoryReportDownload,
  markQuarantineApprovalHistoryReportDownloaded,
  getQuarantineApprovalHistoryReport,
  createExportAuditReportJob,
  getExportAuditReportJob,
  getExportAuditReportDownload,
  markExportAuditReportDownloaded,
  processPendingRetries,
  bulkCleanupExportJobs,
  bulkDeleteStaleQuarantinedExports,
  cleanupExpiredExports,
  cleanupExpiredLifecycleReports,
  cleanupOverageQuarantinedExports,
  updateQuarantineSlaMetrics,
  EXPORT_COLUMNS,
  AUDIT_EXPORT_EVENTS
};
