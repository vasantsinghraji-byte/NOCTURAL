/**
 * Nabz commission on home-care visits (docs/NABZ_REVENUE_MODEL.md):
 *
 * - Monthly volume tiers, reset every calendar month (IST): by default jobs
 *   1–10 of the month at 20%, 11–30 at 15%, 31+ at 12%. Active partners pay
 *   less, which also makes staying on Nabz worth more than dealing off-app.
 * - A referral credit makes one job 5% only when that's lower than the tier
 *   rate (min of the two); the credit isn't spent otherwise.
 * - The rate is decided once, at completion, and stamped on the booking
 *   (commissionOverride), so payouts, the ledger and replays always agree.
 *
 * Pharmacy orders keep a flat rate (config pharmacy.commissionRate), with the
 * same referral rule applied in pharmacyService.
 */

const NurseBooking = require('../models/nurseBooking');
const User = require('../models/user');
const { getRevenuePolicy } = require('../config/revenue');
const referral = require('./partnerReferralService');
const logger = require('../utils/logger');

const IST_OFFSET_MS = 330 * 60000;

function monthStart(now = new Date()) {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - IST_OFFSET_MS);
}

/** Tier rate for the n-th completed job of the month (1-based). */
function tierRate(jobNumber, tiers = getRevenuePolicy().care.commissionTiers) {
  const tier = tiers.find((t) => jobNumber <= t.upTo) || tiers[tiers.length - 1];
  return tier.rate;
}

/** Visits this professional completed this month (optionally not counting one). */
async function jobsThisMonth(providerId, exceptBookingId, now = new Date()) {
  return NurseBooking.countDocuments({
    serviceProvider: providerId,
    status: 'COMPLETED',
    'statusTimestamps.completedAt': { $gte: monthStart(now) },
    ...(exceptBookingId ? { _id: { $ne: exceptBookingId } } : {})
  });
}

/** Rate the professional's next job would carry (shown on offers). */
async function previewCareRate(providerId) {
  const tier = tierRate((await jobsThisMonth(providerId)) + 1);
  const user = await User.findById(providerId).select('referral.credits').lean();
  const credits = user && user.referral && user.referral.credits;
  return credits > 0 ? Math.min(tier, referral.policy().rate) : tier;
}

/**
 * Decide and stamp the commission for a completed visit. Returns the rate.
 * Idempotent: a booking that already has a rate keeps it.
 */
async function decideCareCommission(providerId, bookingId, now = new Date()) {
  const existing = await NurseBooking.findById(bookingId).select('commissionOverride').lean();
  if (existing && existing.commissionOverride && Number.isFinite(existing.commissionOverride.rate)) return existing.commissionOverride.rate;

  const jobNumber = (await jobsThisMonth(providerId, bookingId, now)) + 1;
  const tier = tierRate(jobNumber);
  if (tier > referral.policy().rate) {
    const reduced = await referral.claimReducedCommission(providerId, NurseBooking, bookingId);
    if (reduced !== null) return reduced;
  }
  await NurseBooking.updateOne(
    { _id: bookingId, 'commissionOverride.rate': { $exists: false } },
    { $set: { commissionOverride: { rate: tier, reason: 'TIER', jobOfMonth: jobNumber, at: now } } }
  );
  const after = await NurseBooking.findById(bookingId).select('commissionOverride').lean();
  const rate = after && after.commissionOverride ? after.commissionOverride.rate : tier;
  logger.info('Care commission decided', { bookingId: String(bookingId), jobOfMonth: jobNumber, rate });
  return rate;
}

/** For the partner Account screen: where they are in this month's tiers. */
async function tierStatus(providerId) {
  const tiers = getRevenuePolicy().care.commissionTiers;
  const done = await jobsThisMonth(providerId);
  const current = tierRate(done + 1, tiers);
  const nextTier = tiers.find((t) => t.upTo < Infinity && done < t.upTo && tierRate(t.upTo + 1, tiers) < current);
  return {
    jobsThisMonth: done,
    currentRatePercent: Math.round(current * 100),
    nextRatePercent: nextTier ? Math.round(tierRate(nextTier.upTo + 1, tiers) * 100) : null,
    jobsToNextTier: nextTier ? nextTier.upTo - done : null,
    tiers: tiers.map((t, i) => ({ from: i === 0 ? 1 : tiers[i - 1].upTo + 1, to: t.upTo === Infinity ? null : t.upTo, ratePercent: Math.round(t.rate * 100) }))
  };
}

module.exports = { monthStart, tierRate, jobsThisMonth, previewCareRate, decideCareCommission, tierStatus };
