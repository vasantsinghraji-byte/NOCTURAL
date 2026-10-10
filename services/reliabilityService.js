/**
 * Reliability score (0–100) for professionals and shops, from the last 60
 * days. It rewards good staff instead of only punishing bad ones:
 *
 *   40%  on time        scheduled visits started within 15 min of the time
 *   35%  completes      completed ÷ (completed + cancelled by the professional)
 *   25%  rating         average rating (4.5★ assumed until 3 reviews)
 *   − 8 points per reliability strike in the last 30 days
 *
 * Fewer than 3 finished visits: no score yet ("New"). Used to rank search
 * ("Recommended"), to choose between equally near professionals for urgent
 * visits, on the partner's home screen and in the admin panel.
 */
const NurseBooking = require('../models/nurseBooking');
const User = require('../models/user');
const CareStore = require('../models/careStore');
const { visitStart } = require('./careVisitPolicy');
const logger = require('../utils/logger');

const WINDOW_DAYS = 60;
const STRIKE_DAYS = 30;
const LATE_MINUTES = 15;
const MIN_VISITS = 3;
const STAFF_ROLES = ['nurse', 'physiotherapist', 'medical_staff'];

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

/** The score parts for one professional (pure: easy to test). */
function scoreFrom({ completed, onTime, scheduledCompleted, providerCancelled, rating, reviews, strikes }) {
  const finished = completed + providerCancelled;
  if (finished < MIN_VISITS) return { score: null, onTimeRate: null, completionRate: null, visits: finished };
  const onTimeRate = scheduledCompleted ? onTime / scheduledCompleted : 1;
  const completionRate = completed / finished;
  const ratingPart = reviews >= 3 ? (Number(rating) || 0) / 5 : 0.9;
  const score = clamp(100 * (0.4 * onTimeRate + 0.35 * completionRate + 0.25 * ratingPart) - 8 * strikes);
  return { score, onTimeRate: Math.round(onTimeRate * 100) / 100, completionRate: Math.round(completionRate * 100) / 100, visits: finished };
}

async function computeForUser(userId, now = new Date()) {
  const since = new Date(now.getTime() - WINDOW_DAYS * 86400000);
  const strikeSince = new Date(now.getTime() - STRIKE_DAYS * 86400000);
  const [user, visits, stores] = await Promise.all([
    User.findById(userId).select('rating totalReviews').lean(),
    NurseBooking.find({ serviceProvider: userId, scheduledDate: { $gte: since, $lte: now }, status: { $in: ['COMPLETED', 'CANCELLED'] } })
      .select('status scheduledDate scheduledTime scheduledTimezoneOffsetMinutes dispatch.mode statusTimestamps.startedAt cancellation.cancelledBy').lean(),
    CareStore.find({ owner: userId }).select('strikes').lean()
  ]);
  if (!user) return null;
  let completed = 0;
  let onTime = 0;
  let scheduledCompleted = 0;
  let providerCancelled = 0;
  for (const v of visits) {
    if (v.status === 'COMPLETED') {
      completed += 1;
      const started = v.statusTimestamps && v.statusTimestamps.startedAt;
      const due = visitStart(v);
      // "Book now" visits have no fixed time to be late for.
      if ((!v.dispatch || v.dispatch.mode !== 'ASAP') && started && due) {
        scheduledCompleted += 1;
        if (new Date(started).getTime() <= due.getTime() + LATE_MINUTES * 60000) onTime += 1;
      }
    } else if (v.cancellation && ['NURSE', 'PROVIDER'].includes(v.cancellation.cancelledBy)) {
      providerCancelled += 1;
    }
  }
  const strikes = stores.reduce((n, s) => n + (s.strikes || []).filter((x) => new Date(x.at) >= strikeSince).length, 0);
  return scoreFrom({ completed, onTime, scheduledCompleted, providerCancelled, rating: user.rating, reviews: user.totalReviews || 0, strikes });
}

/** Recompute everyone who worked in the window, then each shop from its people. */
async function recomputeAll(now = new Date()) {
  const since = new Date(now.getTime() - WINDOW_DAYS * 86400000);
  const ids = await NurseBooking.distinct('serviceProvider', { serviceProvider: { $ne: null }, scheduledDate: { $gte: since } });
  const staff = await User.find({ _id: { $in: ids }, role: { $in: STAFF_ROLES } }).select('_id').lean();
  const byUser = new Map();
  for (const u of staff) {
    const r = await computeForUser(u._id, now);
    if (!r) continue;
    byUser.set(String(u._id), r.score);
    await User.updateOne({ _id: u._id }, { $set: { 'careProfile.reliability': { ...r, updatedAt: now } } });
  }
  // A solo shop is its owner; a clinic or agency is the average of its active people.
  const stores = await CareStore.find({ status: { $in: ['APPROVED', 'SUSPENDED'] } }).select('owner format members').lean();
  let shops = 0;
  for (const s of stores) {
    const people = s.format === 'SOLO' ? [String(s.owner)]
      : (s.members || []).filter((m) => m.active !== false && m.role !== 'MANAGER').map((m) => String(m.user));
    const scores = people.map((p) => byUser.get(p)).filter((x) => Number.isFinite(x));
    const score = scores.length ? clamp(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    await CareStore.updateOne({ _id: s._id }, { $set: { reliability: { score, updatedAt: now } } });
    shops += 1;
  }
  return { staff: byUser.size, shops };
}

// The cron ticks often; scoring once every 6 hours is plenty.
let lastRun = 0;
async function sweep(now = new Date()) {
  if (now.getTime() - lastRun < 6 * 3600000) return { skipped: true };
  lastRun = now.getTime();
  try {
    return await recomputeAll(now);
  } catch (err) {
    lastRun = 0;
    logger.warn('Reliability sweep failed', { error: err.message });
    throw err;
  }
}

module.exports = { scoreFrom, computeForUser, recomputeAll, sweep, MIN_VISITS };
