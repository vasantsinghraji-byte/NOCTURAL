const securityAuditService = require('./securityAuditService');
const operationalMetrics = require('../utils/operationalMetrics');
const monitoring = require('../utils/monitoring');

let intervalId = null;
let running = false;

async function runOnce() {
  if (running) return;
  running = true;
  try {
    const result = await securityAuditService.cleanupExpiredLifecycleReports();
    operationalMetrics.increment('security_audit_lifecycle_report_cleanup_runs_total');
    if (result.deletedCount > 0) {
      operationalMetrics.increment('security_audit_lifecycle_report_cleanup_deleted_total', result.deletedCount);
    }
  } catch (error) {
    operationalMetrics.increment('security_audit_lifecycle_report_cleanup_failures_total');
    monitoring.trackError('security_audit_lifecycle_report_cleanup', error);
  } finally {
    running = false;
  }
}

function start() {
  if (intervalId || process.env.AUDIT_LIFECYCLE_REPORT_CLEANUP_ENABLED === 'false') return;
  const intervalMs = Number(process.env.AUDIT_LIFECYCLE_REPORT_CLEANUP_INTERVAL_MS) || 60 * 60 * 1000;
  runOnce();
  intervalId = setInterval(runOnce, intervalMs);
  if (typeof intervalId.unref === 'function') intervalId.unref();
}

function stop() {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
}

module.exports = { runOnce, start, stop };
