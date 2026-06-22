const notificationService = require('./notificationService');
const Notification = require('../models/notification');
const emailNotificationService = require('./emailNotificationService');
const operationalMetrics = require('../utils/operationalMetrics');
const logger = require('../utils/logger');

const deliverPasswordChanged = async (payload) => {
  const {
    identityId,
    identityType,
    email,
    name,
    changedAt,
    ipAddress,
    userAgent,
    approximateLocation,
    outboxId
  } = payload;
  const recipientModel = identityType === 'patient' ? 'Patient' : 'User';
  const occurredAt = new Date(changedAt);
  const message = `Your password was changed at ${occurredAt.toISOString()}. If this was not you, contact support immediately.`;

  const deliveries = [
    emailNotificationService.sendSecurityAlert({
      to: email,
      name,
      event: 'Password changed',
      occurredAt,
      ipAddress,
      userAgent,
      approximateLocation,
      idempotencyKey: outboxId
    })
  ];
  if (!outboxId || !await Notification.exists({ 'metadata.outboxId': outboxId })) {
    deliveries.push(notificationService.createNotification({
      user: identityId,
      recipientModel,
      type: 'SYSTEM_ANNOUNCEMENT',
      title: 'Password changed',
      message,
      priority: 'URGENT',
      channels: { inApp: true, push: true },
      metadata: {
        securityEvent: 'password_changed',
        outboxId,
        changedAt: occurredAt,
        ipAddress,
        userAgent,
        approximateLocation
      }
    }));
  }

  const results = await Promise.allSettled(deliveries);

  const failures = results.filter(result => result.status === 'rejected');
  operationalMetrics.increment('password_change_security_notifications_total');
  if (failures.length) {
    operationalMetrics.increment('password_change_security_notification_failures_total', failures.length);
    logger.error('Password change security notification delivery failed', {
      identityId,
      identityType,
      failures: failures.map(result => result.reason?.message)
    });
    throw new Error(`Security notification delivery failed for ${failures.length} channel(s)`);
  }
};

module.exports = { deliverPasswordChanged };
