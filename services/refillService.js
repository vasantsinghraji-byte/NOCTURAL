/**
 * Medicine refills: remind before regular medicines run out, and refill the
 * cart in one tap (normal checkout does the rest).
 */
const MedicineRefill = require('../models/medicineRefill');
const PharmacyOrder = require('../models/pharmacyOrder');
const PharmacyVendor = require('../models/pharmacyVendor');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors');
const logger = require('../utils/logger');

const REMIND_DAYS_BEFORE = 2;
const EVERY = [15, 30, 60, 90];

const view = (r) => ({
  _id: r._id, vendor: r.vendor && r.vendor._id ? { _id: r.vendor._id, name: r.vendor.name } : { _id: r.vendor }, items: r.items,
  everyDays: r.everyDays, nextDue: r.nextDue, status: r.status, fromOrder: r.fromOrder, lastOrder: r.lastOrder,
  dueSoon: r.status === 'ACTIVE' && new Date(r.nextDue).getTime() - Date.now() <= REMIND_DAYS_BEFORE * 86400000
});

/** Start a refill from a delivered order (first one due `everyDays` after delivery). */
async function create(patientId, { orderId, everyDays = 30 } = {}) {
  if (!EVERY.includes(Number(everyDays))) throw new ValidationError('Choose every 15, 30, 60 or 90 days');
  const order = await PharmacyOrder.findOne({ _id: orderId, patient: patientId }).lean();
  if (!order) throw new NotFoundError('Order');
  if (order.status !== 'DELIVERED') throw new ValidationError('You can set up a refill once the order is delivered');
  const items = (order.items || []).filter((i) => i.medicine && i.status !== 'UNAVAILABLE').map((i) => ({ medicine: i.medicine, name: i.name, quantity: i.quantity || 1 }));
  if (!items.length) throw new ValidationError('This order has no medicines to refill');
  const from = new Date(order.deliveredAt || Date.now());
  try {
    const r = await MedicineRefill.create({
      patient: patientId, vendor: order.vendor, fromOrder: order._id, items, everyDays: Number(everyDays),
      nextDue: new Date(from.getTime() + Number(everyDays) * 86400000)
    });
    return view(r.toObject());
  } catch (err) {
    if (err && err.code === 11000) throw new ConflictError('A refill is already set up for this order');
    throw err;
  }
}

async function listMine(patientId) {
  const rows = await MedicineRefill.find({ patient: patientId, status: { $in: ['ACTIVE', 'PAUSED'] } }).populate('vendor', 'name').sort({ nextDue: 1 }).lean();
  return rows.map(view);
}

async function update(patientId, id, { everyDays, status } = {}) {
  const set = {};
  if (everyDays !== undefined) {
    if (!EVERY.includes(Number(everyDays))) throw new ValidationError('Choose every 15, 30, 60 or 90 days');
    set.everyDays = Number(everyDays);
  }
  if (status !== undefined) {
    if (!['ACTIVE', 'PAUSED', 'CANCELLED'].includes(status)) throw new ValidationError('Choose a status');
    set.status = status;
  }
  const r = await MedicineRefill.findOneAndUpdate({ _id: id, patient: patientId, status: { $ne: 'CANCELLED' } }, { $set: set }, { returnDocument: 'after' }).populate('vendor', 'name').lean();
  if (!r) throw new NotFoundError('Refill');
  return view(r);
}

/** What to put in the cart: the same store and medicines. */
async function reorder(patientId, id) {
  const r = await MedicineRefill.findOne({ _id: id, patient: patientId, status: { $ne: 'CANCELLED' } }).lean();
  if (!r) throw new NotFoundError('Refill');
  const vendor = await PharmacyVendor.findById(r.vendor).select('name status isActive').lean();
  return {
    refillId: r._id,
    vendor: vendor ? { _id: vendor._id, name: vendor.name, available: vendor.status === 'APPROVED' && vendor.isActive !== false } : null,
    items: r.items.map((i) => ({ medicineId: i.medicine, name: i.name, quantity: i.quantity }))
  };
}

/** The refill order was placed: the next one is due a cycle later. */
async function markOrdered(patientId, id, orderId) {
  const order = await PharmacyOrder.findOne({ _id: orderId, patient: patientId }).select('_id').lean();
  if (!order) throw new NotFoundError('Order');
  const r = await MedicineRefill.findOne({ _id: id, patient: patientId, status: { $ne: 'CANCELLED' } });
  if (!r) throw new NotFoundError('Refill');
  if (String(r.lastOrder) === String(orderId)) return view(r.toObject()); // a retry
  const base = Math.max(Date.now(), r.nextDue.getTime() - REMIND_DAYS_BEFORE * 86400000);
  r.nextDue = new Date(base + r.everyDays * 86400000);
  r.lastOrder = orderId;
  r.status = 'ACTIVE';
  await r.save();
  return view(r.toObject());
}

/** Cron: remind once per cycle, two days before medicines run out (the Care Circle hears too). */
async function sweep(now = new Date()) {
  const due = await MedicineRefill.find({ status: 'ACTIVE', nextDue: { $lte: new Date(now.getTime() + REMIND_DAYS_BEFORE * 86400000) } }).limit(200).lean();
  let n = 0;
  for (const r of due) {
    if (r.remindedFor && new Date(r.remindedFor).getTime() === new Date(r.nextDue).getTime()) continue;
    const claimed = await MedicineRefill.updateOne({ _id: r._id, remindedFor: r.remindedFor || null }, { $set: { remindedFor: r.nextDue } });
    if (!claimed.modifiedCount) continue;
    const names = r.items.map((i) => i.name).filter(Boolean).slice(0, 2).join(', ');
    try {
      const Notification = require('../models/notification');
      // PHARMACY_ORDER_UPDATE: the Care Circle gets it too (models/notification.js).
      await Notification.create({
        user: r.patient, recipientModel: 'Patient', type: 'PHARMACY_ORDER_UPDATE', priority: 'HIGH',
        title: 'Your medicines are due soon', message: `${names || 'Your regular medicines'}: tap to order again from the same store.`,
        channels: { inApp: true, push: true }, metadata: { refillId: String(r._id) }, expiresAt: new Date(now.getTime() + 10 * 86400000)
      });
      await require('./pushNotificationService').sendToOwner({ owner: r.patient, userType: 'patient', title: 'Your medicines are due soon', body: `${names || 'Your regular medicines'}: tap to order again.`, data: { type: 'REFILL', refillId: String(r._id) } }).catch(() => undefined);
      n += 1;
    } catch (err) {
      logger.warn('Refill reminder failed', { refillId: String(r._id), error: err.message });
    }
  }
  return n;
}

module.exports = { create, listMine, update, reorder, markOrdered, sweep, REMIND_DAYS_BEFORE };
