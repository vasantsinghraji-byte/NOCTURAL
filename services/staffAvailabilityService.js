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
const { ValidationError, NotFoundError } = require('../utils/errors');

const STAFF_ROLES = ['nurse', 'physiotherapist', 'medical_staff'];
const HEARTBEAT_STALE_MS = 10 * 60 * 1000;
const BLUR_DEG = 0.005; // ≈ 550 m of latitude

const coord = (value, min, max, name) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new ValidationError(`Valid ${name} is required to go online`);
  return n;
};

const freshSince = () => new Date(Date.now() - HEARTBEAT_STALE_MS);

/** Query for staff who are discoverable right now. */
const discoverableFilter = () => ({
  role: { $in: STAFF_ROLES },
  isActive: { $ne: false },
  isOnline: true,
  'currentLocation.updatedAt': { $gte: freshSince() }
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

module.exports = {
  STAFF_ROLES,
  HEARTBEAT_STALE_MS,
  discoverableFilter,
  setAvailability,
  getAvailability,
  findNearbyOnline
};
