/**
 * Pharmacy Compliance Service
 *
 *   patient limits  per-patient monthly caps on misuse-prone medicines across
 *                   ALL stores (a per-order cap alone is beaten by ordering
 *                   twice, or from three stores), plus risk flags for ops review
 *   Rx verification the store pharmacist confirms the prescription and records
 *                   the prescriber before anything prescription-only is packed
 *   H1 register     Schedule H1 supplies need a register: date, patient,
 *                   prescriber, drug, batch, quantity. We export it per store.
 *
 * Note on the monthly cap: two orders placed at the same instant can both pass
 * the check. The flags and the per-order cap still apply; the H1 register and
 * the review queue catch the rest. A hard guarantee would need a per-patient
 * lock, which isn't worth the latency for this rare case.
 */

const mongoose = require('mongoose');
const PharmacyOrder = require('../models/pharmacyOrder');
const Medicine = require('../models/medicine');
require('../models/patient'); // registers the model used by populate('patient')
require('../models/user'); // pharmacist / vendor references
const { ValidationError, NotFoundError, ConflictError, AuthorizationError } = require('../utils/errors');

const DAY = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 30;
const LIVE_STATUSES = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED'];
const RX_MAX_AGE_DAYS = () => {
  const n = Number(process.env.PHARMACY_RX_MAX_AGE_DAYS);
  return Number.isFinite(n) && n > 0 ? n : 180;
};

/**
 * Enforce monthly caps and compute risk flags for an order about to be
 * placed. `lines` = [{ medicine (doc), quantity }], `vendorId` = this store.
 * Throws ValidationError past a cap; returns riskFlags to store on the order.
 */
async function checkPatientLimits(patientId, lines, vendorId, now = new Date()) {
  const watched = lines.filter((l) => l.medicine.maxQtyPerMonth || l.medicine.habitForming);
  if (watched.length === 0) return [];
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY);
  const ids = watched.map((l) => l.medicine._id);
  const history = await PharmacyOrder.find({
    patient: patientId,
    status: { $in: LIVE_STATUSES },
    createdAt: { $gte: since },
    'items.medicine': { $in: ids }
  }).select('vendor items createdAt').lean();

  const flags = [];
  for (const line of watched) {
    const id = String(line.medicine._id);
    let taken = 0;
    let lastAt = null;
    const stores = new Set([String(vendorId)]);
    for (const order of history) {
      for (const item of order.items) {
        if (String(item.medicine) !== id || (item.status || 'AVAILABLE') !== 'AVAILABLE') continue;
        taken += item.quantity;
        stores.add(String(order.vendor));
        if (!lastAt || order.createdAt > lastAt) lastAt = order.createdAt;
      }
    }
    const cap = line.medicine.maxQtyPerMonth;
    if (cap && taken + line.quantity > cap) {
      const left = Math.max(0, cap - taken);
      throw new ValidationError(left > 0
        ? `${line.medicine.name}: you can order ${left} more in the next few days (limit ${cap} per 30 days)`
        : `${line.medicine.name}: you've reached the limit of ${cap} per 30 days`);
    }
    if (cap && taken + line.quantity >= Math.ceil(cap * 0.8)) {
      flags.push({ code: 'MONTHLY_LIMIT_NEAR', detail: `${line.medicine.name}: ${taken + line.quantity}/${cap} in 30 days` });
    }
    if (line.medicine.habitForming && stores.size >= 3) {
      flags.push({ code: 'MANY_STORES', detail: `${line.medicine.name} from ${stores.size} stores in 30 days` });
    }
    if (line.medicine.habitForming && lastAt && now.getTime() - new Date(lastAt).getTime() < 5 * DAY) {
      flags.push({ code: 'EARLY_REFILL', detail: `${line.medicine.name} again within 5 days` });
    }
  }
  return flags;
}

/**
 * Store pharmacist confirms the prescription. Needed before a prescription
 * order can be packed (pharmacyService blocks ACCEPTED → PREPARING otherwise).
 */
async function verifyPrescription(orderId, { vendorId, actorUserId, prescriberName, prescriberRegistrationNumber, prescriberAddress, prescribedOn }, now = new Date()) {
  if (!mongoose.isValidObjectId(orderId)) throw new ValidationError('Invalid order id');
  const order = await PharmacyOrder.findById(orderId).select('vendor status requiresPrescription prescription').lean();
  if (!order) throw new NotFoundError('Order', orderId);
  if (String(order.vendor) !== String(vendorId)) throw new AuthorizationError('You can only verify your own store orders');
  if (!order.requiresPrescription) throw new ValidationError('This order has no prescription medicines');
  if (!order.prescription || !order.prescription.key) throw new ConflictError('The customer has not uploaded a prescription');
  if (!['PLACED', 'ACCEPTED'].includes(order.status)) throw new ConflictError(`Cannot verify a prescription on an order that is ${order.status}`);

  const name = String(prescriberName || '').trim();
  const reg = String(prescriberRegistrationNumber || '').trim();
  if (name.length < 3) throw new ValidationError("Enter the doctor's name from the prescription");
  if (reg.length < 3) throw new ValidationError("Enter the doctor's registration number from the prescription");
  const date = new Date(prescribedOn);
  if (Number.isNaN(date.getTime())) throw new ValidationError('Enter the date on the prescription');
  if (date.getTime() > now.getTime() + DAY) throw new ValidationError('The prescription date is in the future');
  if (now.getTime() - date.getTime() > RX_MAX_AGE_DAYS() * DAY) {
    throw new ValidationError(`This prescription is older than ${RX_MAX_AGE_DAYS()} days. Ask the customer for a current one`);
  }

  const updated = await PharmacyOrder.findOneAndUpdate(
    { _id: orderId, vendor: vendorId, status: { $in: ['PLACED', 'ACCEPTED'] } },
    {
      $set: {
        'prescription.verified': true,
        'prescription.verifiedBy': actorUserId,
        'prescription.verifiedAt': now,
        'prescription.prescriber': { name: name.slice(0, 120), registrationNumber: reg.slice(0, 60), address: String(prescriberAddress || '').trim().slice(0, 200) || undefined },
        'prescription.prescribedOn': date
      },
      $push: { timeline: { status: order.status, at: now, note: `Prescription verified (Dr ${name.slice(0, 60)})`, by: actorUserId } }
    },
    { new: true }
  );
  if (!updated) throw new ConflictError('This order just changed. Refresh and try again');
  return updated;
}

/**
 * Schedule H1 register rows for supplies in [from, to). vendorId = one store,
 * or null for every store (admin). Orders placed before schedule snapshots
 * existed are resolved against the catalogue.
 */
async function h1Register({ vendorId = null, from, to } = {}) {
  const start = from ? new Date(from) : new Date(Date.now() - 30 * DAY);
  const end = to ? new Date(to) : new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) throw new ValidationError('Give a valid from/to date range');
  if (end.getTime() - start.getTime() > 366 * DAY) throw new ValidationError('Export at most one year at a time');

  const h1Ids = (await Medicine.find({ scheduleType: 'SCHEDULE_H1' }).select('_id').lean()).map((m) => m._id);
  const filter = {
    status: 'DELIVERED',
    deliveredAt: { $gte: start, $lt: end },
    $or: [{ 'items.scheduleType': 'SCHEDULE_H1' }, { 'items.medicine': { $in: h1Ids } }]
  };
  if (vendorId) filter.vendor = vendorId;
  const orders = await PharmacyOrder.find(filter)
    .sort({ deliveredAt: 1 })
    .populate('patient', 'name')
    .populate('vendor', 'name drugLicenseNumber')
    .lean();

  const h1Set = new Set(h1Ids.map(String));
  const rows = [];
  for (const o of orders) {
    for (const item of o.items) {
      const isH1 = item.scheduleType === 'SCHEDULE_H1' || h1Set.has(String(item.medicine));
      if (!isH1 || (item.status || 'AVAILABLE') !== 'AVAILABLE') continue;
      const addr = o.deliveryAddress || {};
      rows.push({
        suppliedOn: o.deliveredAt,
        orderNumber: o.orderNumber,
        store: o.vendor ? o.vendor.name : undefined,
        storeLicence: o.vendor ? o.vendor.drugLicenseNumber : undefined,
        patientName: o.patient ? o.patient.name : undefined,
        patientAddress: [addr.line1, addr.line2, addr.city, addr.pincode].filter(Boolean).join(', '),
        prescriberName: o.prescription && o.prescription.prescriber ? o.prescription.prescriber.name : undefined,
        prescriberRegistration: o.prescription && o.prescription.prescriber ? o.prescription.prescriber.registrationNumber : undefined,
        prescriberAddress: o.prescription && o.prescription.prescriber ? o.prescription.prescriber.address : undefined,
        prescribedOn: o.prescription ? o.prescription.prescribedOn : undefined,
        drug: item.name,
        batches: (item.batches || []).map((b) => `${b.batchNumber}×${b.quantity}`).join('; '),
        quantity: item.quantity
      });
    }
  }
  return { from: start, to: end, rows };
}

const csvCell = (v) => {
  if (v === undefined || v === null) return '';
  const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  // Neutralise spreadsheet formulas (CSV injection) and quote safely.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

function h1RegisterCsv(register) {
  const header = ['Supplied on', 'Order', 'Store', 'Store licence', 'Patient', 'Patient address', 'Prescriber', 'Prescriber reg. no.', 'Prescriber address', 'Prescription date', 'Drug', 'Batch × qty', 'Quantity'];
  const lines = register.rows.map((r) => [
    r.suppliedOn, r.orderNumber, r.store, r.storeLicence, r.patientName, r.patientAddress, r.prescriberName,
    r.prescriberRegistration, r.prescriberAddress, r.prescribedOn, r.drug, r.batches, r.quantity
  ].map(csvCell).join(','));
  return [header.join(','), ...lines].join('\r\n');
}

/** Ops review queue: recent orders with risk flags. */
async function listFlaggedOrders({ days = 30, limit = 100 } = {}) {
  const since = new Date(Date.now() - Math.min(Number(days) || 30, 365) * DAY);
  return PharmacyOrder.find({ 'riskFlags.0': { $exists: true }, createdAt: { $gte: since } })
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 100, 500))
    .select('orderNumber patient vendor status riskFlags items.name items.quantity createdAt')
    .populate('patient', 'name phone')
    .populate('vendor', 'name')
    .lean();
}

module.exports = { checkPatientLimits, verifyPrescription, h1Register, h1RegisterCsv, listFlaggedOrders, csvCell };
