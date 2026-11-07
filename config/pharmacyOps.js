/**
 * Pharmacy network operating rules (store acceptance SLA, reassignment,
 * stock freshness, shelf life). Env overrides keep staging and production
 * tunable without a deploy of code.
 *
 * See docs/pharmacy/STORE_NETWORK_PLAN.md for why each rule exists.
 */

const num = (name, fallback, { min = 0 } = {}) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min ? n : fallback;
};

const getPharmacyOps = () => ({
  // A store must accept (or reject) a new order within this window, else the
  // order moves to the next best store (Zomato-style order inaction).
  acceptSlaSeconds: num('PHARMACY_ACCEPT_SLA_SECONDS', 180, { min: 30 }),
  // Stores an order may be offered to before we cancel and refund.
  maxAssignmentAttempts: num('PHARMACY_MAX_ASSIGNMENT_ATTEMPTS', 3, { min: 1 }),
  // Consecutive missed/timed-out orders that auto-pause a store, and for how long.
  autoPauseAfterMisses: num('PHARMACY_AUTO_PAUSE_AFTER_MISSES', 3, { min: 1 }),
  autoPauseMinutes: num('PHARMACY_AUTO_PAUSE_MINUTES', 30, { min: 1 }),
  // Stock expiring sooner than this is not sold online (patients need usable shelf life).
  minShelfLifeDays: num('PHARMACY_MIN_SHELF_LIFE_DAYS', 30),
  // A listing whose stock count has not been touched for this long is shown as
  // "likely available" and ranked lower.
  staleStockHours: num('PHARMACY_STALE_STOCK_HOURS', 48, { min: 1 }),
  // Split a cart across at most this many stores.
  maxSplitStores: num('PHARMACY_MAX_SPLIT_STORES', 2, { min: 1 }),
  // Stores considered when planning a cart.
  planCandidateStores: num('PHARMACY_PLAN_CANDIDATE_STORES', 15, { min: 1 }),
  // Worker cadence for acceptance timeouts and refund retries.
  sweepIntervalMs: num('PHARMACY_ASSIGNMENT_SWEEP_INTERVAL_MS', 20000, { min: 1000 })
});

/** Earliest acceptable expiry date for stock sold now. */
const minExpiryDate = (now = new Date(), ops = getPharmacyOps()) => new Date(now.getTime() + ops.minShelfLifeDays * 24 * 60 * 60 * 1000);

module.exports = { getPharmacyOps, minExpiryDate };
