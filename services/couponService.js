/**
 * Discount coupons (admin panel "Plans & coupons").
 *
 *   preview  checkout shows what a code takes off before the order is placed
 *   reserve  placing the order uses the code: checks every rule again, then
 *            counts the use atomically (total limit) and records it per order
 *            (per-customer limit, retries use it once)
 *   release  the order failed: give the use back
 *
 * Uses whose order was later cancelled, rejected or never paid are given back
 * lazily (releaseStale) before any limit is checked, so no cancel path can
 * leave a use stuck. Nabz pays for every discount: it is taken off the
 * customer's bill only, never off a partner's earnings.
 */

const mongoose = require('mongoose');
const Coupon = require('../models/coupon');
const CouponRedemption = require('../models/couponRedemption');
const logger = require('../utils/logger');
const { ConflictError, NotFoundError, ValidationError } = require('../utils/errors');

const HOUR_MS = 3600 * 1000;
const SERVICE_LABEL = Object.freeze({
  PHARMACY: 'medicine orders',
  CARE_VISIT: 'home visits',
  LAB: 'lab tests',
  CARE_PLAN: 'care plans',
  MEMBERSHIP: 'Nabz Plus'
});

/**
 * Per service: the order collection, which orders count as failed (their use is
 * given back) and what counts as an earlier order (first-order-only codes).
 * Models load lazily: several of them require services that require this one.
 */
const SERVICES = Object.freeze({
  PHARMACY: {
    kind: 'PHARMACY_ORDER',
    model: () => require('../models/pharmacyOrder'),
    dead: () => ({ status: { $in: ['CANCELLED', 'REJECTED'] } }),
    live: () => ({ status: { $nin: ['CANCELLED', 'REJECTED'] } })
  },
  CARE_VISIT: {
    kind: 'CARE_BOOKING',
    model: () => require('../models/nurseBooking'),
    dead: () => ({ status: 'CANCELLED' }),
    live: () => ({ status: { $ne: 'CANCELLED' } })
  },
  LAB: {
    kind: 'LAB_ORDER',
    model: () => require('../models/labOrder'),
    dead: () => ({ status: 'CANCELLED' }),
    live: () => ({ status: { $ne: 'CANCELLED' } })
  },
  CARE_PLAN: {
    kind: 'CARE_PLAN',
    model: () => require('../models/carePlan'),
    // Unpaid prepaid plans free their slots after a short hold; a day is plenty.
    dead: () => ({ $or: [{ status: 'CANCELLED' }, { status: 'PENDING_PAYMENT', createdAt: { $lt: new Date(Date.now() - 24 * HOUR_MS) } }] }),
    live: () => ({ status: { $nin: ['CANCELLED', 'PENDING_PAYMENT'] } })
  },
  MEMBERSHIP: {
    kind: 'MEMBERSHIP',
    model: () => require('../models/membership'),
    dead: () => ({ $or: [{ status: 'CANCELLED' }, { status: 'PENDING_PAYMENT', createdAt: { $lt: new Date(Date.now() - 24 * HOUR_MS) } }] }),
    live: () => ({ source: 'PAID', status: { $in: ['ACTIVE', 'REFUNDED'] } })
  }
});
const KIND_TO_SERVICE = Object.freeze(Object.fromEntries(Object.entries(SERVICES).map(([s, d]) => [d.kind, s])));

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const normalizeCode = (code) => String(code || '').trim().toUpperCase().replace(/\s+/g, '');

/** Rupees a coupon takes off an order worth `amount` (never more than the order). */
function discountFor(coupon, amount) {
  const base = Math.max(0, round2(amount));
  const raw = coupon.kind === 'PERCENT' ? (base * coupon.value) / 100 : coupon.value;
  const capped = coupon.kind === 'PERCENT' && coupon.maxDiscount ? Math.min(raw, coupon.maxDiscount) : raw;
  return Math.min(base, Math.round(capped));
}

/** One line for the customer: "₹100 off", "20% off (up to ₹150)". */
function offerText(c) {
  if (c.kind === 'FLAT') return `₹${c.value} off`;
  return `${c.value}% off${c.maxDiscount ? ` (up to ₹${c.maxDiscount})` : ''}`;
}

/** Give back uses whose order failed. `filter` narrows the redemptions to check. */
async function releaseStale(filter) {
  const open = await CouponRedemption.find({ ...filter, status: 'RESERVED' }).select('order coupon').limit(1000).lean();
  if (!open.length) return 0;
  let released = 0;
  const byKind = new Map();
  for (const r of open) {
    if (!byKind.has(r.order.kind)) byKind.set(r.order.kind, []);
    byKind.get(r.order.kind).push(r.order.id);
  }
  for (const [kind, ids] of byKind) {
    const def = SERVICES[KIND_TO_SERVICE[kind]];
    if (!def) continue;
    const Model = def.model();
    const dead = await Model.find({ _id: { $in: ids }, ...def.dead() }).select('_id').lean();
    // An order that no longer exists can't be using the code either.
    const existing = new Set((await Model.find({ _id: { $in: ids } }).select('_id').lean()).map((o) => String(o._id)));
    const gone = ids.filter((id) => !existing.has(String(id)));
    for (const id of [...dead.map((o) => o._id), ...gone]) {
      if (await release(kind, id, 'Order did not go ahead')) released += 1;
    }
  }
  return released;
}

/** Give one order's use back (idempotent). */
async function release(orderKind, orderId, reason = 'Order did not go ahead') {
  const r = await CouponRedemption.findOneAndUpdate(
    { 'order.kind': orderKind, 'order.id': orderId, status: 'RESERVED' },
    { $set: { status: 'RELEASED', releasedAt: new Date(), releaseReason: String(reason).slice(0, 120) } },
    { new: true }
  );
  if (!r) return false;
  await Coupon.updateOne({ _id: r.coupon, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
  return true;
}

/** Every rule except the limits that need a reservation. Throws a customer-friendly reason. */
async function checkRules(coupon, { patientId, service, amount, orderId, now = new Date() }) {
  const nope = (msg) => { throw new ValidationError(msg, 'couponCode'); };
  if (!coupon || !coupon.active) nope('That code is not valid');
  if (!SERVICES[service]) nope('Coupons can’t be used here');
  if (now < coupon.startsAt) nope(`This code starts on ${coupon.startsAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`);
  if (now >= coupon.endsAt) nope('This code has expired');
  if (!coupon.services.includes(service)) {
    nope(`This code works on ${coupon.services.map((s) => SERVICE_LABEL[s]).join(', ')}, not on ${SERVICE_LABEL[service]}`);
  }
  if (coupon.minOrder && round2(amount) < coupon.minOrder) nope(`Add ₹${round2(coupon.minOrder - amount)} more to use this code (minimum ₹${coupon.minOrder})`);
  if (coupon.totalLimit && coupon.usedCount >= coupon.totalLimit) {
    await releaseStale({ coupon: coupon._id });
    const fresh = await Coupon.findById(coupon._id).select('usedCount').lean();
    if (fresh.usedCount >= coupon.totalLimit) nope('This code has been fully used');
  }
  await releaseStale({ coupon: coupon._id, patient: patientId });
  const mine = await CouponRedemption.countDocuments({ coupon: coupon._id, patient: patientId, status: 'RESERVED', ...(orderId ? { 'order.id': { $ne: orderId } } : {}) });
  if (mine >= coupon.perCustomerLimit) nope(coupon.perCustomerLimit === 1 ? 'You have already used this code' : `You can use this code ${coupon.perCustomerLimit} times`);
  if (coupon.firstOrderOnly) {
    const def = SERVICES[service];
    const earlier = await def.model().exists({ patient: patientId, ...def.live(), ...(orderId ? { _id: { $ne: orderId } } : {}) });
    if (earlier) nope(`This code is for your first ${SERVICE_LABEL[service].replace(/s$/, '')} only`);
  }
  const discount = discountFor(coupon, amount);
  if (!(discount > 0)) nope('This code takes nothing off this order');
  return discount;
}

/** What a code would take off, for the checkout screen. Nothing is reserved. */
async function preview({ code, patientId, service, amount }) {
  const normalized = normalizeCode(code);
  if (!Coupon.CODE.test(normalized)) throw new ValidationError('That code is not valid', 'couponCode');
  const coupon = await Coupon.findOne({ code: normalized });
  const discount = await checkRules(coupon, { patientId, service, amount });
  return { code: coupon.code, description: coupon.description, offer: offerText(coupon), discount, payable: round2(amount - discount) };
}

/**
 * Use a code on an order about to be created (pass the order's _id up front).
 * Returns { code, discount }. Call release(kind, orderId) if the order then
 * fails to save.
 */
async function reserve({ code, patientId, service, amount, orderId }) {
  const normalized = normalizeCode(code);
  if (!Coupon.CODE.test(normalized)) throw new ValidationError('That code is not valid', 'couponCode');
  const def = SERVICES[service];
  if (!def) throw new ValidationError('Coupons can’t be used here', 'couponCode');
  if (!mongoose.isValidObjectId(orderId)) throw new Error('reserve needs the order id');

  // A retried request for the same order uses the code once.
  const already = await CouponRedemption.findOne({ 'order.kind': def.kind, 'order.id': orderId, status: 'RESERVED' }).lean();
  if (already) return { code: already.code, description: undefined, discount: already.discount };

  const coupon = await Coupon.findOne({ code: normalized });
  const discount = await checkRules(coupon, { patientId, service, amount, orderId });

  // Total limit: count the use atomically so the last use can't go twice.
  const counted = await Coupon.findOneAndUpdate(
    { _id: coupon._id, active: true, ...(coupon.totalLimit ? { usedCount: { $lt: coupon.totalLimit } } : {}) },
    { $inc: { usedCount: 1 } },
    { new: true }
  );
  if (!counted) throw new ConflictError('This code has just been fully used', 'couponCode');

  try {
    await CouponRedemption.create({
      coupon: coupon._id, code: coupon.code, patient: patientId, service, order: { kind: def.kind, id: orderId }, amount: round2(amount), discount
    });
  } catch (err) {
    await Coupon.updateOne({ _id: coupon._id, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
    if (err && err.code === 11000) {
      const existing = await CouponRedemption.findOne({ 'order.kind': def.kind, 'order.id': orderId }).lean();
      if (existing && existing.status === 'RESERVED') return { code: existing.code, description: coupon.description, discount: existing.discount };
    }
    throw err;
  }

  // Two orders by the same customer at the same moment: only the first keeps it.
  const mine = await CouponRedemption.find({ coupon: coupon._id, patient: patientId, status: 'RESERVED' }).sort({ createdAt: 1, _id: 1 }).select('order').lean();
  if (mine.length > coupon.perCustomerLimit && mine.slice(coupon.perCustomerLimit).some((r) => String(r.order.id) === String(orderId))) {
    await release(def.kind, orderId, 'Used twice at once');
    throw new ConflictError('You have already used this code', 'couponCode');
  }
  return { code: coupon.code, description: coupon.description, discount };
}

// ── Admin panel ─────────────────────────────────────────────────────────────

const ADMIN_FIELDS = ['description', 'kind', 'value', 'maxDiscount', 'minOrder', 'services', 'startsAt', 'endsAt', 'totalLimit', 'perCustomerLimit', 'firstOrderOnly', 'active'];

function cleanInput(input, existing) {
  const out = {};
  for (const k of ADMIN_FIELDS) if (input[k] !== undefined) out[k] = input[k];
  const next = { ...(existing ? existing.toObject() : {}), ...out };
  const nope = (msg) => { throw new ValidationError(msg); };
  if (!['PERCENT', 'FLAT'].includes(next.kind)) nope('Pick percent or flat amount');
  const value = Number(next.value);
  if (!Number.isInteger(value) || value < 1 || (next.kind === 'PERCENT' ? value > 100 : value > 100000)) {
    nope(next.kind === 'PERCENT' ? 'Percent off: 1 to 100' : 'Amount off: ₹1 to ₹1,00,000');
  }
  out.value = value;
  if (next.maxDiscount === null || next.maxDiscount === '' || next.kind === 'FLAT') out.maxDiscount = undefined;
  else if (next.maxDiscount !== undefined) {
    const cap = Number(next.maxDiscount);
    if (!Number.isInteger(cap) || cap < 1 || cap > 100000) nope('Maximum discount: ₹1 to ₹1,00,000');
    out.maxDiscount = cap;
  }
  const minOrder = Number(next.minOrder || 0);
  if (!Number.isFinite(minOrder) || minOrder < 0 || minOrder > 1000000) nope('Minimum order: ₹0 to ₹10,00,000');
  out.minOrder = minOrder;
  const services = [...new Set((next.services || []).map(String))].filter((s) => Coupon.SERVICES.includes(s));
  if (!services.length) nope('Pick at least one service');
  out.services = services;
  const startsAt = new Date(next.startsAt);
  const endsAt = new Date(next.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) nope('Pick a start and end date');
  if (endsAt <= startsAt) nope('The end must be after the start');
  if (endsAt - startsAt > 366 * 24 * HOUR_MS) nope('A code can run for at most a year');
  out.startsAt = startsAt;
  out.endsAt = endsAt;
  if (next.totalLimit === null || next.totalLimit === '' || next.totalLimit === undefined) out.totalLimit = undefined;
  else {
    const limit = Number(next.totalLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000000) nope('Total uses: 1 to 10,00,000, or empty for no limit');
    out.totalLimit = limit;
  }
  const per = Number(next.perCustomerLimit || 1);
  if (!Number.isInteger(per) || per < 1 || per > 100) nope('Uses per customer: 1 to 100');
  out.perCustomerLimit = per;
  const description = String(next.description || '').trim();
  if (description.length < 3 || description.length > 120) nope('Description: 3-120 characters');
  out.description = description;
  out.firstOrderOnly = next.firstOrderOnly === true;
  out.active = next.active !== false;
  return out;
}

const statusOf = (c, now = new Date()) => (!c.active ? 'OFF' : now < c.startsAt ? 'SCHEDULED' : now >= c.endsAt ? 'ENDED'
  : c.totalLimit && c.usedCount >= c.totalLimit ? 'USED_UP' : 'LIVE');

async function adminList() {
  const coupons = await Coupon.find({}).sort({ createdAt: -1 }).limit(300).lean();
  const totals = await CouponRedemption.aggregate([
    { $match: { coupon: { $in: coupons.map((c) => c._id) }, status: 'RESERVED' } },
    { $group: { _id: '$coupon', uses: { $sum: 1 }, discount: { $sum: '$discount' } } }
  ]);
  const byId = new Map(totals.map((t) => [String(t._id), t]));
  const now = new Date();
  return coupons.map((c) => {
    const t = byId.get(String(c._id)) || { uses: 0, discount: 0 };
    return { ...c, status: statusOf(c, now), offer: offerText(c), uses: t.uses, discountGiven: round2(t.discount) };
  });
}

async function adminCreate(adminId, input = {}) {
  const code = normalizeCode(input.code);
  if (!Coupon.CODE.test(code)) throw new ValidationError('Code: 3-20 letters and digits, no spaces');
  const clean = cleanInput(input, null);
  try {
    const coupon = await Coupon.create({ ...clean, code, createdBy: adminId, updatedBy: adminId });
    logger.logSecurity('coupon_created', { adminId: String(adminId), code, kind: clean.kind, value: clean.value });
    return coupon.toObject();
  } catch (err) {
    if (err && err.code === 11000) throw new ConflictError('A coupon with this code already exists');
    throw err;
  }
}

/** Change a coupon. The code can't change; past uses keep the discount they got. */
async function adminUpdate(adminId, id, input = {}) {
  if (!mongoose.isValidObjectId(id)) throw new ValidationError('Invalid coupon id');
  const coupon = await Coupon.findById(id);
  if (!coupon) throw new NotFoundError('Coupon', id);
  const clean = cleanInput(input, coupon);
  const unset = Object.fromEntries(['maxDiscount', 'totalLimit'].filter((k) => clean[k] === undefined).map((k) => [k, 1]));
  ['maxDiscount', 'totalLimit'].forEach((k) => { if (clean[k] === undefined) delete clean[k]; });
  const saved = await Coupon.findByIdAndUpdate(id, { $set: { ...clean, updatedBy: adminId }, ...(Object.keys(unset).length ? { $unset: unset } : {}) }, { new: true, runValidators: true });
  logger.logSecurity('coupon_updated', { adminId: String(adminId), code: coupon.code, fields: Object.keys(input).filter((k) => ADMIN_FIELDS.includes(k)) });
  return saved.toObject();
}

module.exports = {
  preview,
  reserve,
  release,
  releaseStale,
  discountFor,
  offerText,
  normalizeCode,
  adminList,
  adminCreate,
  adminUpdate,
  SERVICES: Object.keys(SERVICES),
  SERVICE_LABEL
};
