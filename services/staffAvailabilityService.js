/**
 * Staff "Go online" (Uber-driver style) for nurses / physios / medical staff.
 *
 * A staff member is DISCOVERABLE only while:
 *   isOnline = true (they switched it on in the staff app), and
 *   currentLocation.updatedAt is fresh (the app heartbeats every ~30 s).
 * Going offline clears the stored location. Customers only ever see blurred
 * positions (≈500 m grid) and no identities.
 */

const User = require('../models/user');
const { ValidationError, NotFoundError, AuthorizationError } = require('../utils/errors');
const { VERIFIED_FILTER, isVerifiedStaff } = require('./careVisitPolicy');

const STAFF_ROLES = ['nurse', 'physiotherapist', 'medical_staff'];
const HEARTBEAT_STALE_MS = 10 * 60 * 1000;
const BLUR_DEG = 0.005; // ≈ 550 m of latitude

const coord = (value, min, max, name) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new ValidationError(`Valid ${name} is required to go online`);
  return n;
};

const freshSince = () => new Date(Date.now() - HEARTBEAT_STALE_MS);

/** Query for staff who are discoverable right now (verified ones only). */
const discoverableFilter = () => ({
  role: { $in: STAFF_ROLES },
  isActive: { $ne: false },
  isOnline: true,
  'currentLocation.updatedAt': { $gte: freshSince() },
  ...VERIFIED_FILTER
});

function present(user) {
  const loc = user.currentLocation;
  const fresh = !!(loc && loc.updatedAt && loc.updatedAt >= freshSince());
  return {
    online: !!user.isOnline && fresh,
    wentStale: !!user.isOnline && !fresh,
    lastSeenAt: loc ? loc.updatedAt || null : null
  };
}

/** Go online / heartbeat (with location) or go offline. */
async function setAvailability(userId, { online, lat, lng }) {
  // We promise customers every professional is ID, council and police checked.
  if (online) {
    const me = await User.findById(userId).select('role careProfile.verification isActive').lean();
    if (!me || !STAFF_ROLES.includes(me.role)) throw new NotFoundError('Staff profile');
    if (me.isActive === false) throw new AuthorizationError('Your account is paused. Contact partner support.');
    if (!isVerifiedStaff(me)) throw new AuthorizationError('Verification pending: you can go online once your ID, police check and council registration are verified.');
  }
  const update = online
    ? {
      $set: {
        isOnline: true,
        isAvailable: true,
        currentLocation: {
          type: 'Point',
          coordinates: [coord(lng, -180, 180, 'longitude'), coord(lat, -90, 90, 'latitude')],
          updatedAt: new Date()
        }
      }
    }
    : { $set: { isOnline: false, isAvailable: false }, $unset: { currentLocation: 1 } };

  const user = await User.findOneAndUpdate(
    { _id: userId, role: { $in: STAFF_ROLES } },
    update,
    { new: true }
  ).select('isOnline currentLocation');
  if (!user) throw new NotFoundError('Staff profile');
  return present(user);
}

async function getAvailability(userId) {
  const user = await User.findById(userId).select('isOnline currentLocation');
  if (!user) throw new NotFoundError('Staff profile');
  return present(user);
}

/** Customer map: how many staff are online near a point (blurred, anonymous). */
async function findNearbyOnline({ lat, lng, radiusKm = 10, limit = 30 }) {
  const point = { type: 'Point', coordinates: [coord(lng, -180, 180, 'longitude'), coord(lat, -90, 90, 'latitude')] };
  const rows = await User.aggregate([
    {
      $geoNear: {
        near: point,
        key: 'currentLocation',
        distanceField: 'distanceMeters',
        maxDistance: Math.min(Math.max(Number(radiusKm) || 10, 1), 25) * 1000,
        spherical: true,
        query: discoverableFilter()
      }
    },
    { $limit: Math.min(Math.max(Number(limit) || 30, 1), 50) },
    { $project: { role: 1, distanceMeters: 1, currentLocation: 1 } }
  ]);
  const blur = (v) => Math.round(v / BLUR_DEG) * BLUR_DEG;
  return {
    count: rows.length,
    nearestKm: rows.length ? Math.round((rows[0].distanceMeters / 1000) * 10) / 10 : null,
    staff: rows.map((r) => ({
      role: r.role,
      lat: Math.round(blur(r.currentLocation.coordinates[1]) * 1e4) / 1e4,
      lng: Math.round(blur(r.currentLocation.coordinates[0]) * 1e4) / 1e4
    }))
  };
}

const PHYSIO_TYPES = /PHYSIO|THERAPY|REHAB/;

/** Verified professionals a customer can choose (public profile fields only). */
async function listBookableProviders(serviceType) {
  const roles = PHYSIO_TYPES.test(String(serviceType || '')) ? ['physiotherapist'] : serviceType ? ['nurse', 'medical_staff'] : ['nurse', 'physiotherapist', 'medical_staff'];
  const rows = await User.find({ role: { $in: roles }, isActive: { $ne: false }, ...VERIFIED_FILTER })
    .select('name role rating totalReviews isOnline careProfile.gender careProfile.qualification careProfile.languages careProfile.verification professional.yearsOfExperience')
    .sort({ rating: -1, totalReviews: -1 })
    .limit(30)
    .lean();
  return rows.map((u) => {
    const [first, ...rest] = String(u.name || '').trim().split(/\s+/);
    return {
      _id: u._id,
      name: rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first,
      role: u.role,
      gender: u.careProfile && u.careProfile.gender,
      qualification: u.careProfile && u.careProfile.qualification,
      languages: (u.careProfile && u.careProfile.languages) || [],
      experienceYears: u.professional && u.professional.yearsOfExperience,
      rating: u.rating || null,
      reviews: u.totalReviews || 0,
      vaccinated: !!(u.careProfile && u.careProfile.verification && u.careProfile.verification.vaccinated)
    };
  });
}

module.exports = {
  listBookableProviders,
  STAFF_ROLES,
  HEARTBEAT_STALE_MS,
  discoverableFilter,
  setAvailability,
  getAvailability,
  findNearbyOnline
};
