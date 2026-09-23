/**
 * Partner-app dashboard for medical staff (Uber-driver style): today's and
 * this week's earnings (from the settlement ledger), visits done, rating,
 * where demand is, and any request waiting for them.
 */

const mongoose = require('mongoose');
const SettlementEntry = require('../models/settlementEntry');
const NurseBooking = require('../models/nurseBooking');
const User = require('../models/user');
const dispatchService = require('./dispatchService');
const staffAvailabilityService = require('./staffAvailabilityService');
const { round2 } = require('./pricingService');
const { ValidationError } = require('../utils/errors');

const IST_OFFSET_MS = 330 * 60 * 1000;

/** Start of "today" and of this week (Monday) in IST. */
function periodStarts(now = new Date()) {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const dayStartIst = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  const dow = (ist.getUTCDay() + 6) % 7; // Monday = 0
  return {
    today: new Date(dayStartIst - IST_OFFSET_MS),
    week: new Date(dayStartIst - dow * 24 * 3600 * 1000 - IST_OFFSET_MS)
  };
}

async function earningsSince(staffId, since) {
  const [row] = await SettlementEntry.aggregate([
    { $match: { 'party.kind': 'PROVIDER', 'party.id': new mongoose.Types.ObjectId(String(staffId)), type: 'PROVIDER_PAYOUT', occurredAt: { $gte: since } } },
    { $group: { _id: null, amount: { $sum: '$amount' }, visits: { $sum: 1 } } }
  ]);
  return { earnings: round2(row ? row.amount : 0), visits: row ? row.visits : 0 };
}

/** Where recent bookings cluster near me (≈1 km cells), busiest first. */
async function demandNear(staffId) {
  const me = await User.findById(staffId).select('currentLocation').lean();
  const coords = me && me.currentLocation && me.currentLocation.coordinates;
  if (!coords) return [];
  const [lng, lat] = coords;
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const box = 0.1; // ≈ 11 km
  const rows = await NurseBooking.aggregate([
    {
      $match: {
        createdAt: { $gte: since },
        'serviceLocation.address.coordinates.lat': { $gte: lat - box, $lte: lat + box },
        'serviceLocation.address.coordinates.lng': { $gte: lng - box, $lte: lng + box }
      }
    },
    {
      $group: {
        _id: {
          lat: { $round: ['$serviceLocation.address.coordinates.lat', 2] },
          lng: { $round: ['$serviceLocation.address.coordinates.lng', 2] }
        },
        count: { $sum: 1 },
        pincode: { $first: '$serviceLocation.address.pincode' }
      }
    },
    { $sort: { count: -1 } },
    { $limit: 5 }
  ]);
  return rows.map((r) => ({ lat: r._id.lat, lng: r._id.lng, count: r.count, pincode: r.pincode }));
}

async function getDashboard(staffId) {
  const { today, week } = periodStarts();
  const [t, w, pending, user, availability, offer, demand, upcoming] = await Promise.all([
    earningsSince(staffId, today),
    earningsSince(staffId, week),
    SettlementEntry.aggregate([
      { $match: { 'party.kind': 'PROVIDER', 'party.id': new mongoose.Types.ObjectId(String(staffId)), type: 'PROVIDER_PAYOUT', status: 'PENDING' } },
      { $group: { _id: null, amount: { $sum: '$amount' } } }
    ]),
    User.findById(staffId).select('name rating totalReviews careProfile professional.yearsOfExperience').lean(),
    staffAvailabilityService.getAvailability(staffId),
    dispatchService.getMyOffer(staffId),
    demandNear(staffId),
    NurseBooking.countDocuments({ serviceProvider: staffId, status: { $in: ['ASSIGNED', 'CONFIRMED', 'EN_ROUTE', 'IN_PROGRESS'] } })
  ]);
  const v = (user && user.careProfile && user.careProfile.verification) || {};
  return {
    name: user && user.name,
    today: t,
    week: w,
    pendingPayout: round2(pending[0] ? pending[0].amount : 0),
    rating: user && user.rating ? user.rating : null,
    totalReviews: (user && user.totalReviews) || 0,
    availability,
    offer,
    upcomingVisits: upcoming,
    demand,
    profile: {
      qualification: user && user.careProfile && user.careProfile.qualification,
      languages: (user && user.careProfile && user.careProfile.languages) || [],
      gender: user && user.careProfile && user.careProfile.gender,
      experienceYears: user && user.professional && user.professional.yearsOfExperience,
      verified: { id: !!v.idVerified, police: !!v.policeVerified, council: !!v.councilVerified, vaccinated: !!v.vaccinated }
    }
  };
}

/** Staff can edit how they present themselves; verification stays admin-only. */
async function updateProfile(staffId, { qualification, languages, gender, bio, experienceYears }) {
  const set = {};
  if (qualification !== undefined) set['careProfile.qualification'] = String(qualification).trim().slice(0, 80);
  if (bio !== undefined) set['careProfile.bio'] = String(bio).trim().slice(0, 400);
  if (gender !== undefined) {
    if (!['FEMALE', 'MALE', 'OTHER'].includes(gender)) throw new ValidationError('Invalid gender');
    set['careProfile.gender'] = gender;
  }
  if (languages !== undefined) {
    if (!Array.isArray(languages) || languages.length > 6) throw new ValidationError('Up to 6 languages');
    set['careProfile.languages'] = languages.map((l) => String(l).trim().slice(0, 30)).filter(Boolean);
  }
  if (experienceYears !== undefined) {
    const n = Number(experienceYears);
    if (!Number.isFinite(n) || n < 0 || n > 60) throw new ValidationError('Invalid years of experience');
    set['professional.yearsOfExperience'] = n;
  }
  await User.updateOne({ _id: staffId, role: { $in: staffAvailabilityService.STAFF_ROLES } }, { $set: set });
  return getDashboard(staffId).then((d) => d.profile);
}

/** Platform admin marks what was actually checked. */
async function setVerification(staffId, adminId, flags) {
  const set = { 'careProfile.verification.verifiedAt': new Date(), 'careProfile.verification.verifiedBy': adminId };
  for (const [key, field] of [['id', 'idVerified'], ['police', 'policeVerified'], ['council', 'councilVerified'], ['vaccinated', 'vaccinated']]) {
    if (flags[key] !== undefined) set[`careProfile.verification.${field}`] = !!flags[key];
  }
  const res = await User.updateOne({ _id: staffId, role: { $in: staffAvailabilityService.STAFF_ROLES } }, { $set: set });
  if (!res.matchedCount) throw new ValidationError('Staff member not found');
  return { updated: true };
}

module.exports = { getDashboard, updateProfile, setVerification, periodStarts };
