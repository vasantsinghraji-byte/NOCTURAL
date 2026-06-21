const User = require('../models/user');
const { ROLES } = require('../constants/roles');
const emailNotificationService = require('./emailNotificationService');
const operationalMetrics = require('../utils/operationalMetrics');
const logger = require('../utils/logger');

const getFetch = () => {
  if (typeof global.fetch !== 'function') {
    throw new Error('Global fetch is not available in this Node runtime');
  }
  return global.fetch;
};

const configuredFallbackEmails = () => String(
  process.env.AUDIT_EXPORT_OPERATOR_APPROVAL_EMAILS ||
  process.env.SECURITY_OPERATIONS_EMAIL ||
  process.env.ADMIN_EMAIL ||
  ''
)
  .split(',')
  .map(email => email.trim())
  .filter(Boolean);

const notifySlack = async ({ exportJobId, requestedBy, requestedAt }) => {
  const webhookUrl = process.env.AUDIT_EXPORT_OPERATOR_SLACK_WEBHOOK_URL ||
    process.env.SECURITY_OPERATIONS_SLACK_WEBHOOK_URL;
  if (!webhookUrl) return { sent: false, skipped: true };

  const response = await getFetch()(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: [
        'Audit export release approval required.',
        `Export job: ${exportJobId}`,
        `Requested by: ${requestedBy}`,
        `Requested at: ${requestedAt.toISOString()}`
      ].join('\n')
    })
  });
  if (!response.ok) {
    throw new Error(`Slack webhook failed with HTTP ${response.status}`);
  }
  return { sent: true };
};

const platformOperatorRecipients = async ({ excludeUserId }) => {
  const users = await User.find({
    role: ROLES.PLATFORM_ADMIN,
    _id: { $ne: excludeUserId },
    email: { $exists: true, $ne: '' }
  }).select('name email').lean();
  if (users.length > 0) return users;
  return configuredFallbackEmails().map(email => ({ email, name: 'Security operator' }));
};

const notifyQuarantineReleaseRequested = async ({ exportJobId, requestedBy }) => {
  const requestedAt = new Date();
  const recipients = await platformOperatorRecipients({ excludeUserId: requestedBy });
  const deliveries = [
    ...recipients.map(recipient => emailNotificationService.sendAuditExportReleaseApprovalRequest({
      to: recipient.email,
      operatorName: recipient.name,
      exportJobId,
      requestedBy: String(requestedBy),
      requestedAt,
      idempotencyKey: `audit-export-release-request:${exportJobId}:${requestedBy}`
    })),
    notifySlack({ exportJobId, requestedBy, requestedAt })
  ];

  const results = await Promise.allSettled(deliveries);
  const failures = results.filter(result => result.status === 'rejected');
  const sent = results.filter(result => result.status === 'fulfilled' && result.value?.sent).length;
  operationalMetrics.increment('security_audit_export_release_approval_notifications_total');
  if (sent > 0) {
    operationalMetrics.increment('security_audit_export_release_approval_notifications_sent_total', sent);
  }
  if (failures.length > 0) {
    operationalMetrics.increment('security_audit_export_release_approval_notification_failures_total', failures.length);
    logger.warn('Audit export release approval notification failed', {
      exportJobId,
      failures: failures.map(result => result.reason?.message)
    });
  }
  return { recipients: recipients.length, sent, failures: failures.length };
};

module.exports = {
  notifyQuarantineReleaseRequested
};
