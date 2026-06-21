const BookingCompletionOutbox = require('../models/bookingCompletionOutbox');
const NurseBooking = require('../models/nurseBooking');
const RefreshSession = require('../models/refreshSession');
const SecurityNotificationOutbox = require('../models/securityNotificationOutbox');
const reconciliationService = require('./bookingCompletionReconciliationService');
const monitoring = require('../utils/monitoring');
const operationalMetrics = require('../utils/operationalMetrics');
const { findOrphanedUploads } = require('./uploadReconciliationService');

let intervalId = null;
let running = false;

async function runOnce() {
  if (running) return;
  running = true;
  try {
    const now = new Date();
    const [result, deadLetters, securityNotificationDeadLetters, staleSessions, missingAccounting, orphanedUploads] = await Promise.all([
      reconciliationService.processPending({ limit: 100 }),
      BookingCompletionOutbox.countDocuments({ status: 'DEAD_LETTER' }),
      SecurityNotificationOutbox.countDocuments({ status: 'DEAD_LETTER' }),
      RefreshSession.countDocuments({ revokedAt: null, expiresAt: { $lte: now } }),
      NurseBooking.countDocuments({ status: 'COMPLETED', 'completionAccounting.appliedAt': { $exists: false } }),
      findOrphanedUploads()
    ]);
    operationalMetrics.increment('reconciliation_runs_total');
    operationalMetrics.increment('reconciliation_completed_total', result.completed);
    operationalMetrics.setGauge('booking_outbox_dead_letters', deadLetters);
    operationalMetrics.setGauge('security_notification_outbox_dead_letters', securityNotificationDeadLetters);
    operationalMetrics.setGauge('stale_refresh_sessions', staleSessions);
    operationalMetrics.setGauge('completed_bookings_missing_accounting', missingAccounting);
    operationalMetrics.setGauge('orphaned_uploads', orphanedUploads.length);
    if (deadLetters || securityNotificationDeadLetters || staleSessions || missingAccounting || orphanedUploads.length) {
      monitoring.triggerAlert('reconciliation_drift', deadLetters + securityNotificationDeadLetters + staleSessions + missingAccounting + orphanedUploads.length, {
        deadLetters,
        securityNotificationDeadLetters,
        staleSessions,
        missingAccounting,
        orphanedUploads: orphanedUploads.length
      });
    }
  } catch (error) {
    operationalMetrics.increment('reconciliation_failures_total');
    monitoring.trackError('reconciliation', error);
  } finally {
    running = false;
  }
}

function start() {
  if (intervalId || process.env.RECONCILIATION_ENABLED === 'false') return;
  const intervalMs = parseInt(process.env.RECONCILIATION_INTERVAL_MS, 10) || 5 * 60 * 1000;
  runOnce();
  intervalId = setInterval(runOnce, intervalMs);
  if (typeof intervalId.unref === 'function') intervalId.unref();
}

function stop() {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
}

module.exports = { runOnce, start, stop };
