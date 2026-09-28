/**
 * Partner "Account" screen: profile, verification, rating, earnings (today,
 * this week, all time, pending payout, cash held) and the referral programme.
 * Earnings come from the settlement ledger, so they match payouts exactly.
 */

const mongoose = require('mongoose');
const User = require('../models/user');
const PharmacyVendor = require('../models/pharmacyVendor');
const SettlementEntry = require('../models/settlementEntry');
const referral = require('./partnerReferralService');
const commissionService = require('./commissionService');
const { getRevenuePolicy } = require('../config/revenue');
const { NotFoundError } = require('../utils/errors');

const IST_OFFSET_MS = 330 * 60000;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function periodStarts(now = new Date()) {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const dayStartIst = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  const dow = (ist.getUTCDay() + 6) % 7; // Monday = 0
  return { today: new Date(dayStartIst - IST_OFFSET_MS), week: new Date(dayStartIst - dow * 86400000 - IST_OFFSET_MS) };
}

async function ledger(partyKind, partyId, payoutType) {
  const id = new mongoose.Types.ObjectId(String(partyId));
  const { today, week } = periodStarts();
  const [row] = await SettlementEntry.aggregate([
    { $match: { 'party.kind': partyKind, 'party.id': id, type: { $in: [payoutType, 'CASH_COLLECTED'] } } },
    {
      $group: {
        _id: null,
        allTime: { $sum: { $cond: [{ $eq: ['$type', payoutType] }, '$amount', 0] } },
        jobs: { $sum: { $cond: [{ $eq: ['$type', payoutType] }, 1, 0] } },
        today: { $sum: { $cond: [{ $and: [{ $eq: ['$type', payoutType] }, { $gte: ['$occurredAt', today] }] }, '$amount', 0] } },
        todayJobs: { $sum: { $cond: [{ $and: [{ $eq: ['$type', payoutType] }, { $gte: ['$occurredAt', today] }] }, 1, 0] } },
        week: { $sum: { $cond: [{ $and: [{ $eq: ['$type', payoutType] }, { $gte: ['$occurredAt', week] }] }, '$amount', 0] } },
        pending: { $sum: { $cond: [{ $and: [{ $eq: ['$type', payoutType] }, { $eq: ['$status', 'PENDING'] }] }, '$amount', 0] } },
        cashHeld: { $sum: { $cond: [{ $and: [{ $eq: ['$type', 'CASH_COLLECTED'] }, { $eq: ['$status', 'PENDING'] }] }, '$amount', 0] } }
      }
    }
  ]);
  const r = row || {};
  return {
    today: round2(r.today), todayJobs: r.todayJobs || 0, week: round2(r.week), allTime: round2(r.allTime), jobs: r.jobs || 0,
    pendingPayout: round2(r.pending), cashHeld: round2(r.cashHeld),
    // What the weekly payout will send: earnings minus cash already in the partner's hands.
    netPayout: round2((r.pending || 0) - (r.cashHeld || 0))
  };
}

async function getAccount(userId) {
  const user = await User.findById(userId)
    .select('name email phone role rating totalReviews careProfile pharmacyVendor referral createdAt isVerified profilePhoto').lean();
  if (!user) throw new NotFoundError('Account');

  const code = await referral.ensureCode(user._id);
  const { rate, minOrder } = referral.policy();
  const base = {
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    photoUrl: user.profilePhoto?.url || null,
    memberSince: user.createdAt,
    referral: {
      code,
      credits: (user.referral && user.referral.credits) || 0,
      successful: (user.referral && user.referral.successful) || 0,
      reducedCommissionPercent: Math.round(rate * 100),
      rewardJobs: referral.REWARD_CREDITS,
      minFirstOrder: minOrder
    }
  };

  if (user.role === 'pharmacy_vendor') {
    const store = user.pharmacyVendor
      ? await PharmacyVendor.findById(user.pharmacyVendor).select('name status isOpen rating address.line1 drugLicenseNumber').lean()
      : null;
    return {
      ...base,
      kind: 'PHARMACY',
      store: store && { name: store.name, status: store.status, isOpen: store.isOpen, address: store.address && store.address.line1, licence: store.drugLicenseNumber },
      rating: store && store.rating ? { average: store.rating.average || null, count: store.rating.count || 0 } : { average: null, count: 0 },
      commission: { currentRatePercent: Math.round(getRevenuePolicy().pharmacy.commissionRate * 100), flat: true },
      earnings: store ? await ledger('VENDOR', store._id, 'VENDOR_PAYOUT') : null
    };
  }

  const v = (user.careProfile && user.careProfile.verification) || {};
  return {
    ...base,
    kind: 'STAFF',
    profile: {
      qualification: user.careProfile && user.careProfile.qualification,
      registrationNumber: user.careProfile && user.careProfile.registrationNumber,
      gender: user.careProfile && user.careProfile.gender,
      languages: (user.careProfile && user.careProfile.languages) || []
    },
    verification: { id: !!v.idVerified, police: !!v.policeVerified, council: !!v.councilVerified, vaccinated: !!v.vaccinated },
    rating: { average: user.rating || null, count: user.totalReviews || 0 },
    commission: await commissionService.tierStatus(user._id),
    earnings: await ledger('PROVIDER', user._id, 'PROVIDER_PAYOUT')
  };
}

module.exports = { getAccount };
