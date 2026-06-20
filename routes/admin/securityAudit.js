const express = require('express');
const { body, param, query } = require('express-validator');
const { protect, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validation');
const { ROLES } = require('../../constants/roles');
const securityAuditService = require('../../services/securityAuditService');
const { rateLimiters } = require('../../config/rateLimit');

const router = express.Router();
const EXPORT_STATUSES = ['pending', 'running', 'completed', 'failed', 'cancelled', 'dead_letter', 'quarantined', 'deleted'];
const EXPORT_STORAGE_PROVIDERS = ['local', 'gcs', 's3'];

const WEB_AUTHN_AUDIT_EVENTS = [
  'webauthn_recovery_codes_generated',
  'webauthn_lost_device_recovered',
  'webauthn_lost_device_recovery_failed',
  'webauthn_passkey_revoked',
  securityAuditService.AUDIT_EXPORT_EVENTS.CREATED,
  securityAuditService.AUDIT_EXPORT_EVENTS.DOWNLOADED,
  securityAuditService.AUDIT_EXPORT_EVENTS.CANCELLED,
  securityAuditService.AUDIT_EXPORT_EVENTS.RETRIED,
  securityAuditService.AUDIT_EXPORT_EVENTS.CHECKSUM_MISMATCH,
  securityAuditService.AUDIT_EXPORT_EVENTS.CLEANUP_DELETED,
  securityAuditService.AUDIT_EXPORT_EVENTS.QUARANTINE_RELEASE_REQUESTED,
  securityAuditService.AUDIT_EXPORT_EVENTS.QUARANTINE_RELEASED,
  securityAuditService.AUDIT_EXPORT_EVENTS.QUARANTINE_DELETED,
  securityAuditService.AUDIT_EXPORT_EVENTS.LIFECYCLE_REPORT_CREATED,
  securityAuditService.AUDIT_EXPORT_EVENTS.LIFECYCLE_REPORT_DOWNLOADED,
  securityAuditService.AUDIT_EXPORT_EVENTS.QUARANTINE_APPROVAL_HISTORY_REPORT_CREATED,
  securityAuditService.AUDIT_EXPORT_EVENTS.QUARANTINE_APPROVAL_HISTORY_REPORT_DOWNLOADED
];
const requesterId = req => req.user._id || req.user.id;
const operatorRateLimitKey = req => `operator:${String(requesterId(req))}`;
const quarantineReleaseRequestLimiter = rateLimiters.custom({
  window: Number(process.env.AUDIT_EXPORT_RELEASE_REQUEST_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.AUDIT_EXPORT_RELEASE_REQUEST_RATE_LIMIT_MAX) || 5,
  message: 'Too many quarantine release requests. Please try again later.',
  keyGenerator: operatorRateLimitKey
});
const quarantineBulkDeleteLimiter = rateLimiters.custom({
  window: Number(process.env.AUDIT_EXPORT_BULK_DELETE_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.AUDIT_EXPORT_BULK_DELETE_RATE_LIMIT_MAX) || 3,
  message: 'Too many bulk quarantine delete requests. Please try again later.',
  keyGenerator: operatorRateLimitKey
});
const auditReportReadLimiter = rateLimiters.custom({
  window: Number(process.env.AUDIT_EXPORT_REPORT_READ_RATE_LIMIT_WINDOW_MS) || 5 * 60 * 1000,
  max: Number(process.env.AUDIT_EXPORT_REPORT_READ_RATE_LIMIT_MAX) || 60,
  message: 'Too many audit report requests. Please try again later.',
  keyGenerator: operatorRateLimitKey
});

router.use(rateLimiters.api);
const auditFilters = req => ({
  events: req.query.event ? [req.query.event] : WEB_AUTHN_AUDIT_EVENTS,
  actorId: req.query.actorId,
  actorType: req.query.actorType,
  targetId: req.query.targetId,
  targetType: req.query.targetType,
  outcome: req.query.outcome
});
const queryValidation = [
  query('event').optional().isIn(WEB_AUTHN_AUDIT_EVENTS),
  query('actorId').optional().trim().isLength({ min: 1, max: 128 }),
  query('actorType').optional().isIn(['user', 'patient', 'system']),
  query('targetId').optional().trim().isLength({ min: 1, max: 128 }),
  query('targetType').optional().isIn(['user', 'patient', 'system', 'security_audit_export']),
  query('outcome').optional().isIn(['success', 'failure', 'warning'])
];

router.get(
  '/',
  protect,
  authorize(ROLES.PLATFORM_ADMIN),
  [
    ...queryValidation,
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 200 }),
    validate
  ],
  async (req, res, next) => {
    try {
      const result = await securityAuditService.list({
        ...auditFilters(req),
        page: req.query.page,
        limit: req.query.limit
      });
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/exports',
  protect,
  authorize(ROLES.PLATFORM_ADMIN),
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(EXPORT_STATUSES),
    query('storageProvider').optional().isIn(EXPORT_STORAGE_PROVIDERS),
    query('missingInvestigationNote').optional().isBoolean(),
    query('approvalQueue').optional().isBoolean(),
    validate
  ],
  async (req, res, next) => {
    try {
      const result = await securityAuditService.listExportJobs({
        requestedBy: requesterId(req),
        page: req.query.page,
        limit: req.query.limit,
        status: req.query.status,
        storageProvider: req.query.storageProvider,
        missingInvestigationNote: req.query.missingInvestigationNote === 'true',
        approvalQueue: req.query.approvalQueue === 'true'
      });
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/exports/quota',
  protect,
  authorize(ROLES.PLATFORM_ADMIN),
  async (req, res, next) => {
    try {
      const quota = await securityAuditService.getExportQuotaUsage({
        requestedBy: requesterId(req)
      });
      res.json({ success: true, quota });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/exports/retention-summary',
  protect,
  authorize(ROLES.PLATFORM_ADMIN),
  async (req, res, next) => {
    try {
      const retention = await securityAuditService.getExportRetentionSummary({
        requestedBy: requesterId(req)
      });
      res.json({ success: true, retention });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/exports/:jobId',
  protect,
  authorize(ROLES.PLATFORM_ADMIN),
  [
    param('jobId').isMongoId(),
    validate
  ],
  async (req, res, next) => {
    try {
      const job = await securityAuditService.getExportJob({
        jobId: req.params.jobId,
        requestedBy: requesterId(req)
      });
      if (!job) return res.status(404).json({ success: false, message: 'Audit export job not found' });
      res.json({ success: true, export: job });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/exports/:jobId/audit-events/report',
  protect,
  authorize(ROLES.PLATFORM_ADMIN),
  [
    param('jobId').isMongoId(),
    validate
  ],
  async (req, res, next) => {
    try {
      const reportJob = await securityAuditService.createExportAuditReportJob({
        jobId: req.params.jobId,
        requestedBy: requesterId(req),
        req
      });
      if (!reportJob) return res.status(404).json({ success: false, message: 'Audit export job not found' });
      res.status(202).json({ success: true, report: reportJob });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/exports/:jobId/audit-events/report/:reportJobId',
  protect,
  authorize(ROLES.PLATFORM_ADMIN),
  [
    param('jobId').isMongoId(),
    param('reportJobId').isMongoId(),
    validate
  ],
  async (req, res, next) => {
    try {
      const reportJob = await securityAuditService.getExportAuditReportJob({
        jobId: req.params.jobId,
        reportJobId: req.params.reportJobId,
        requestedBy: requesterId(req)
      });
      if (!reportJob) return res.status(404).json({ success: false, message: 'Lifecycle report job not found' });
      res.json({ success: true, report: reportJob });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/exports/:jobId/audit-events/report/:reportJobId/download',
  protect,
  authorize(ROLES.PLATFORM_ADMIN),
  [
    param('jobId').isMongoId(),
    param('reportJobId').isMongoId(),
    validate
  ],
  async (req, res, next) => {
    try {
      const download = await securityAuditService.getExportAuditReportDownload({
        jobId: req.params.jobId,
        reportJobId: req.params.reportJobId,
        requestedBy: requesterId(req)
      });
      if (!download) {
        return res.status(404).json({ success: false, message: 'Completed lifecycle report job not found' });
      }
      await securityAuditService.markExportAuditReportDownloaded({
        reportJob: download.reportJob,
        requestedBy: requesterId(req),
        req
      });

      if (download.type === 'redirect') {
        return res.redirect(302, download.url);
      }

      res.download(download.filePath, download.filename, (error) => {
        if (error && !res.headersSent) next(error);
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/exports/:jobId/audit-events',
  protect,
  authorize(ROLES.PLATFORM_ADMIN),
  [
    param('jobId').isMongoId(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    validate
  ],
  async (req, res, next) => {
    try {
      const result = await securityAuditService.getExportAuditEvents({
        jobId: req.params.jobId,
        requestedBy: requesterId(req),
        page: req.query.page,
        limit: req.query.limit
      });
      if (!result) return res.status(404).json({ success: false, message: 'Audit export job not found' });
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/exports/:jobId/audit-events/export',
  protect,
  authorize(ROLES.PLATFORM_ADMIN),
  [
    param('jobId').isMongoId(),
    validate
  ],
  async (req, res, next) => {
    try {
      const report = await securityAuditService.getExportAuditReport({
        jobId: req.params.jobId,
        requestedBy: requesterId(req)
      });
      if (!report) return res.status(404).json({ success: false, message: 'Audit export job not found' });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
      res.send(report.csv);
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/exports/:jobId/quarantine/approval-history/export',
  protect,
  authorize(ROLES.PLATFORM_ADMIN),
  [
    param('jobId').isMongoId(),
    validate
  ],
  async (req, res, next) => {
    try {
      const report = await securityAuditService.getQuarantineApprovalHistoryReport({
        jobId: req.params.jobId,
        requestedBy: requesterId(req)
      });
      if (!report) return res.status(404).json({ success: false, message: 'Quarantine approval history not found' });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
      res.send(report.csv);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/exports/:jobId/quarantine/approval-history/report',
  protect,
  authorize(ROLES.PLATFORM_ADMIN),
  [
    param('jobId').isMongoId(),
    validate
  ],
  async (req, res, next) => {
    try {
      const reportJob = await securityAuditService.createQuarantineApprovalHistoryReportJob({
        jobId: req.params.jobId,
        requestedBy: requesterId(req),
        req
      });
      if (!reportJob) return res.status(404).json({ success: false, message: 'Audit export job not found' });
      res.status(202).json({ success: true, report: reportJob });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/exports/:jobId/quarantine/approval-history/report/:reportJobId',
  protect,
  authorize(ROLES.PLATFORM_ADMIN),
  auditReportReadLimiter,
  [
    param('jobId').isMongoId(),
    param('reportJobId').isMongoId(),
    validate
  ],
  async (req, res, next) => {
    try {
      const reportJob = await securityAuditService.getQuarantineApprovalHistoryReportJob({
        jobId: req.params.jobId,
        reportJobId: req.params.reportJobId,
        requestedBy: requesterId(req)
      });
      if (!reportJob) return res.status(404).json({ success: false, message: 'Approval-history report job not found' });
      res.json({ success: true, report: reportJob });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/exports/:jobId/quarantine/approval-history/report/:reportJobId/download',
  protect,
  authorize(ROLES.PLATFORM_ADMIN),
  auditReportReadLimiter,
  [
    param('jobId').isMongoId(),
    param('reportJobId').isMongoId(),
    validate
  ],
  async (req, res, next) => {
    try {
      const download = await securityAuditService.getQuarantineApprovalHistoryReportDownload({
        jobId: req.params.jobId,
        reportJobId: req.params.reportJobId,
        requestedBy: requesterId(req)
      });
      if (!download) {
        return res.status(404).json({ success: false, message: 'Completed approval-history report job not found' });
      }
      await securityAuditService.markQuarantineApprovalHistoryReportDownloaded({
        reportJob: download.reportJob,
        requestedBy: requesterId(req),
        req
      });

      if (download.type === 'redirect') {
        return res.redirect(302, download.url);
      }

      res.download(download.filePath, download.filename, (error) => {
        if (error && !res.headersSent) next(error);
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/exports',
  protect,
  authorize(ROLES.PLATFORM_ADMIN),
  [
    ...queryValidation,
    validate
  ],
  async (req, res, next) => {
    try {
      const job = await securityAuditService.createExportJob({
        filters: auditFilters(req),
        requestedBy: requesterId(req),
        req
      });
      res.status(202).json({ success: true, export: job });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/exports/cleanup',
  protect,
  authorize(ROLES.PLATFORM_ADMIN),
  async (req, res, next) => {
    try {
      const result = await securityAuditService.bulkCleanupExportJobs({
        requestedBy: requesterId(req),
        req
      });
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/exports/quarantine/stale/delete',
  protect,
  authorize(ROLES.PLATFORM_ADMIN),
  quarantineBulkDeleteLimiter,
  [
    body('investigationNote').optional().trim().isLength({ max: 2000 }),
    body('olderThanHours').optional().isInt({ min: 1, max: 8760 }),
    body('dryRun').optional().isBoolean(),
    validate
  ],
  async (req, res, next) => {
    try {
      const result = await securityAuditService.bulkDeleteStaleQuarantinedExports({
        requestedBy: requesterId(req),
        investigationNote: req.body?.investigationNote,
        olderThanHours: req.body?.olderThanHours,
        dryRun: req.body?.dryRun === true || req.body?.dryRun === 'true',
        req
      });
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/exports/:jobId/cancel',
  protect,
  authorize(ROLES.PLATFORM_ADMIN),
  [
    param('jobId').isMongoId(),
    validate
  ],
  async (req, res, next) => {
    try {
      const job = await securityAuditService.cancelExportJob({
        jobId: req.params.jobId,
        requestedBy: requesterId(req),
        req
      });
      if (!job) return res.status(404).json({ success: false, message: 'Pending audit export job not found' });
      res.json({ success: true, export: job });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/exports/:jobId/retry',
  protect,
  authorize(ROLES.PLATFORM_ADMIN),
  [
    param('jobId').isMongoId(),
    validate
  ],
  async (req, res, next) => {
    try {
      const job = await securityAuditService.retryExportJob({
        jobId: req.params.jobId,
        requestedBy: requesterId(req),
        req
      });
      if (!job) return res.status(404).json({ success: false, message: 'Failed audit export job not found' });
      res.status(202).json({ success: true, export: job });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/exports/:jobId/quarantine/release',
  protect,
  authorize(ROLES.PLATFORM_ADMIN),
  quarantineReleaseRequestLimiter,
  [
    param('jobId').isMongoId(),
    body('investigationNote').optional().trim().isLength({ max: 2000 }),
    validate
  ],
  async (req, res, next) => {
    try {
      const job = await securityAuditService.releaseQuarantinedExportJob({
        jobId: req.params.jobId,
        requestedBy: requesterId(req),
        investigationNote: req.body?.investigationNote,
        req
      });
      if (!job) return res.status(404).json({ success: false, message: 'Quarantined audit export job not found' });
      res.status(202).json({ success: true, export: job });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/exports/:jobId/quarantine/release/approve',
  protect,
  authorize(ROLES.PLATFORM_ADMIN),
  [
    param('jobId').isMongoId(),
    body('investigationNote').optional().trim().isLength({ max: 2000 }),
    validate
  ],
  async (req, res, next) => {
    try {
      const job = await securityAuditService.approveQuarantinedExportRelease({
        jobId: req.params.jobId,
        requestedBy: requesterId(req),
        investigationNote: req.body?.investigationNote,
        req
      });
      if (!job) return res.status(404).json({ success: false, message: 'Quarantined audit export job not found' });
      res.json({ success: true, export: job });
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  '/exports/:jobId/quarantine',
  protect,
  authorize(ROLES.PLATFORM_ADMIN),
  [
    param('jobId').isMongoId(),
    body('investigationNote').optional().trim().isLength({ max: 2000 }),
    validate
  ],
  async (req, res, next) => {
    try {
      const result = await securityAuditService.deleteQuarantinedExportJob({
        jobId: req.params.jobId,
        requestedBy: requesterId(req),
        investigationNote: req.body?.investigationNote,
        req
      });
      if (!result) return res.status(404).json({ success: false, message: 'Quarantined audit export job not found' });
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/exports/:jobId/download',
  protect,
  authorize(ROLES.PLATFORM_ADMIN),
  [
    param('jobId').isMongoId(),
    validate
  ],
  async (req, res, next) => {
    try {
      const download = await securityAuditService.getExportDownload({
        jobId: req.params.jobId,
        requestedBy: requesterId(req)
      });
      if (!download) {
        return res.status(404).json({ success: false, message: 'Completed audit export job not found' });
      }
      await securityAuditService.markExportDownloaded({
        job: download.job,
        requestedBy: requesterId(req),
        req
      });

      if (download.type === 'redirect') {
        return res.redirect(302, download.url);
      }

      res.download(download.filePath, download.filename, (error) => {
        if (error && !res.headersSent) next(error);
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
