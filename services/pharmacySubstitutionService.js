/**
 * Medicine substitution with the customer's consent.
 *
 * The store is out of a medicine but has the same salt from another maker
 * (same molecule, strength and form: Medicine.saltKey). It suggests it on the
 * order; the customer sees both side by side and answers:
 *
 *   accept   the line becomes the substitute; the original's reserved units
 *            go back to the shelf; a cheaper substitute refunds the difference
 *            (prepaid) or lowers the bill (cash); a dearer one is allowed only
 *            on cash-on-delivery orders, shown clearly before accepting
 *   decline  the substitute's units go back; the original is removed and
 *            refunded exactly like "item unavailable" today
 *   no answer in 15 minutes → treated as declined (the order isn't held up)
 *
 * Only before packing (ACCEPTED). A prescription medicine can be suggested
 * only when the order's prescription is verified.
 */
const PharmacyOrder = require('../models/pharmacyOrder');
const VendorInventory = require('../models/vendorInventory');
const Medicine = require('../models/medicine');
const { ValidationError, NotFoundError, ConflictError, AuthorizationError } = require('../utils/errors');
const logger = require('../utils/logger');

const ANSWER_MINUTES = 15;
const round2 = (n) => Math.round(n * 100) / 100;
const lazy = {
  pharmacy: () => require('./pharmacyService'),
  assignment: () => require('./pharmacyAssignmentService'),
  batches: () => require('./pharmacyBatchService'),
  payments: () => require('./pharmacyPaymentService')
};

async function notify(userId, recipientModel, title, message, orderId) {
  try {
    const Notification = require('../models/notification');
    await Notification.create({
      user: userId, recipientModel, type: 'PHARMACY_ORDER_UPDATE', priority: 'HIGH', title, message,
      channels: { inApp: true, push: true }, metadata: { orderId: String(orderId), substitution: true }, expiresAt: new Date(Date.now() + 2 * 86400000)
    });
    await require('./pushNotificationService').sendToOwner({
      owner: userId, userType: recipientModel === 'Patient' ? 'patient' : 'provider', title, body: message,
      data: { type: 'PHARMACY_SUBSTITUTION', orderId: String(orderId) }
    }).catch(() => undefined);
  } catch (err) {
    logger.warn('Substitution notice failed', { orderId: String(orderId), error: err.message });
  }
}

const line = (order, medicineId) => (order.items || []).find((i) => String(i.medicine) === String(medicineId));

/** In-stock items at this store with the same salt as the ordered medicine (for the store to pick from). */
async function candidates(vendorId, orderId, medicineId) {
  const order = await PharmacyOrder.findOne({ _id: orderId, vendor: vendorId }).lean();
  if (!order) throw new NotFoundError('Order');
  const item = line(order, medicineId);
  if (!item) throw new NotFoundError('Item');
  const original = await Medicine.findById(item.medicine).select('saltKey').lean();
  if (!original || !original.saltKey) return [];
  const same = await Medicine.find({ saltKey: original.saltKey, _id: { $ne: item.medicine } }).select('_id').limit(50).lean();
  const stock = await VendorInventory.find({ vendor: vendorId, medicine: { $in: same.map((m) => m._id) }, isAvailable: true, stockQty: { $gte: item.quantity } })
    .populate('medicine', 'name manufacturer packSize form requiresPrescription genericName').limit(20).lean();
  return stock.filter((s) => s.medicine && !Medicine.onlineSaleBlockReason(s.medicine)).map((s) => ({
    medicineId: s.medicine._id, name: s.medicine.name, manufacturer: s.medicine.manufacturer, packSize: s.medicine.packSize,
    unitPrice: s.sellingPrice, mrp: s.mrp, lineTotal: round2(s.sellingPrice * item.quantity),
    difference: round2(s.sellingPrice * item.quantity - item.lineTotal), requiresPrescription: Boolean(s.medicine.requiresPrescription),
    allowed: order.paymentMode === 'COD' || s.sellingPrice * item.quantity <= item.lineTotal
  })).sort((a, b) => a.lineTotal - b.lineTotal);
}

/** The store suggests a substitute for one line. Its units are held while the customer decides. */
async function propose(orderId, { vendorId, actorUserId, medicineId, substituteId, note, now = new Date() }) {
  const order = await PharmacyOrder.findOne({ _id: orderId, vendor: vendorId });
  if (!order) throw new NotFoundError('Order');
  if (order.status !== 'ACCEPTED') throw new ConflictError('Suggest a substitute after accepting the order and before packing it');
  const item = line(order, medicineId);
  if (!item || (item.status || 'AVAILABLE') !== 'AVAILABLE') throw new NotFoundError('Item');
  if (item.substitution && item.substitution.status === 'PENDING') throw new ConflictError('A substitute is already waiting for the customer');
  const [original, sub] = await Promise.all([
    Medicine.findById(item.medicine).select('saltKey').lean(),
    Medicine.findById(substituteId).lean()
  ]);
  if (!sub) throw new NotFoundError('Substitute');
  if (!original || !original.saltKey || original.saltKey !== sub.saltKey) {
    throw new ValidationError('A substitute must be the same medicine: same salt, strength and form');
  }
  if (sub.requiresPrescription && !(order.prescription && order.prescription.verified)) {
    throw new ValidationError('This substitute needs a prescription; verify the order’s prescription first');
  }
  const inv = await VendorInventory.findOne({ vendor: vendorId, medicine: sub._id }).lean();
  if (!inv) throw new ValidationError('This substitute isn’t on your shelf');
  const lineTotal = round2(inv.sellingPrice * item.quantity);
  if (order.paymentMode !== 'COD' && lineTotal > item.lineTotal) {
    throw new ValidationError('On prepaid orders a substitute can’t cost more than the original');
  }

  // Hold its units (same reservation as checkout: guarded decrement + expiry batches).
  const [reserved] = await lazy.pharmacy().reserveStock(vendorId, [{ medicineId: sub._id, quantity: item.quantity }], { now });
  const substitution = {
    medicine: sub._id, name: sub.name, manufacturer: sub.manufacturer, packSize: sub.packSize, form: sub.form,
    unitPrice: inv.sellingPrice, mrp: inv.mrp, quantity: item.quantity, lineTotal,
    requiresPrescription: Boolean(sub.requiresPrescription), scheduleType: sub.scheduleType, batches: reserved.batches || [],
    note: note ? String(note).slice(0, 200) : undefined, status: 'PENDING', proposedAt: now,
    respondBy: new Date(now.getTime() + ANSWER_MINUTES * 60000), proposedBy: actorUserId
  };
  const updated = await PharmacyOrder.findOneAndUpdate(
    { _id: order._id, status: 'ACCEPTED', items: { $elemMatch: { medicine: item.medicine, 'substitution.status': { $ne: 'PENDING' } } } },
    {
      $set: { 'items.$.substitution': substitution },
      $push: { timeline: { status: order.status, at: now, note: `Substitute suggested for ${item.name}: ${sub.name}`, by: actorUserId } }
    },
    { new: true }
  );
  if (!updated) {
    await releaseUnits(vendorId, sub._id, item.quantity, reserved.batches);
    throw new ConflictError('This order just changed. Refresh and try again.');
  }
  const diff = round2(lineTotal - item.lineTotal);
  notify(order.patient, 'Patient', `A substitute for ${item.name}`,
    `Same medicine from another maker: ${sub.name}${diff < 0 ? `, ₹${-diff} cheaper` : diff > 0 ? `, ₹${diff} more` : ', same price'}. Open the order to accept or decline within ${ANSWER_MINUTES} minutes.`, order._id);
  return updated.toObject();
}

async function releaseUnits(vendorId, medicineId, quantity, batches) {
  try {
    const back = await lazy.batches().returnUnits(vendorId, medicineId, quantity, batches || []);
    if (back > 0) await VendorInventory.updateOne({ vendor: vendorId, medicine: medicineId }, { $inc: { stockQty: back } });
  } catch (err) {
    logger.error('Substitute stock release failed', { medicineId: String(medicineId), error: err.message });
  }
}

/** The customer answers (or the 15 minutes run out: `by: 'SYSTEM'`). */
async function respond(orderId, medicineId, accept, { patientId, by = 'CUSTOMER', now = new Date() } = {}) {
  const order = await PharmacyOrder.findById(orderId);
  if (!order) throw new NotFoundError('Order');
  if (patientId && String(order.patient) !== String(patientId)) throw new AuthorizationError('Not your order');
  const item = line(order, medicineId);
  const sub = item && item.substitution;
  if (!sub || sub.status !== 'PENDING') throw new ConflictError('There is no substitute waiting for an answer');
  // Claim the answer first so two taps (or the timer) can't both act.
  const claimed = await PharmacyOrder.updateOne(
    { _id: order._id, items: { $elemMatch: { medicine: item.medicine, 'substitution.status': 'PENDING' } } },
    { $set: { 'items.$.substitution.status': accept ? 'ACCEPTED' : by === 'SYSTEM' ? 'EXPIRED' : 'DECLINED', 'items.$.substitution.respondedAt': now } }
  );
  if (!claimed.modifiedCount) throw new ConflictError('This substitute was already answered');

  if (!accept) {
    await releaseUnits(order.vendor, sub.medicine, sub.quantity, sub.batches);
    const reason = by === 'SYSTEM' ? 'Not in stock; no answer on the substitute' : 'Not in stock; substitute declined';
    let result;
    try {
      result = await lazy.assignment().markItemsUnavailable(order._id, { vendorId: order.vendor, actorUserId: undefined, medicineIds: [String(item.medicine)], reason });
    } catch (err) {
      logger.error('Removing the declined line failed', { orderId: String(order._id), error: err.message });
      throw err;
    }
    return result && result.toObject ? result.toObject() : result;
  }

  // Accept: the line becomes the substitute; the original's units go back to the shelf.
  const fresh = await PharmacyOrder.findById(order._id);
  const items = fresh.items.map((i) => {
    const plain = i.toObject ? i.toObject() : { ...i };
    if (String(plain.medicine) !== String(item.medicine)) return plain;
    return {
      medicine: sub.medicine, name: sub.name, form: sub.form, packSize: sub.packSize, quantity: sub.quantity,
      unitPrice: sub.unitPrice, mrp: sub.mrp, lineTotal: sub.lineTotal, requiresPrescription: sub.requiresPrescription,
      scheduleType: sub.scheduleType, status: 'AVAILABLE', batches: sub.batches,
      substitution: { ...plain.substitution, status: 'ACCEPTED', respondedAt: now },
      substitutedFrom: { medicine: plain.medicine, name: plain.name, unitPrice: plain.unitPrice, lineTotal: plain.lineTotal }
    };
  });
  const itemsSubtotal = round2(items.filter((i) => (i.status || 'AVAILABLE') === 'AVAILABLE').reduce((s, i) => s + i.lineTotal, 0));
  const total = round2(itemsSubtotal + (fresh.amounts.deliveryFee || 0) + (fresh.amounts.tax || 0) - (fresh.amounts.discount || 0));
  const lower = round2(fresh.amounts.total - total);
  const updated = await PharmacyOrder.findOneAndUpdate(
    { _id: fresh._id, 'amounts.total': fresh.amounts.total },
    {
      $set: { items, 'amounts.itemsSubtotal': itemsSubtotal, 'amounts.total': total },
      $push: { timeline: { status: fresh.status, at: now, note: `Customer accepted ${sub.name} in place of ${item.name}` } }
    },
    { new: true }
  );
  if (!updated) throw new ConflictError('This order just changed. Refresh and try again.');
  await releaseUnits(order.vendor, item.medicine, item.quantity, item.batches);
  const final = lower > 0 && updated.paymentMode === 'PREPAID'
    ? await lazy.payments().requestPartialRefund(updated._id, lower, `Cheaper substitute: ${sub.name}`.slice(0, 200))
    : updated;
  const PharmacyVendor = require('../models/pharmacyVendor');
  const vendor = await PharmacyVendor.findById(order.vendor).select('owner').lean();
  if (vendor && vendor.owner) notify(vendor.owner, 'User', 'Substitute accepted', `${sub.name} replaces ${item.name} on order ${order.orderNumber}. You can pack it now.`, order._id);
  return (final && final.toObject ? final.toObject() : final) || updated.toObject();
}

/** Cron: substitutes nobody answered in time are treated as declined. */
async function sweep(now = new Date()) {
  const due = await PharmacyOrder.find({ status: 'ACCEPTED', items: { $elemMatch: { 'substitution.status': 'PENDING', 'substitution.respondBy': { $lte: now } } } }).limit(50).lean();
  let n = 0;
  for (const o of due) {
    for (const i of o.items.filter((x) => x.substitution && x.substitution.status === 'PENDING' && new Date(x.substitution.respondBy) <= now)) {
      try { await respond(o._id, i.medicine, false, { by: 'SYSTEM', now }); n += 1; } catch (err) { logger.warn('Substitute expiry failed', { orderId: String(o._id), error: err.message }); }
    }
  }
  return n;
}

const hasPending = (order) => (order.items || []).some((i) => i.substitution && i.substitution.status === 'PENDING');

module.exports = { candidates, propose, respond, sweep, hasPending, ANSWER_MINUTES };
