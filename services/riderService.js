/**
 * Nabz riders for pharmacy deliveries (role delivery_partner).
 *
 *   online      the rider app heartbeats its location (like staff "Go online")
 *   assign      when a store marks an order ready: add it to a rider already
 *               heading to the same store whose drops are close by (a batch of
 *               up to 3), else the nearest free online rider. Cold-chain orders
 *               (insulin, vaccines) never wait in a batch.
 *   steps       arrived at store → picked up (order goes out for delivery) →
 *               arrived → delivered with the customer's code (same check as
 *               stores use), or released before pickup to the next rider
 *   pay         per drop + per road km from the store + a bonus for each extra
 *               drop on the trip; booked in the settlement ledger
 *
 * With no rider free, nothing breaks: the store can still deliver itself.
 */
const mongoose = require('mongoose');
const PharmacyOrder = require('../models/pharmacyOrder');
const PharmacyVendor = require('../models/pharmacyVendor');
const User = require('../models/user');
const Medicine = require('../models/medicine');
const { getRevenuePolicy } = require('../config/revenue');
const { ValidationError, NotFoundError, ConflictError, AuthorizationError } = require('../utils/errors');
const logger = require('../utils/logger');

const ACTIVE = ['ASSIGNED', 'ACCEPTED', 'ARRIVED_AT_STORE', 'PICKED_UP', 'ARRIVED_AT_CUSTOMER'];
const BEFORE_PICKUP = ['ASSIGNED', 'ACCEPTED', 'ARRIVED_AT_STORE'];
const FRESH_MS = 3 * 60 * 1000;
const round2 = (n) => Math.round(n * 100) / 100;

function km(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
const pointOf = (geo) => (geo && Array.isArray(geo.coordinates) && geo.coordinates.length === 2 ? { lat: geo.coordinates[1], lng: geo.coordinates[0] } : null);
const policy = () => getRevenuePolicy().pharmacy.rider;
const roadFactor = () => getRevenuePolicy().care.travel.roadFactor;

async function notify(userId, title, message, orderId) {
  try {
    const Notification = require('../models/notification');
    await Notification.create({ user: userId, recipientModel: 'User', type: 'PHARMACY_ORDER_NEW', priority: 'HIGH', title, message, channels: { inApp: true, push: true }, metadata: { orderId: String(orderId) }, expiresAt: new Date(Date.now() + 2 * 86400000) });
    await require('./pushNotificationService').sendToOwner({ owner: userId, userType: 'provider', title, body: message, data: { type: 'RIDER_JOB', orderId: String(orderId) } }).catch(() => undefined);
  } catch (err) {
    logger.warn('Rider notice failed', { error: err.message });
  }
}

// ── Online / offline ────────────────────────────────────────────────────────
async function setOnline(riderId, { online, lat, lng }) {
  const rider = await User.findOne({ _id: riderId, role: 'delivery_partner', isActive: { $ne: false } }).select('_id isVerified').lean();
  if (!rider) throw new AuthorizationError('Rider account only');
  if (online) {
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) throw new ValidationError('Location needed to go online');
    if (!rider.isVerified) throw new AuthorizationError('Your documents are still being checked');
    await User.updateOne({ _id: riderId }, { $set: { isOnline: true, currentLocation: { type: 'Point', coordinates: [Number(lng), Number(lat)], updatedAt: new Date() } } });
    setImmediate(() => { sweep().catch(() => undefined); }); // pick up waiting orders straight away
  } else {
    await User.updateOne({ _id: riderId }, { $set: { isOnline: false }, $unset: { currentLocation: 1 } });
  }
  return { online: Boolean(online) };
}

// ── Assignment and batching ─────────────────────────────────────────────────
async function isColdChain(order) {
  if (order.coldChain !== undefined) return Boolean(order.coldChain);
  const ids = (order.items || []).map((i) => i.medicine).filter(Boolean);
  return ids.length ? Boolean(await Medicine.exists({ _id: { $in: ids }, coldChain: true })) : false;
}

/** Give a ready order to a rider (batch first, then nearest free). Never throws. */
async function assign(orderId, { exclude = [] } = {}) {
  try {
    const order = await PharmacyOrder.findById(orderId).lean();
    if (!order || order.status !== 'READY_FOR_PICKUP' || order.fulfilment !== 'DELIVERY' || order.rider) return null;
    const drop = pointOf(order.deliveryLocation);
    const vendor = await PharmacyVendor.findById(order.vendor).select('name location').lean();
    const store = vendor && pointOf(vendor.location);
    if (!drop || !store) return null;
    const p = policy();
    const cold = await isColdChain(order);
    const declined = [...exclude, ...((order.riderDeclined || []).map(String))];

    // 1) Batch: a rider not yet picked up at this same store, few drops, all nearby.
    let riderId = null;
    let batched = false;
    if (!cold) {
      const open = await PharmacyOrder.find({ vendor: order.vendor, rider: { $ne: null }, deliveryStatus: { $in: BEFORE_PICKUP }, status: 'READY_FOR_PICKUP' })
        .select('rider deliveryLocation coldChain').lean();
      const byRider = new Map();
      for (const o of open) {
        const k = String(o.rider);
        if (!byRider.has(k)) byRider.set(k, []);
        byRider.get(k).push(o);
      }
      for (const [rid, jobs] of byRider) {
        if (declined.includes(rid) || jobs.length >= p.maxBatch || jobs.some((j) => j.coldChain)) continue;
        if (jobs.every((j) => { const d = pointOf(j.deliveryLocation); return d && km(d, drop) <= p.batchRadiusKm; })) { riderId = rid; batched = true; break; }
      }
    }

    // 2) Nearest online rider with nothing on hand.
    if (!riderId) {
      const busy = await PharmacyOrder.distinct('rider', { rider: { $ne: null }, deliveryStatus: { $in: ACTIVE } });
      const [rider] = await User.aggregate([
        {
          $geoNear: {
            near: { type: 'Point', coordinates: [store.lng, store.lat] },
            key: 'currentLocation',
            distanceField: 'distanceMeters',
            maxDistance: p.searchRadiusKm * 1000,
            spherical: true,
            query: {
              role: 'delivery_partner', isActive: { $ne: false }, isOnline: true, isVerified: true,
              'currentLocation.updatedAt': { $gte: new Date(Date.now() - FRESH_MS) },
              _id: { $nin: [...busy, ...declined.filter((x) => mongoose.isValidObjectId(x)).map((x) => new mongoose.Types.ObjectId(x))] }
            }
          }
        },
        { $limit: 1 },
        { $project: { _id: 1 } }
      ]);
      riderId = rider ? String(rider._id) : null;
    }
    if (!riderId) return null;

    const now = new Date();
    const updated = await PharmacyOrder.findOneAndUpdate(
      { _id: order._id, rider: null, status: 'READY_FOR_PICKUP' },
      { $set: { rider: riderId, deliveryStatus: 'ASSIGNED', coldChain: cold, 'milestones.riderAssignedAt': now }, $push: { timeline: { status: 'READY_FOR_PICKUP', at: now, note: batched ? 'Rider assigned (batched with another order)' : 'Rider assigned' } } },
      { new: true }
    ).lean();
    if (!updated) return null;
    notify(riderId, cold ? 'Cold-chain pickup: go now' : batched ? 'Another drop added to your trip' : 'New pickup',
      `${vendor.name}: ${cold ? 'keep it in the cooler bag, deliver within 60 minutes' : 'order ready for pickup'}.`, order._id);
    return { riderId, batched, coldChain: cold };
  } catch (err) {
    logger.warn('Rider assignment failed', { orderId: String(orderId), error: err.message });
    return null;
  }
}

// ── Jobs and steps ──────────────────────────────────────────────────────────
async function ownJob(riderId, orderId) {
  const order = await PharmacyOrder.findById(orderId).select('+deliveryOtp.code');
  if (!order || String(order.rider) !== String(riderId)) throw new NotFoundError('Delivery');
  return order;
}

/** What I'm carrying: grouped by store (a batch), drops nearest-first. */
async function myJobs(riderId) {
  const orders = await PharmacyOrder.find({ rider: riderId, deliveryStatus: { $in: ACTIVE } })
    .populate('vendor', 'name location address phone').sort({ 'milestones.riderAssignedAt': 1 }).lean();
  const batches = new Map();
  for (const o of orders) {
    const key = String(o.vendor && o.vendor._id);
    if (!batches.has(key)) {
      batches.set(key, {
        store: { _id: o.vendor && o.vendor._id, name: o.vendor && o.vendor.name, address: o.vendor && o.vendor.address, phone: o.vendor && o.vendor.phone, ...pointOf(o.vendor && o.vendor.location) },
        drops: []
      });
    }
    const pay = payFor(o, o.vendor && pointOf(o.vendor.location), 0);
    batches.get(key).drops.push({
      orderId: o._id, orderNumber: o.orderNumber, deliveryStatus: o.deliveryStatus, coldChain: Boolean(o.coldChain),
      items: (o.items || []).reduce((n, i) => n + (i.quantity || 1), 0),
      collectCash: o.paymentMode === 'COD' ? round2(o.amounts.total) : 0,
      address: { line1: o.deliveryAddress && o.deliveryAddress.line1, line2: o.deliveryAddress && o.deliveryAddress.line2, city: o.deliveryAddress && o.deliveryAddress.city },
      contactName: (o.deliveryAddress && o.deliveryAddress.contactName) || null,
      contactPhone: (o.deliveryAddress && o.deliveryAddress.contactPhone) || null,
      ...pointOf(o.deliveryLocation),
      pay: pay.amount
    });
  }
  const out = [...batches.values()];
  for (const b of out) {
    if (Number.isFinite(b.lat)) b.drops.sort((x, y) => km(b, x) - km(b, y));
  }
  return out;
}

/** Pay for one drop: base + road km from the store, plus a bonus when it was part of a batch. */
function payFor(order, store, batchSize) {
  const p = policy();
  const drop = pointOf(order.deliveryLocation);
  const roadKm = store && drop ? Math.ceil(km(store, drop) * roadFactor() * 10) / 10 : 0;
  return { roadKm, amount: round2(p.perDrop + p.perKm * roadKm + (batchSize > 1 ? p.batchBonus : 0)) };
}

async function step(riderId, orderId, action, body = {}) {
  const order = await ownJob(riderId, orderId);
  const now = new Date();
  const set = async (from, to, extra = {}) => {
    const r = await PharmacyOrder.updateOne({ _id: order._id, rider: riderId, deliveryStatus: { $in: from } }, { $set: { deliveryStatus: to, ...extra } });
    if (!r.modifiedCount) throw new ConflictError('This delivery just changed. Refresh.');
  };
  const pharmacy = require('./pharmacyService');
  if (action === 'arrived-store') await set(['ASSIGNED', 'ACCEPTED'], 'ARRIVED_AT_STORE');
  else if (action === 'picked-up') {
    if (!BEFORE_PICKUP.includes(order.deliveryStatus)) throw new ConflictError('Already picked up');
    // The order leaves the store: same transition the store would make.
    await pharmacy.updateOrderStatus(order._id, { vendorId: order.vendor, actorUserId: riderId, status: 'OUT_FOR_DELIVERY', note: 'Picked up by the Nabz rider' });
    await set(BEFORE_PICKUP, 'PICKED_UP', { 'milestones.pickedUpAt': now });
  } else if (action === 'arrived') await set(['PICKED_UP'], 'ARRIVED_AT_CUSTOMER');
  else if (action === 'delivered') {
    if (!['PICKED_UP', 'ARRIVED_AT_CUSTOMER'].includes(order.deliveryStatus)) throw new ConflictError('Pick the order up first');
    const batchSize = await PharmacyOrder.countDocuments({ rider: riderId, vendor: order.vendor, 'milestones.pickedUpAt': order.milestones && order.milestones.pickedUpAt });
    // The customer's 4-digit code (or a reason, flagged for review): the store's own rule.
    const delivered = await pharmacy.updateOrderStatus(order._id, {
      vendorId: order.vendor, actorUserId: riderId, status: 'DELIVERED',
      deliveryCode: body.code, deliveredWithoutCodeReason: body.reason, note: 'Delivered by the Nabz rider'
    });
    await set(['PICKED_UP', 'ARRIVED_AT_CUSTOMER'], 'DELIVERED');
    const vendor = await PharmacyVendor.findById(order.vendor).select('location').lean();
    const pay = payFor(delivered, vendor && pointOf(vendor.location), batchSize);
    await require('./settlementService').recordRiderDrop(delivered, riderId, pay);
    return { delivered: true, pay: pay.amount };
  } else throw new ValidationError('Unknown step');
  return { ok: true };
}

/** Can't take it (before pickup): it goes to the next rider. */
async function release(riderId, orderId, reason) {
  const order = await ownJob(riderId, orderId);
  if (!BEFORE_PICKUP.includes(order.deliveryStatus)) throw new ConflictError('Already picked up; deliver it or call support');
  const r = await PharmacyOrder.updateOne(
    { _id: order._id, rider: riderId, deliveryStatus: { $in: BEFORE_PICKUP } },
    { $set: { rider: null }, $unset: { deliveryStatus: 1 }, $addToSet: { riderDeclined: String(riderId) }, $push: { timeline: { status: order.status, at: new Date(), note: `Rider released: ${String(reason || 'no reason').slice(0, 120)}` } } }
  );
  if (!r.modifiedCount) throw new ConflictError('This delivery just changed. Refresh.');
  setImmediate(() => { assign(order._id).catch(() => undefined); });
  return { released: true };
}

async function earnings(riderId) {
  const SettlementEntry = require('../models/settlementEntry');
  const day = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const todayStart = new Date(`${day}T00:00:00+05:30`);
  const weekStart = new Date(todayStart.getTime() - 6 * 86400000);
  const rows = await SettlementEntry.find({ 'party.kind': 'RIDER', 'party.id': riderId, occurredAt: { $gte: weekStart } }).select('type amount occurredAt').lean();
  const sum = (since, type) => round2(rows.filter((r) => r.type === type && r.occurredAt >= since).reduce((n, r) => n + r.amount, 0));
  const drops = (since) => rows.filter((r) => r.type === 'RIDER_PAYOUT' && r.occurredAt >= since).length;
  return {
    today: { earned: sum(todayStart, 'RIDER_PAYOUT'), drops: drops(todayStart), cashCollected: sum(todayStart, 'CASH_COLLECTED') },
    week: { earned: sum(weekStart, 'RIDER_PAYOUT'), drops: drops(weekStart), cashCollected: sum(weekStart, 'CASH_COLLECTED') }
  };
}

/** Cron: ready orders still without a rider get another try. */
async function sweep() {
  const waiting = await PharmacyOrder.find({ status: 'READY_FOR_PICKUP', fulfilment: 'DELIVERY', rider: null, 'milestones.readyAt': { $lte: new Date(Date.now() - 30000) } })
    .sort({ coldChain: -1, 'milestones.readyAt': 1 }).select('_id').limit(50).lean();
  let n = 0;
  for (const o of waiting) if (await assign(o._id)) n += 1;
  return n;
}

module.exports = { setOnline, assign, myJobs, step, release, earnings, sweep, payFor, isColdChain };
