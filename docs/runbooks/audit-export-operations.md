# Audit Export Operations Runbook

## Purpose

Audit exports can contain sensitive security data. Exports that fail checksum verification enter quarantine and require investigation before they can be downloaded or deleted.

## Quarantine Release Approval

1. Open the Operator Audit page.
2. Filter export jobs by `Quarantined`.
3. Review the export lifecycle, checksum details, and approval history.
4. If release is justified, click `Request Release` and add an investigation note.
5. A second platform operator must open the same page, enable `Needs my release approval`, review the history, and click `Approve Release`.
6. The original requesting operator cannot approve their own release request.

Release approval sends a notification through:

- Email webhook: `EMAIL_WEBHOOK_URL` or `NOTIFICATION_EMAIL_WEBHOOK_URL`
- Optional Slack webhook: `AUDIT_EXPORT_OPERATOR_SLACK_WEBHOOK_URL` or `SECURITY_OPERATIONS_SLACK_WEBHOOK_URL`
- Optional fallback emails: `AUDIT_EXPORT_OPERATOR_APPROVAL_EMAILS`, `SECURITY_OPERATIONS_EMAIL`, or `ADMIN_EMAIL`

Do not store webhook URLs or tokens in this document.

## Deleting Quarantined Exports

Operators can delete an individual quarantined export after investigation. Deletion removes the underlying file or cloud object, but the export job record remains until TTL cleanup with append-only investigation history.

For stale quarantined exports, use `Dry Run Stale Quarantine Delete` from the Operator Audit page before taking destructive action. The dry run reports the candidate count without deleting files, changing job status, or appending investigation history.

After review, use `Bulk Delete Stale Quarantined` from the Operator Audit page. This deletes unreleased quarantined exports owned by the current operator that are older than the investigation SLA.

Operator actions are rate limited per platform operator:

```text
AUDIT_EXPORT_RELEASE_REQUEST_RATE_LIMIT_WINDOW_MS
AUDIT_EXPORT_RELEASE_REQUEST_RATE_LIMIT_MAX
AUDIT_EXPORT_BULK_DELETE_RATE_LIMIT_WINDOW_MS
AUDIT_EXPORT_BULK_DELETE_RATE_LIMIT_MAX
```

## Auto-Delete Policy

Unreleased quarantined exports are auto-deleted after:

```text
AUDIT_EXPORT_QUARANTINE_MAX_AGE_HOURS
```

Default: `168` hours.

The scheduled audit export cleanup worker deletes the underlying object, marks the job as `deleted`, and appends an `auto_deleted` investigation history entry.

## SLA Monitoring

The investigation SLA is configured with:

```text
AUDIT_EXPORT_QUARANTINE_INVESTIGATION_SLA_HOURS
```

Default: `24` hours.

Prometheus alert:

```text
AuditExportQuarantineInvestigationSlaBreached
```

This fires when one or more quarantined exports exceed the configured SLA.

## Notification Failure Monitoring

Prometheus alert:

```text
AuditExportReleaseApprovalNotificationFailures
```

This fires when email or Slack delivery for release approval requests fails. The release request itself remains recorded even if notification delivery fails.

## Verification

Run focused tests:

```bash
npm test -- --runTestsByPath tests/unit/security/audit-export-operator-notification.test.js
npm test -- --runTestsByPath tests/integration/security/audit-export-quarantine-flow.test.js
```

To force the Mongo-backed quota and quarantine assertions locally, start a test MongoDB instance and set `MONGODB_URI`, then run:

```bash
npm run test:audit-export:db
```

This command enables:

```text
RUN_AUDIT_EXPORT_QUOTA_REAL_DB=true
RUN_AUDIT_EXPORT_QUARANTINE_FLOW_REAL_DB=true
```

In CI, the quarantine-flow integration test runs against the replica-set MongoDB test environment with:

```text
RUN_AUDIT_EXPORT_QUARANTINE_FLOW_REAL_DB=true
```
