const mongoose = require('mongoose');
const SecurityNotificationOutbox = require('../models/securityNotificationOutbox');
const securityNotificationService = require('./securityNotificationService');
const operationalMetrics = require('../utils/operationalMetrics');
const monitoring = require('../utils/monitoring');
const logger = require('../utils/logger');
const { decodePayload } = require('./securityNotificationPayloadCrypto');

let intervalId = null;
const delayMs = attempt => Math.min(60 * 60 * 1000, 1000 * (2 ** Math.min(attempt, 10)));
const retentionDate = () => new Date(Date.now() + (Number(process.env.SECURITY_NOTIFICATION_OUTBOX_RETENTION_DAYS) || 90) * 24 * 60 * 60 * 1000);

const processOne = async (outboxId) => {
  const now = new Date();
  const staleLock = new Date(now.getTime() - 5 * 60 * 1000);
  const claimed = await SecurityNotificationOutbox.findOneAndUpdate(
    {
      _id: outboxId,
      $or: [
        { status: { $in: ['PENDING', 'RETRY_PENDING'] }, nextAttemptAt: { $lte: now } },
        { status: 'PROCESSING', lockedAt: { $lte: staleLock } }
      ]
    },
    { $set: { status: 'PROCESSING', lockedAt: now } },
    { new: true }
  );
  if (!claimed) return false;

  try {
    if (claimed.event !== 'PASSWORD_CHANGED') throw new Error(`Unsupported security notification: ${claimed.event}`);
    await securityNotificationService.deliverPasswordChanged({
      ...decodePayload(claimed),
      outboxId: String(claimed._id)
    });
    await SecurityNotificationOutbox.updateOne(
      { _id: claimed._id },
      {
        $set: { status: 'COMPLETED', completedAt: new Date(), lastError: null, purgeAfter: retentionDate() },
        $unset: { lockedAt: 1 }
      }
    );
    operationalMetrics.increment('security_notification_outbox_completed_total');
    return true;
  } catch (error) {
    const attemptCount = (claimed.attemptCount || 0) + 1;
    const deadLetter = attemptCount >= (claimed.maxAttempts || 10);
    await SecurityNotificationOutbox.updateOne(
      { _id: claimed._id },
      {
        $set: {
          status: deadLetter ? 'DEAD_LETTER' : 'RETRY_PENDING',
          attemptCount,
          nextAttemptAt: new Date(Date.now() + delayMs(attemptCount)),
          lastError: error.message,
          ...(deadLetter ? { purgeAfter: retentionDate() } : {})
        },
        $unset: { lockedAt: 1 }
      }
    );
    operationalMetrics.increment('security_notification_outbox_failures_total');
    if (deadLetter) {
      operationalMetrics.increment('security_notification_outbox_dead_letters_total');
      monitoring.triggerAlert('security_notification_outbox_dead_letter', 1, { outboxId: claimed._id });
    }
    logger.error('Security notification outbox delivery failed', {
      outboxId: claimed._id,
      attemptCount,
      deadLetter,
      error: error.message
    });
    return false;
  }
};

const processPending = async ({ limit = 50 } = {}) => {
  if (mongoose.connection.readyState !== 1) {
    return { attempted: 0, completed: 0 };
  }

  const pending = await SecurityNotificationOutbox.find({
    status: { $in: ['PENDING', 'RETRY_PENDING', 'PROCESSING'] },
    nextAttemptAt: { $lte: new Date() }
  }).sort({ nextAttemptAt: 1 }).limit(limit).select('_id').lean();
  const results = await Promise.all(pending.map(item => processOne(item._id)));
  return { attempted: results.length, completed: results.filter(Boolean).length };
};

const start = () => {
  if (
    intervalId ||
    process.env.SECURITY_NOTIFICATION_OUTBOX_ENABLED === 'false' ||
    mongoose.connection.readyState !== 1
  ) return;
  const intervalMs = Number(process.env.SECURITY_NOTIFICATION_OUTBOX_INTERVAL_MS) || 30000;
  processPending();
  intervalId = setInterval(() => processPending(), intervalMs);
  if (typeof intervalId.unref === 'function') intervalId.unref();
};

const stop = () => {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
};

module.exports = { processOne, processPending, start, stop };
