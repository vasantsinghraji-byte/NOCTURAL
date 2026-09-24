/**
 * Scheduled tick: runs every background sweep once.
 *
 * Why: App Runner throttles CPU when a service isn't handling requests, so
 * in-process setInterval workers can stall at quiet hours (nurse offers not
 * expiring, pharmacy orders not moving, refunds not retried). An EventBridge
 * schedule calls POST /api/v1/internal/tick every minute; that request is
 * "traffic", so the instance gets CPU while the sweeps run.
 *
 * A MongoDB lease makes sure only one instance runs the sweeps at a time.
 * The in-process timers stay on as a backup.
 */

const crypto = require('crypto');
const os = require('os');
const JobLease = require('../models/jobLease');
const logger = require('../utils/logger');

const LEASE_NAME = 'background-tick';
const LEASE_MS = 55 * 1000;
const OWNER = `${os.hostname()}:${process.pid}`;

/** Constant-time check of the scheduler's shared secret. */
function secretMatches(given) {
  const expected = process.env.CRON_SECRET || '';
  if (expected.length < 32 || typeof given !== 'string') return false;
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

async function acquireLease(now = new Date()) {
  try {
    const lease = await JobLease.findOneAndUpdate(
      { name: LEASE_NAME, $or: [{ until: null }, { until: { $lte: now } }] },
      { $set: { owner: OWNER, until: new Date(now.getTime() + LEASE_MS) } },
      { new: true, upsert: true }
    );
    return !!lease && lease.owner === OWNER;
  } catch (err) {
    if (err && err.code === 11000) return false; // another instance just created it
    throw err;
  }
}

async function step(name, fn, results) {
  const started = Date.now();
  try {
    results[name] = { ok: true, result: await fn(), ms: Date.now() - started };
  } catch (err) {
    results[name] = { ok: false, error: String(err.message || err).slice(0, 200), ms: Date.now() - started };
    logger.error('Tick step failed', { step: name, error: err.message });
  }
}

/** Run every sweep once (skips if another instance holds the lease). */
async function runTick(now = new Date()) {
  if (!(await acquireLease(now))) return { skipped: true, reason: 'another instance is running the sweeps' };
  const started = Date.now();
  const results = {};
  // Lazy requires: these modules pull in half the app.
  await step('dispatch', () => require('./dispatchService').sweep(), results);
  await step('pharmacyAcceptance', () => require('./pharmacyAssignmentService').sweepAcceptanceTimeouts(), results);
  await step('pharmacyRefunds', () => require('./pharmacyPaymentService').retryPartialRefunds(), results);
  await step('pharmacyUnpaid', () => require('./pharmacyPaymentService').expireUnpaidOrders(), results);
  await step('pharmacyHousekeeping', () => require('./pharmacyAssignmentService').housekeeping(), results);
  await step('careRefundOutbox', () => require('./paymentService').processRefundOutboxBatch(), results);
  const failed = Object.values(results).filter((r) => !r.ok).length;
  await JobLease.updateOne({ name: LEASE_NAME, owner: OWNER }, {
    $set: {
      lastRunAt: new Date(),
      lastDurationMs: Date.now() - started,
      lastResult: results,
      lastError: failed ? `${failed} step(s) failed` : null,
      until: new Date() // release early
    }
  }).catch(() => undefined);
  return { skipped: false, ms: Date.now() - started, failed, results };
}

/** For health checks / alarms: when did the sweeps last run? */
async function lastRun() {
  const lease = await JobLease.findOne({ name: LEASE_NAME }).select('lastRunAt lastDurationMs lastError').lean();
  return lease || null;
}

module.exports = { runTick, secretMatches, lastRun, acquireLease, LEASE_NAME };
