const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');
// eslint-disable-next-line security/detect-non-literal-fs-filename
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

describe('WebAuthn, security outbox, and production alert contracts', () => {
  it('exposes real WebAuthn registration and assertion verification routes', () => {
    const routes = read('routes/webAuthn.js');
    const rateLimits = read('middleware/webauthnRateLimit.js');
    const service = read('services/webAuthnService.js');
    expect(routes).toContain('/credentials');
    expect(routes).toContain('/registration/options');
    expect(routes).toContain('/registration/verify');
    expect(routes).toContain('/password-change/options');
    expect(routes).toContain('/password-change/verify');
    expect(routes).toContain('/recovery-codes');
    expect(routes).toContain('/lost-device/recover');
    expect(routes).toContain('recoveryCodeGenerationLimiter');
    expect(routes).toContain('lostDeviceRecoveryLimiter');
    expect(rateLimits).toContain('WEBAUTHN_RECOVERY_CODE_GENERATION_MAX');
    expect(rateLimits).toContain('WEBAUTHN_LOST_DEVICE_RECOVERY_MAX');
    expect(service).toContain('listCredentials');
    expect(service).toContain('revokeCredential');
    expect(service).toContain('generateRecoveryCodes');
    expect(service).toContain('recoverLostDevice');
    expect(service).toContain('verifyRegistrationResponse');
    expect(service).toContain('verifyAuthenticationResponse');
    expect(service).toContain('consumePasswordConfirmation');
  });

  it('records and exposes operator audit views for sensitive WebAuthn recovery events', () => {
    const controller = read('controllers/webAuthnController.js');
    const adminRoute = read('routes/admin/securityAudit.js');
    const auditService = read('services/securityAuditService.js');
    const exportJobModel = read('models/securityAuditExportJob.js');
    const lifecycleReportModel = read('models/securityAuditLifecycleReportJob.js');
    const lifecycleReportScheduler = read('services/auditLifecycleReportCleanupScheduler.js');
    const auditOperatorNotificationService = read('services/auditExportOperatorNotificationService.js');
    const operatorAuditHtml = read('client/public/roles/admin/operator-audit.html');
    const operatorAuditJs = read('client/public/js/operator-audit.js');
    const adminSettings = read('client/public/js/admin-settings.js');

    for (const event of [
      'webauthn_recovery_codes_generated',
      'webauthn_lost_device_recovered',
      'webauthn_lost_device_recovery_failed',
      'webauthn_passkey_revoked'
    ]) {
      expect(controller).toContain(event);
      expect(adminRoute).toContain(event);
    }

    expect(adminRoute).toContain('ROLES.PLATFORM_ADMIN');
    expect(auditService).toContain('const list = async');
    expect(auditService).toContain('createExportJob');
    expect(auditService).toContain('processExportJob');
    expect(auditService).toContain('getExportDownload');
    expect(auditService).toContain('listExportJobs');
    expect(auditService).toContain('cancelExportJob');
    expect(auditService).toContain('retryExportJob');
    expect(auditService).toContain('markExportDownloaded');
    expect(auditService).toContain('releaseQuarantinedExportJob');
    expect(auditService).toContain('approveQuarantinedExportRelease');
    expect(auditService).toContain('deleteQuarantinedExportJob');
    expect(auditService).toContain('quarantineInvestigation');
    expect(auditService).toContain('releaseRequestedBy');
    expect(auditService).toContain('release_approved');
    expect(auditService).toContain('security_audit_export_quarantine_released_by_operator_total');
    expect(auditService).toContain('security_audit_export_quarantine_deleted_by_operator_total');
    expect(auditService).toContain('getExportQuotaUsage');
    expect(auditService).toContain('getExportRetentionSummary');
    expect(auditService).toContain('updateQuarantineSlaMetrics');
    expect(auditService).toContain('cleanupOverageQuarantinedExports');
    expect(auditService).toContain('bulkDeleteStaleQuarantinedExports');
    expect(auditService).toContain('notifyQuarantineReleaseRequested');
    expect(auditService).toContain('getExportAuditEvents');
    expect(auditService).toContain('processPendingRetries');
    expect(auditService).toContain('bulkCleanupExportJobs');
    expect(auditService).toContain('enforceExportQuota');
    expect(auditService).toContain('AUDIT_EXPORT_OPERATOR_DAILY_LIMIT');
    expect(auditService).toContain('AUDIT_EXPORT_OPERATOR_ACTIVE_LIMIT');
    expect(auditService).toContain('AUDIT_EXPORT_MAX_RETRY_ATTEMPTS');
    expect(auditService).toContain('AUDIT_EXPORT_RETRY_BACKOFF_MS');
    expect(auditService).toContain('security_audit_export_duration_ms_total');
    expect(auditService).toContain('security_audit_export_bytes_written_total');
    expect(auditService).toContain('security_audit_export_signed_download_issued_total');
    expect(auditService).toContain('security_audit_export_retry_limit_exhausted_total');
    expect(auditService).toContain('security_audit_export_checksum_mismatch_total');
    expect(auditService).toContain('quarantined');
    expect(auditService).toContain('getExportAuditReport');
    expect(auditService).toContain('createExportAuditReportJob');
    expect(auditService).toContain('getExportAuditReportDownload');
    expect(auditService).toContain('cleanupExpiredLifecycleReports');
    expect(auditService).toContain('auditExportStorageService.putFile');
    expect(auditService).toContain('security_audit_export_created');
    expect(auditService).toContain('security_audit_export_downloaded');
    expect(auditService).toContain('security_audit_export_cancelled');
    expect(auditService).toContain('security_audit_export_quarantine_release_requested');
    expect(auditService).toContain('security_audit_export_quarantine_released');
    expect(auditService).toContain('security_audit_export_quarantine_deleted');
    expect(auditService).toContain('security_audit_export_lifecycle_report_created');
    expect(auditService).toContain('security_audit_export_lifecycle_report_downloaded');
    expect(auditService).toContain('security_audit_export_cleanup_deleted');
    expect(auditService).toContain('recoveryCode');
    expect(auditService).toContain('targetId');
    expect(adminRoute).toContain('/exports');
    expect(adminRoute).toContain('/exports/:jobId/download');
    expect(adminRoute).toContain('/exports/:jobId/cancel');
    expect(adminRoute).toContain('/exports/:jobId/retry');
    expect(adminRoute).toContain('/exports/:jobId/quarantine/release');
    expect(adminRoute).toContain('/exports/:jobId/quarantine/release/approve');
    expect(adminRoute).toContain('/exports/:jobId/quarantine');
    expect(adminRoute).toContain('/exports/quarantine/stale/delete');
    expect(adminRoute).toContain('/exports/quota');
    expect(adminRoute).toContain('/exports/retention-summary');
    expect(adminRoute).toContain('/exports/:jobId/audit-events');
    expect(adminRoute).toContain('/exports/:jobId/audit-events/export');
    expect(adminRoute).toContain('/exports/:jobId/audit-events/report');
    expect(adminRoute).toContain('/exports/:jobId/audit-events/report/:reportJobId/download');
    expect(adminRoute).toContain('/exports/cleanup');
    expect(adminRoute).toContain("query('status').optional().isIn(EXPORT_STATUSES)");
    expect(adminRoute).toContain("query('storageProvider').optional().isIn(EXPORT_STORAGE_PROVIDERS)");
    expect(exportJobModel).toContain('expireAfterSeconds: 0');
    expect(exportJobModel).toContain("enum: ['pending', 'running', 'completed', 'failed', 'cancelled', 'dead_letter', 'quarantined', 'deleted']");
    expect(exportJobModel).toContain('storageProvider');
    expect(exportJobModel).toContain('storageKey');
    expect(exportJobModel).toContain('encryption');
    expect(exportJobModel).toContain('checksum');
    expect(exportJobModel).toContain('quarantineInvestigation');
    expect(exportJobModel).toContain('history');
    expect(exportJobModel).toContain('release_requested');
    expect(exportJobModel).toContain('release_approved');
    expect(exportJobModel).toContain('auto_deleted');
    expect(exportJobModel).toContain('actorType');
    expect(exportJobModel).toContain("'quarantineInvestigation.releaseRequestedBy': 1");
    expect(exportJobModel).toContain("'quarantineInvestigation.releaseApprovedBy': 1");
    expect(exportJobModel).toContain('estimatedRows');
    expect(exportJobModel).toContain('progressPercent');
    expect(lifecycleReportModel).toContain('SecurityAuditLifecycleReportJob');
    expect(lifecycleReportModel).toContain('expireAfterSeconds: 0');
    expect(lifecycleReportModel).toContain('storageProvider');
    expect(lifecycleReportModel).toContain('checksum');
    expect(lifecycleReportScheduler).toContain('cleanupExpiredLifecycleReports');
    expect(lifecycleReportScheduler).toContain('security_audit_lifecycle_report_cleanup_runs_total');
    expect(lifecycleReportScheduler).toContain('security_audit_lifecycle_report_cleanup_deleted_total');
    expect(read('services/auditExportCleanupScheduler.js')).toContain('cleanupOverageQuarantinedExports');
    expect(auditOperatorNotificationService).toContain('AUDIT_EXPORT_OPERATOR_SLACK_WEBHOOK_URL');
    expect(auditOperatorNotificationService).toContain('sendAuditExportReleaseApprovalRequest');
    expect(read('services/emailNotificationService.js')).toContain('sendAuditExportReleaseApprovalRequest');
    expect(read('server.js')).toContain('auditLifecycleReportCleanupScheduler.start()');
    expect(read('server.js')).toContain('auditLifecycleReportCleanupScheduler.stop()');
    expect(adminRoute).toContain("query('actorId')");
    expect(adminRoute).toContain("query('targetId')");
    expect(adminSettings).toContain('adminSecurityAudit.webauthn');
    expect(adminSettings).toContain('renderSecurityAudit');
    expect(operatorAuditHtml).toContain('operatorAuditFilters');
    expect(operatorAuditJs).toContain('exportCsv');
    expect(operatorAuditJs).toContain('adminSecurityAudit.webauthnExports');
    expect(operatorAuditJs).toContain('adminSecurityAudit.webauthnExportJob');
    expect(operatorAuditJs).toContain('adminSecurityAudit.webauthnExportAuditEvents');
    expect(operatorAuditJs).toContain('adminSecurityAudit.webauthnExportAuditEventsCsv');
    expect(operatorAuditJs).toContain('adminSecurityAudit.webauthnExportAuditReport');
    expect(operatorAuditJs).toContain('adminSecurityAudit.webauthnExportAuditReportDownload');
    expect(operatorAuditJs).toContain('adminSecurityAudit.webauthnExportCancel');
    expect(operatorAuditJs).toContain('adminSecurityAudit.webauthnExportCleanup');
    expect(operatorAuditJs).toContain('adminSecurityAudit.webauthnExportQuota');
    expect(operatorAuditJs).toContain('adminSecurityAudit.webauthnExportRetentionSummary');
    expect(operatorAuditJs).toContain('adminSecurityAudit.webauthnExportBulkDeleteStaleQuarantine');
    expect(operatorAuditJs).toContain('adminSecurityAudit.webauthnExportQuarantineRelease');
    expect(operatorAuditJs).toContain('adminSecurityAudit.webauthnExportQuarantineReleaseApprove');
    expect(operatorAuditJs).toContain('adminSecurityAudit.webauthnExportQuarantineDelete');
    expect(operatorAuditJs).toContain('quarantineInvestigation');
    expect(operatorAuditJs).toContain('confirmQuarantineAction');
    expect(operatorAuditJs).toContain('renderRetentionSummary');
    expect(operatorAuditJs).toContain('renderApprovalHistory');
    expect(operatorAuditJs).toContain('quarantineSlaBadge');
    expect(operatorAuditJs).toContain('bulkDeleteStaleQuarantinedExports');
    expect(operatorAuditJs).toContain('adminSecurityAudit.webauthnExportRetry');
    expect(operatorAuditJs).toContain('adminSecurityAudit.webauthnExportDownload');
    expect(operatorAuditJs).toContain('renderExportJobs');
    expect(operatorAuditJs).toContain('progressPercent');
    expect(operatorAuditJs).toContain('encryptionMode');
    expect(operatorAuditJs).toContain('exportStatusFilter');
    expect(operatorAuditJs).toContain('exportStorageFilter');
    expect(operatorAuditJs).toContain('renderExportAuditEvents');
    expect(operatorAuditHtml).toContain('operatorAuditExportJobs');
    expect(operatorAuditHtml).toContain('operatorAuditExportDetail');
    expect(operatorAuditHtml).toContain('operatorAuditQuota');
    expect(operatorAuditHtml).toContain('operatorAuditRetentionSummary');
    expect(operatorAuditHtml).toContain('exportMissingInvestigationFilter');
    expect(operatorAuditHtml).toContain('exportApprovalQueueFilter');
    expect(operatorAuditHtml).toContain('bulkDeleteStaleQuarantinedExports');
    expect(operatorAuditHtml).toContain('quarantineActionModal');
    expect(operatorAuditHtml).toContain('quarantineInvestigationNote');
    expect(operatorAuditHtml).toContain('dead_letter');
    expect(operatorAuditHtml).toContain('quarantined');
    expect(operatorAuditHtml).toContain('deleted');
    expect(operatorAuditJs).toContain('currentPagination');
    expect(operatorAuditJs).toContain('actorId');
    expect(operatorAuditJs).toContain('targetId');
  });

  it('supports cloud-backed audit exports with scheduled orphan cleanup', () => {
    const storageService = read('services/auditExportStorageService.js');
    const cleanupScheduler = read('services/auditExportCleanupScheduler.js');
    const server = read('server.js');
    expect(storageService).toContain('AUDIT_EXPORT_STORAGE_PROVIDER');
    expect(storageService).toContain('AUDIT_EXPORT_GCS_BUCKET');
    expect(storageService).toContain('AUDIT_EXPORT_S3_BUCKET');
    expect(storageService).toContain('AUDIT_EXPORT_S3_ENDPOINT');
    expect(storageService).toContain('AUDIT_EXPORT_S3_SSE');
    expect(storageService).toContain('AUDIT_EXPORT_GCS_KMS_KEY_NAME');
    expect(storageService).toContain('signedDownloadUrl');
    expect(storageService).toContain('HeadObjectCommand');
    expect(storageService).toContain('sha256File');
    expect(storageService).toContain('verifyUploadedChecksum');
    expect(storageService).toContain('getSignedUrl');
    expect(storageService).toContain('DeleteObjectCommand');
    expect(storageService).toContain('cleanupOrphanedObjects');
    expect(storageService).toContain('ListObjectsV2Command');
    expect(cleanupScheduler).toContain('cleanupExpiredExports');
    expect(cleanupScheduler).toContain('processPendingRetries');
    expect(cleanupScheduler).toContain('AUDIT_EXPORT_CLEANUP_INTERVAL_MS');
    expect(server).toContain('auditExportCleanupScheduler.start()');
    expect(server).toContain('auditExportCleanupScheduler.stop()');
    expect(read('tests/unit/security/audit-export-storage-cloud.test.js')).toContain('ServerSideEncryption');
    expect(read('tests/integration/security/audit-export-s3-localstack.test.js')).toContain('RUN_AUDIT_EXPORT_S3_LOCALSTACK');
    expect(read('tests/integration/security/audit-export-gcs-live.test.js')).toContain('RUN_AUDIT_EXPORT_GCS_LIVE');
    expect(read('.github/workflows/ci.yml')).toContain('Audit Export S3 LocalStack Contract');
    expect(read('.github/workflows/ci.yml')).toContain('Audit Export GCS Storage Contract');
    expect(read('.github/workflows/ci.yml')).toContain('Audit Export Live GCS Integration');
    expect(read('.github/workflows/ci.yml')).toContain('workload_identity_provider');
    const alerts = read('prometheus/alerts/app-alerts.yml');
    expect(alerts).toContain('AuditExportHighFailureRate');
    expect(alerts).toContain('AuditExportRetryLimitExhausted');
    expect(alerts).toContain('AuditExportSignedDownloadSpike');
    expect(alerts).toContain('AuditExportChecksumMismatch');
    expect(alerts).toContain('AuditExportQuarantineInvestigationSlaBreached');
    expect(alerts).toContain('nocturnal_security_audit_exports_quarantined_over_sla');
    expect(alerts).toContain('AuditExportReleaseApprovalNotificationFailures');
    expect(alerts).toContain('nocturnal_security_audit_export_release_approval_notification_failures_total');
    expect(alerts).toContain('nocturnal:security_audit_export_failure_ratio:15m');
    expect(read('prometheus/rules/audit-export-recording-rules.yml')).toContain('nocturnal:security_audit_export_failure_ratio:15m');
    const dashboard = read('views/dashboard/rate-limits.html');
    const dashboardJs = read('client/public/js/rate-limit-dashboard.js');
    expect(dashboard).toContain('auditExportLifecycleTable');
    expect(dashboard).toContain('auditExportFailureRatioChart');
    expect(dashboardJs).toContain('renderAuditExportMetrics');
    expect(dashboardJs).toContain('auditExportFailureRatioChart');
    expect(read('routes/admin/metrics.js')).toContain('getAuditExportMetrics');
    expect(read('routes/admin/metrics.js')).toContain('failureRatio');
    expect(read('tests/unit/security/audit-export-retry-policy.test.js')).toContain('processPendingRetries');
    expect(read('tests/integration/security/audit-export-quota.test.js')).toContain('RUN_AUDIT_EXPORT_QUOTA_REAL_DB');
    expect(read('tests/integration/security/audit-export-quarantine-flow.test.js')).toContain('RUN_AUDIT_EXPORT_QUARANTINE_FLOW_REAL_DB');
    expect(read('tests/unit/security/audit-export-operator-notification.test.js')).toContain('global.fetch');
    expect(read('docs/runbooks/audit-export-operations.md')).toContain('Quarantine Release Approval');
    expect(read('docs/runbooks/audit-export-operations.md')).toContain('AUDIT_EXPORT_QUARANTINE_MAX_AGE_HOURS');
    expect(read('.github/workflows/ci.yml')).toContain('Run audit export quota integration test against replica set');
    expect(read('.github/workflows/ci.yml')).toContain('Run audit export quarantine flow integration test against replica set');
  });

  it('emits recovery-code limiter metrics by identity type', () => {
    const rateLimits = read('middleware/webauthnRateLimit.js');
    const operationalMetrics = read('utils/operationalMetrics.js');
    const metricsRoute = read('routes/admin/metrics.js');
    const dashboard = read('views/dashboard/rate-limits.html');
    const dashboardJs = read('client/public/js/rate-limit-dashboard.js');

    expect(rateLimits).toContain('incrementLabeled(metricName, { identity_type: identityType(req) })');
    expect(operationalMetrics).toContain('labeledCounters');
    expect(metricsRoute).toContain('operations.labeledCounters');
    expect(metricsRoute).toContain('formatLabels');
    expect(metricsRoute).toContain('recoveryCodeLimiterHitsByIdentityType');
    expect(dashboard).toContain('recoveryCodeIdentityTypeTable');
    expect(dashboard).toContain('/js/rate-limit-dashboard.js');
    expect(dashboard).not.toMatch(/<script(?![^>]*src=)/);
    expect(dashboardJs).toContain('adminMetrics.rateLimits');
    expect(dashboardJs).not.toContain('innerHTML');
  });

  it('provides one-time recovery-code download and print UX warnings', () => {
    const sessionManagement = read('client/public/js/session-management.js');
    const doctorProfile = read('client/public/roles/doctor/doctor-profile-enhanced.html');
    const patientDashboard = read('client/public/roles/patient/patient-dashboard.html');

    expect(sessionManagement).toContain('downloadRecoveryCodes');
    expect(sessionManagement).toContain('printRecoveryCodes');
    expect(sessionManagement).toContain('These codes were shown only once');
    expect(doctorProfile).toContain('downloadRecoveryCodes');
    expect(doctorProfile).toContain('printRecoveryCodes');
    expect(patientDashboard).toContain('downloadRecoveryCodes');
    expect(patientDashboard).toContain('printRecoveryCodes');
  });

  it('creates the security notification outbox inside password-change persistence', () => {
    const passwordService = read('services/passwordSecurityService.js');
    const outboxModel = read('models/securityNotificationOutbox.js');
    const outboxService = read('services/securityNotificationOutboxService.js');
    expect(passwordService).toContain('SecurityNotificationOutbox.create');
    expect(passwordService).toContain('payloadEncrypted');
    expect(passwordService).toContain('encodePayload');
    expect(outboxModel).toContain('payloadEncrypted');
    expect(outboxModel).toContain('purgeAfter');
    expect(outboxService).toContain('decodePayload');
    expect(outboxService).toContain('purgeAfter: retentionDate()');
    expect(passwordService).toContain('session.withTransaction');
    expect(passwordService).toContain('consumePasswordConfirmation');
  });

  it('defines production alerts for revocation and notification failures', () => {
    const prometheus = read('prometheus/alerts/app-alerts.yml');
    const alertmanager = read('prometheus/alertmanager.yml');
    const template = read('prometheus/templates/nocturnal.tmpl');
    const ci = read('.github/workflows/ci.yml');
    const kubernetes = read('k8s/monitoring.yaml');
    for (const alert of [
      'PasswordChangeRevokedZeroSessions',
      'SecurityNotificationDeliveryFailures',
      'SecurityNotificationOutboxDeadLetters'
    ]) {
      expect(prometheus).toContain(alert);
      expect(kubernetes).toContain(alert);
    }
    expect(alertmanager).toContain("templates:");
    expect(alertmanager).toContain("slack_configs:");
    expect(template).toContain('define "nocturnal.title"');
    expect(template).toContain('define "nocturnal.security.text"');
    expect(ci).toContain('Alertmanager Config Validation');
    expect(ci).toContain('amtool');
    expect(ci).toContain('check-config');
    expect(ci).toContain('Render Alertmanager templates with Alertmanager Go package');
    expect(ci).toContain('go get github.com/prometheus/alertmanager@v0.28.1');
    expect(read('scripts/render-alertmanager-template.go')).toContain('alertmanager template rendering ok');
  });

  it('keeps the staging WebAuthn smoke test opt-in and HTTPS-only', () => {
    const packageJson = read('package.json');
    const stagingSmoke = read('tests/e2e-webauthn/staging-webauthn-smoke.playwright.spec.cjs');
    const workflow = read('.github/workflows/staging-webauthn-smoke.yml');
    expect(packageJson).toContain('test:e2e:webauthn:staging');
    expect(stagingSmoke).toContain('RUN_STAGING_WEBAUTHN_SMOKE');
    expect(stagingSmoke).toContain('STAGING_WEBAUTHN_BASE_URL');
    expect(stagingSmoke).toContain("startsWith('https://')");
    expect(stagingSmoke).toContain('WebAuthn.addVirtualAuthenticator');
    expect(workflow).toContain('environment: staging');
    expect(workflow).toContain('STAGING_TEST_API_SECRET');
    expect(workflow).toContain('STAGING_WEBAUTHN_ACCESS_TOKEN');
    expect(workflow).toContain('STAGING_WEBAUTHN_COOKIE');
    expect(workflow).toContain('temporary smoke account automatically');
  });

  it('keeps staging-only smoke account APIs gated and mounted', () => {
    const routes = read('routes/stagingWebAuthnSmoke.js');
    const service = read('services/stagingWebAuthnSmokeService.js');
    const userModel = read('models/user.js');
    const v1 = read('routes/v1/index.js');
    expect(routes).toContain("process.env.NODE_ENV === 'staging'");
    expect(routes).toContain("process.env.ENABLE_STAGING_TEST_APIS === 'true'");
    expect(routes).toContain('STAGING_TEST_API_SECRET');
    expect(routes).toContain('/webauthn-smoke/accounts');
    expect(service).toContain('webauthn-smoke-');
    expect(service).toContain('generateAccessToken');
    expect(service).toContain('WebAuthnChallenge.deleteMany');
    expect(service).toContain('smokeTestExpiresAt');
    expect(userModel).toContain('smokeTestExpiresAt');
    expect(userModel).toContain('expireAfterSeconds: 0');
    expect(v1).toContain("router.use('/staging', stagingWebAuthnSmokeRoutes)");
    expect(read('tests/integration/security/staging-webauthn-smoke-api.test.js')).toContain('/api/v1/staging/webauthn-smoke/accounts');
  });

  it('requires an explicit trusted proxy IP before accepting location headers', () => {
    const metadata = read('utils/requestSecurityMetadata.js');
    expect(metadata).toContain('TRUSTED_LOCATION_PROXY_IPS');
    expect(metadata).toContain('trustedLocationProxy');
  });
});
