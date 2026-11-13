/**
 * Demand and supply heat map, automatic surge and learned ETAs.
 * The maths is in dispatchEngine.js; this module reads the database.
 *
 *   heatmap      orders waiting for a rider and visits looking for a nurse,
 *                against riders and nurses online and free, per ~1 km cell.
 *                Ops see the whole city; partners see the busy areas near them
 *                (like the "go here, orders are coming" prompts in rider apps).
 *   auto surge   each tick, every active zone compares orders waiting with
 *                riders free inside it and raises or lowers its stress level
 *                (which shrinks how far stores deliver). A level ops set by
 *                hand is never overridden while it lasts.
 *   learned ETA  hourly, each store's median packing time and each zone's
 *                median riding speed from the last 14 days of deliveries.
 *                serviceabilityService uses them once there are enough samples.
 */

const PharmacyOrder = require('../models/pharmacyOrder');
const PharmacyVendor = require('../models/pharmacyVendor');
const ServiceZone = require('../models/serviceZone');
const NurseBooking = require('../models/nurseBooking');
const User = require('../models/user');
const engine = require('./dispatchEngine');
const logger = require('../utils/logger');

const FRESH_MS = 3 * 60 * 1000; // a location older than this means "not really online"
const WINDOW_MIN = 30; // demand counted over the last 30 minutes
const RIDER_ACTIVE = ['ASSIGNED', 'ACCEPTED', 'ARRIVED_AT_STORE', 'PICKED_UP', 'ARRIVED_AT_CUSTOMER'];
const ORDER_WAITING = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP'];
const CARE_WAITING = ['REQUESTED', 'SEARCHING'];
const AUTO_SURGE_MINUTES = 15;
const AUTO_SURGE_HOLD_MINUTES = 10; // don't drop an automatic surge sooner than this (no flapping)
const LEARN_EVERY_MS = 60 * 60 * 1000;
const MIN_PREP_SAMPLES = 5;
const MIN_SPEED_SAMPLES = 10;

const fromGeo = (geo) => (geo && Array.isArray(geo.coordinates) && geo.coordinates.length === 2
  ? { lat: geo.coordinates[1], lng: geo.coordinates[0] } : null);

/** Riders online with a fresh location, and whether each is free. */
async function onlineRiders(now) {
  const [riders, busy] = await Promise.all([
    User.find({ role: 'delivery_partner', isActive: { $ne: false }, isOnline: true, 'currentLocation.updatedAt': { $gte: new Date(now - FRESH_MS) } })
      .select('_id currentLocation').lean(),
    PharmacyOrder.distinct('rider', { rider: { $ne: null }, deliveryStatus: { $in: RIDER_ACTIVE }, status: { $in: [...ORDER_WAITING, 'OUT_FOR_DELIVERY'] } })
  ]);
  const busySet = new Set(busy.map(String));
  return riders.map((r) => ({ id: String(r._id), ...fromGeo(r.currentLocation), free: !busySet.has(String(r._id)) })).filter((r) => Number.isFinite(r.lat));
}

/** Pharmacy layer: orders placed recently that still need a rider, vs free riders. */
async function pharmacyLayer(now) {
  const [orders, riders] = await Promise.all([
    PharmacyOrder.find({ status: { $in: ORDER_WAITING }, fulfilment: 'DELIVERY', rider: null, createdAt: { $gte: new Date(now - WINDOW_MIN * 60000) } })
      .select('deliveryLocation').limit(2000).lean(),
    onlineRiders(now)
  ]);
  return {
    demand: orders.map((o) => fromGeo(o.deliveryLocation)).filter(Boolean),
    supply: riders.filter((r) => r.free),
    online: riders.length
  };
}

/** Care layer: home visits looking for a nurse or physio, vs professionals online. */
async function careLayer(now) {
  const [bookings, staff] = await Promise.all([
    NurseBooking.find({ status: { $in: CARE_WAITING }, createdAt: { $gte: new Date(now - 3 * 60 * 60000) } })
      .select('serviceLocation.address.coordinates').limit(2000).lean(),
    User.find({ role: { $in: require('./staffAvailabilityService').STAFF_ROLES }, isActive: { $ne: false }, isOnline: true, 'currentLocation.updatedAt': { $gte: new Date(now - FRESH_MS) } })
      .select('currentLocation').lean()
  ]);
  return {
    demand: bookings.map((b) => b.serviceLocation && b.serviceLocation.address && b.serviceLocation.address.coordinates).filter((c) => c && Number.isFinite(c.lat)),
    supply: staff.map((s) => fromGeo(s.currentLocation)).filter(Boolean),
    online: staff.length
  };
}


/** The control-tower heat map: cells with demand, supply and a 0-4 heat level. */
async function heatmap({ layer = 'pharmacy', precision = 6, now = Date.now() } = {}) {
  // Two fixed layers; anything else is the pharmacy layer (no lookup by caller input).
  const isCare = layer === 'care';
  const read = isCare ? careLayer : pharmacyLayer;
  const { demand, supply, online } = await read(now);
  const cells = engine.heatCells(demand, supply, Math.min(Math.max(Number(precision) || 6, 5), 7));
  return {
    layer: isCare ? 'care' : 'pharmacy',
    windowMinutes: isCare ? 180 : WINDOW_MIN,
    totals: { demand: demand.length, freeSupply: supply.length, online, shortCells: cells.filter((c) => c.gap > 0).length },
    cells: cells.map((c) => ({
      hash: c.hash, lat: round6(c.lat), lng: round6(c.lng),
      bounds: { south: round6(c.south), north: round6(c.north), west: round6(c.west), east: round6(c.east) },
      demand: c.demand, supply: c.supply, gap: c.gap, heat: c.heat
    })),
    generatedAt: new Date(now)
  };
}

const round6 = (n) => Math.round(n * 1e6) / 1e6;

/** Busy areas near a partner (riders see orders, nurses see visits). No customer data, only cells. */
async function busyAreasFor(user, { now = Date.now() } = {}) {
  const me = await User.findById(user._id || user.id).select('role currentLocation').lean();
  const here = me && fromGeo(me.currentLocation);
  if (!here) return { areas: [], reason: 'NO_LOCATION' };
  const layer = me.role === 'delivery_partner' ? 'pharmacy' : 'care';
  const { cells } = await heatmap({ layer, now });
  const areas = engine.busyAreasNear(cells, here, { maxKm: layer === 'pharmacy' ? 6 : 10, limit: 3 });
  return {
    layer,
    areas: areas.map((a) => ({ lat: a.lat, lng: a.lng, heat: a.heat, demand: a.demand, distanceKm: a.distanceKm, rideMinutes: engine.rideMinutes(a.distanceKm) }))
  };
}

// ── Automatic surge ─────────────────────────────────────────────────────────
/** True when ops set this level by hand and it hasn't expired: leave it alone. */
function isManualStress(stress, now) {
  if (!stress || !stress.level || stress.level === 'NORMAL' || stress.auto) return false;
  return !stress.until || new Date(stress.until).getTime() > now;
}

/** Tick: raise or lower each active zone's stress from orders waiting vs riders free. */
async function autoSurge({ now = Date.now() } = {}) {
  const zones = await ServiceZone.find({ isActive: true }).select('code boundary stress').lean();
  if (!zones.length) return { zones: 0, changed: 0 };
  const freeIds = new Set((await onlineRiders(now)).filter((r) => r.free).map((r) => r.id));
  let changed = 0;
  for (const zone of zones) {
    if (isManualStress(zone.stress, now)) continue;
    const [waiting, free] = await Promise.all([
      PharmacyOrder.countDocuments({ zone: zone._id, status: { $in: ORDER_WAITING }, fulfilment: 'DELIVERY', rider: null, createdAt: { $gte: new Date(now - WINDOW_MIN * 60000) } }),
      freeIds.size
        ? User.distinct('_id', {
          _id: { $in: [...freeIds] }, currentLocation: { $geoWithin: { $geometry: zone.boundary } }
        }).then((ids) => ids.length)
        : 0
    ]);
    const next = engine.stressFor({ waiting, free });
    const current = (zone.stress && zone.stress.level) || 'NORMAL';
    const currentIsAuto = Boolean(zone.stress && zone.stress.auto);
    if (next.level === 'NORMAL') {
      if (current === 'NORMAL' || !currentIsAuto) continue;
      const since = zone.stress.updatedAt ? new Date(zone.stress.updatedAt).getTime() : 0;
      if (now - since < AUTO_SURGE_HOLD_MINUTES * 60000 && (!zone.stress.until || new Date(zone.stress.until).getTime() > now)) continue;
      await ServiceZone.updateOne({ _id: zone._id, 'stress.auto': true }, { $set: { stress: { level: 'NORMAL', radiusMultiplier: 1, auto: false, reason: 'Auto: riders caught up', updatedAt: new Date(now) } } });
      changed += 1;
      logger.info('Auto surge ended', { zone: zone.code, waiting, free });
      continue;
    }
    // Same level already on: just extend it. Otherwise set the new level.
    const reason = `Auto: ${waiting} orders waiting, ${free} riders free`;
    const until = new Date(now + AUTO_SURGE_MINUTES * 60000);
    const set = current === next.level && currentIsAuto
      ? { 'stress.until': until, 'stress.reason': reason }
      : { stress: { level: next.level, radiusMultiplier: next.radiusMultiplier, auto: true, reason, until, updatedAt: new Date(now) } };
    // Guard: only write if ops haven't set a manual level since we read the zone.
    await ServiceZone.updateOne({ _id: zone._id, $or: [{ 'stress.auto': true }, { 'stress.level': { $in: [null, 'NORMAL'] } }, { 'stress.until': { $lte: new Date(now) } }] }, { $set: set });
    if (current !== next.level) {
      changed += 1;
      logger.info('Auto surge', { zone: zone.code, level: next.level, waiting, free });
    }
  }
  return { zones: zones.length, changed };
}

// ── Learned ETA ─────────────────────────────────────────────────────────────
let lastLearnAt = 0;

/** Hourly: median packing minutes per store and riding speed per zone (last 14 days). */
async function learnEta({ now = Date.now(), force = false } = {}) {
  if (!force && now - lastLearnAt < LEARN_EVERY_MS) return { skipped: true };
  lastLearnAt = now;
  const since = new Date(now - 14 * 86400000);
  const done = await PharmacyOrder.find({ status: 'DELIVERED', 'milestones.deliveredAt': { $gte: since } })
    .select('vendor zone distanceKm milestones').limit(20000).lean();
  const prep = new Map();
  const speed = new Map();
  const push = (map, key, v) => { if (!key) return; const k = String(key); if (!map.has(k)) map.set(k, []); map.get(k).push(v); };
  for (const o of done) {
    const m = o.milestones || {};
    if (m.acceptedAt && m.readyAt) {
      const minutes = (new Date(m.readyAt) - new Date(m.acceptedAt)) / 60000;
      if (minutes >= 1 && minutes <= 90) push(prep, o.vendor, minutes);
    }
    if (m.pickedUpAt && m.deliveredAt && o.distanceKm > 0.3 && o.zone) {
      const minutes = (new Date(m.deliveredAt) - new Date(m.pickedUpAt)) / 60000;
      // Includes parking and the handover: that's what the customer waits for.
      const kmph = (o.distanceKm * 1.3) / (minutes / 60);
      if (minutes >= 2 && kmph >= 4 && kmph <= 45) push(speed, o.zone, kmph);
    }
  }
  const at = new Date(now);
  const vendorOps = [...prep].filter(([, v]) => v.length >= MIN_PREP_SAMPLES).map(([id, v]) => ({
    updateOne: { filter: { _id: id }, update: { $set: { learned: { prepMinutes: Math.round(engine.median(v) * 10) / 10, prepSamples: v.length, updatedAt: at } } } }
  }));
  const zoneOps = [...speed].filter(([, v]) => v.length >= MIN_SPEED_SAMPLES).map(([id, v]) => ({
    updateOne: { filter: { _id: id }, update: { $set: { learned: { rideKmph: Math.round(engine.median(v) * 10) / 10, rideSamples: v.length, updatedAt: at } } } }
  }));
  if (vendorOps.length) await PharmacyVendor.bulkWrite(vendorOps, { ordered: false });
  if (zoneOps.length) await ServiceZone.bulkWrite(zoneOps, { ordered: false });
  return { orders: done.length, stores: vendorOps.length, zones: zoneOps.length };
}

/** Zones for the control tower: stress now (manual or automatic) and learned speed. */
async function zonesSummary({ now = Date.now() } = {}) {
  const zones = await ServiceZone.find({ isActive: true }).select('code name city stress learned').sort({ city: 1, name: 1 }).lean();
  return zones.map((z) => {
    const s = z.stress || {};
    const live = s.level && s.level !== 'NORMAL' && (!s.until || new Date(s.until).getTime() > now);
    return {
      id: z._id, code: z.code, name: z.name, city: z.city,
      stress: live ? { level: s.level, radiusMultiplier: s.radiusMultiplier, reason: s.reason || null, until: s.until || null, auto: Boolean(s.auto) } : { level: 'NORMAL' },
      rideKmph: z.learned && z.learned.rideSamples >= MIN_SPEED_SAMPLES ? z.learned.rideKmph : null
    };
  });
}

module.exports = { heatmap, zonesSummary, busyAreasFor, autoSurge, learnEta, isManualStress, MIN_PREP_SAMPLES, MIN_SPEED_SAMPLES };
