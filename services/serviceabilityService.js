/**
 * Serviceability Service — "which stores can deliver to this point, now?"
 *
 * Modelled on Swiggy's serviceability platform:
 *   1. Resolve the customer point to an ops-drawn ServiceZone (point-in-polygon).
 *   2. A store is serviceable when the straight-line distance is within its
 *      *effective* radius = min(store radius, zone last-mile cap) × zone stress
 *      multiplier (rain / rider shortage shrink it).
 *   3. No zone drawn for that point → radial fallback on the store's own radius.
 *   4. Zone paused (isActive=false) → nothing is serviceable there.
 *
 * Distances come from MongoDB $geoNear (2dsphere), so filtering happens in the
 * database, not in Node.
 */

const mongoose = require('mongoose');
const PharmacyVendor = require('../models/pharmacyVendor');
const ServiceZone = require('../models/serviceZone');
const { ValidationError } = require('../utils/errors');

const DEFAULT_SEARCH_RADIUS_KM = 7;
const MAX_SEARCH_RADIUS_KM = 50;

/**
 * STAGING/TEST ONLY: SERVICEABILITY_TEST_RADIUS_KM makes every approved store
 * deliver within that distance (e.g. 3500 = all of India) so testers anywhere
 * can exercise supplies and pharmacy orders against a few test stores.
 * ⚠️ Never set this in production: it ignores real store radii and zone caps.
 */
const testRadiusKm = () => {
  const n = Number(process.env.SERVICEABILITY_TEST_RADIUS_KM);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// ETA heuristics until a learned model exists (see docs/MEDRUSH_DATA_MODEL.md).
const RIDER_SPEED_KMPH = 18; // Indian city two-wheeler average incl. stops
const ASSIGNMENT_MINUTES = 3;
const LAST_MILE_BUFFER_MINUTES = 4; // parking, stairs, handover

const toNumber = (value, fallback = undefined) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/** Validated GeoJSON Point from lat/lng (throws ValidationError). */
function toPoint(lat, lng) {
  const latNum = toNumber(lat);
  const lngNum = toNumber(lng);
  if (latNum === undefined || lngNum === undefined
    || latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
    throw new ValidationError('Valid lat/lng coordinates are required');
  }
  return { type: 'Point', coordinates: [lngNum, latNum] };
}

/** The zone containing a point (or null when no zone is drawn there). */
async function resolveZone(point) {
  return ServiceZone.findOne({
    boundary: { $geoIntersects: { $geometry: point } }
  });
}

/**
 * Effective delivery radius (km) for a store, given the customer's zone.
 * Pure function — unit-tested.
 */
function effectiveRadiusKm(vendor, zone, now = new Date()) {
  if (testRadiusKm()) return testRadiusKm();
  const storeRadius = toNumber(vendor && vendor.serviceRadiusKm, 5);
  if (!zone) return storeRadius;
  if (zone.isActive === false) return 0;
  const cap = Math.min(storeRadius, toNumber(zone.maxLastMileKm, storeRadius));
  const multiplier = typeof zone.currentRadiusMultiplier === 'function'
    ? zone.currentRadiusMultiplier(now)
    : 1;
  return Math.round(cap * multiplier * 100) / 100;
}

/** Promise-time estimate split into legs (Swiggy: O2A + FM vs prep, then LM). */
function estimateEta(vendor, distanceKm, now = new Date()) {
  const prepMinutes = toNumber(vendor && vendor.avgPreparationMinutes, 15);
  const lastMileMinutes = distanceKm === undefined
    ? 20
    : Math.ceil((distanceKm / RIDER_SPEED_KMPH) * 60) + LAST_MILE_BUFFER_MINUTES;
  // The rider is assigned while the order is being prepared, so the first leg
  // is whichever of (assignment) and (prep) is longer.
  const totalMinutes = Math.max(ASSIGNMENT_MINUTES, prepMinutes) + lastMileMinutes;
  return {
    promisedAt: new Date(now.getTime() + totalMinutes * 60 * 1000),
    prepMinutes,
    assignmentMinutes: ASSIGNMENT_MINUTES,
    lastMileMinutes
  };
}

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const toMinutes = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h <= 24 && min < 60 ? h * 60 + min : undefined;
};

/** Day + minutes-since-midnight in India time (servers run in UTC). */
function indiaClock(now = new Date()) {
  const ist = new Date(now.getTime() + 330 * 60 * 1000); // IST = UTC+5:30, no DST
  return { day: DAYS[ist.getUTCDay()], prevDay: DAYS[(ist.getUTCDay() + 6) % 7], minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes() };
}

/**
 * Is the store inside its posted hours right now (India time)? Handles
 * overnight hours (20:00–02:00). No hours posted = open whenever the owner's
 * switch is on. Pure function — unit-tested.
 */
function isWithinOperatingHours(vendor, now = new Date()) {
  const hours = Array.isArray(vendor && vendor.operatingHours) ? vendor.operatingHours : [];
  if (hours.length === 0) return true;
  const { day, prevDay, minutes } = indiaClock(now);
  const rowFor = (d) => hours.find((h) => h && h.day === d);
  const today = rowFor(day);
  if (today && !today.isClosed) {
    const open = toMinutes(today.open);
    const close = toMinutes(today.close);
    if (open !== undefined && close !== undefined) {
      if (close > open && minutes >= open && minutes < close) return true;
      if (close <= open && minutes >= open) return true; // overnight, before midnight
    }
  }
  const yesterday = rowFor(prevDay);
  if (yesterday && !yesterday.isClosed) {
    const open = toMinutes(yesterday.open);
    const close = toMinutes(yesterday.close);
    if (open !== undefined && close !== undefined && close <= open && minutes < close) return true; // overnight tail
  }
  return false;
}

/**
 * Why this store can't take orders right now (null = it can). One gate for
 * search, cart planning, checkout and reassignment so they never disagree.
 */
function storeBlockReason(vendor, now = new Date()) {
  if (!vendor) return 'NOT_FOUND';
  if (vendor.status && vendor.status !== 'APPROVED') return 'NOT_APPROVED';
  if (vendor.isActive === false) return 'INACTIVE';
  if (vendor.isOpen === false) return 'CLOSED';
  if (vendor.pausedUntil && new Date(vendor.pausedUntil) > now) return 'PAUSED';
  if (vendor.drugLicenseExpiry && new Date(vendor.drugLicenseExpiry) <= now) return 'LICENCE_EXPIRED';
  if (!isWithinOperatingHours(vendor, now)) return 'OUTSIDE_HOURS';
  return null;
}

/** Mongo filter for stores that may trade now (hours are checked in Node). */
const tradingStoreQuery = (now = new Date()) => ({
  status: 'APPROVED',
  isActive: true,
  isOpen: true,
  $and: [
    { $or: [{ pausedUntil: null }, { pausedUntil: { $lte: now } }] },
    { $or: [{ drugLicenseExpiry: null }, { drugLicenseExpiry: { $gt: now } }] }
  ]
});

/**
 * Orderable stores that can deliver to (lat, lng) right now, nearest first,
 * each with `distanceKm`, `effectiveRadiusKm` and `eta`.
 */
async function findServiceableVendors({ lat, lng, radiusKm, limit = 30 }) {
  const point = toPoint(lat, lng);
  const zone = await resolveZone(point);
  const now = new Date();

  const serviceability = {
    zone: zone ? { id: zone._id, code: zone.code, name: zone.name } : null,
    stressLevel: zone ? (zone.currentRadiusMultiplier(now) < 1 ? zone.stress.level : 'NORMAL') : 'NORMAL',
    serviceable: true
  };

  if (zone && zone.isActive === false) {
    return { vendors: [], serviceability: { ...serviceability, serviceable: false, reason: 'ZONE_PAUSED' } };
  }

  // Search wide enough to reach any store whose radius could cover the point,
  // then keep only those whose *effective* radius actually does.
  const searchKm = testRadiusKm() || Math.min(
    Math.max(toNumber(radiusKm, DEFAULT_SEARCH_RADIUS_KM), 0.5),
    MAX_SEARCH_RADIUS_KM
  );
  const cappedLimit = Math.min(Math.max(toNumber(limit, 30), 1), 50);

  const candidates = await PharmacyVendor.aggregate([
    {
      $geoNear: {
        near: point,
        distanceField: 'distanceMeters',
        maxDistance: searchKm * 1000,
        spherical: true,
        query: tradingStoreQuery(now)
      }
    },
    { $limit: cappedLimit * 3 },
    {
      $project: {
        name: 1, slug: 1, address: 1, location: 1, serviceRadiusKm: 1, rating: 1,
        deliveryFee: 1, minOrderValue: 1, avgPreparationMinutes: 1, operatingHours: 1,
        distanceMeters: 1, hasColdStorage: 1, acceptsPrescriptionOrders: 1, reliability: 1
      }
    }
  ]);

  const vendors = [];
  for (const vendor of candidates) {
    if (!isWithinOperatingHours(vendor, now)) continue;
    const radius = effectiveRadiusKm(vendor, zone, now);
    const distanceKm = Math.round((vendor.distanceMeters / 1000) * 100) / 100;
    if (distanceKm > radius) continue;
    const eta = estimateEta(vendor, distanceKm, now);
    delete vendor.distanceMeters; // internal; clients get distanceKm
    vendors.push({ ...vendor, distanceKm, effectiveRadiusKm: radius, eta });
    if (vendors.length >= cappedLimit) break;
  }

  if (vendors.length === 0) {
    serviceability.serviceable = false;
    serviceability.reason = 'NO_STORE_IN_RANGE';
  }
  return { vendors, serviceability };
}

/**
 * Checkout guard: can this store deliver to this point? Returns the zone,
 * distance and ETA to snapshot on the order.
 */
async function assessDelivery(vendor, deliveryPoint) {
  const zone = await resolveZone(deliveryPoint);
  const [result] = await PharmacyVendor.aggregate([
    {
      $geoNear: {
        near: deliveryPoint,
        distanceField: 'distanceMeters',
        spherical: true,
        query: { _id: new mongoose.Types.ObjectId(String(vendor._id)) }
      }
    },
    { $project: { distanceMeters: 1 } }
  ]);
  const distanceKm = result ? Math.round((result.distanceMeters / 1000) * 100) / 100 : undefined;
  const radius = effectiveRadiusKm(vendor, zone);
  return {
    zone,
    distanceKm,
    effectiveRadiusKm: radius,
    serviceable: distanceKm !== undefined && distanceKm <= radius,
    eta: estimateEta(vendor, distanceKm)
  };
}

module.exports = {
  toPoint,
  resolveZone,
  isWithinOperatingHours,
  storeBlockReason,
  tradingStoreQuery,
  effectiveRadiusKm,
  estimateEta,
  findServiceableVendors,
  assessDelivery,
  RIDER_SPEED_KMPH
};
