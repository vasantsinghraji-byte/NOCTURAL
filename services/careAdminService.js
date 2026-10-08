/**
 * Admin panel queues for the care marketplace (docs/product/ADMIN_AND_ADS_GUIDE.md):
 * overview counts, refunds, reported visits, sessions waiting for the customer,
 * lab orders, the catalog and customer credit. Personal data stays masked.
 */

const crypto = require('crypto');
const CarePlan = require('../models/carePlan');
const CareStore = require('../models/careStore');
const NurseBooking = require('../models/nurseBooking');
const LabOrder = require('../models/labOrder');
const ServiceCatalog = require('../models/serviceCatalog');
const RateCardItem = require('../models/rateCardItem');
const AdCampaign = require('../models/adCampaign');
const { SettingChange } = require('../models/platformSetting');
const walletService = require('./walletService');
const careSlotService = require('./careSlotService');
const { round2 } = require('./pricingService');
const { STORE_KINDS } = require('../constants/marketplace');
const { ValidationError, NotFoundError, ConflictError, PaymentError } = require('../utils/errors');
const logger = require('../utils/logger');

const maskName = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
};

/** Numbers for the admin overview cards. */
async function overview() {
  const todayStart = new Date(`${careSlotService.todayIst()}T00:00:00Z`);
  const [shopsPending, refundsPlans, refundsLabs, reports, needsAction, todaySessions, labLate, labToday, adsPending, settingsPending, offersPending, callbacksOpen] = await Promise.all([
    CareStore.countDocuments({ status: 'PENDING' }),
    CarePlan.countDocuments({ 'refund.status': 'PENDING' }),
    LabOrder.countDocuments({ 'payment.status': 'REFUND_PENDING' }),
    NurseBooking.countDocuments({ flagged: true }),
    NurseBooking.countDocuments({ 'marketplace.plan': { $exists: true }, status: 'REQUESTED', 'dispatch.status': 'NO_STAFF' }),
    NurseBooking.countDocuments({ 'marketplace.plan': { $exists: true }, scheduledDate: todayStart, status: { $ne: 'CANCELLED' } }),
    LabOrder.countDocuments({ status: { $in: ['COLLECTED', 'AT_LAB', 'PROCESSING'] }, reportDueAt: { $lte: new Date() } }),
    LabOrder.countDocuments({ 'slot.date': careSlotService.todayIst(), status: { $ne: 'CANCELLED' } }),
    AdCampaign.countDocuments({ status: 'PENDING_REVIEW' }),
    SettingChange.countDocuments({ status: 'PENDING' }),
    RateCardItem.countDocuments({ 'offer.status': 'PENDING' }),
    require('../models/callbackRequest').countDocuments({ status: 'OPEN' })
  ]);
  return { shopsPending, refundsPending: refundsPlans + refundsLabs, reports, needsAction, todaySessions, labLate, labToday, adsPending, settingsPending, offersPending, callbacksOpen };
}

/** Plans and lab orders with money to give back. */
async function refundQueue() {
  const [plans, labs] = await Promise.all([
    CarePlan.find({ 'refund.status': 'PENDING' }).populate('patient', 'name').populate('store', 'name').sort({ 'refund.requestedAt': 1 }).limit(100).lean(),
    LabOrder.find({ 'payment.status': 'REFUND_PENDING' }).populate('patient', 'name').populate('store', 'name').sort({ updatedAt: 1 }).limit(100).lean()
  ]);
  return [
    ...plans.map((p) => ({ type: 'PLAN', id: p._id, customer: maskName(p.patient && p.patient.name), shop: p.store && p.store.name, amount: p.refund.amount, reason: p.refund.reason, paymentId: p.payment && p.payment.paymentId, since: p.refund.requestedAt })),
    ...labs.map((o) => ({ type: 'LAB', id: o._id, customer: maskName(o.patient && o.patient.name), shop: o.store && o.store.name, amount: o.payment.amount, reason: (o.cancellation && o.cancellation.reason) || 'Cancelled', paymentId: o.payment.paymentId, since: o.updatedAt }))
  ];
}

/**
 * Pay a refund back: through Razorpay when the keys are set and the payment
 * was online, else mark it paid by bank transfer with a reference.
 */
async function processRefund(adminId, { type, id, reference } = {}) {
  const Model = type === 'LAB' ? LabOrder : CarePlan;
  const doc = await Model.findById(id);
  if (!doc) throw new NotFoundError('Refund');
  const pending = type === 'LAB' ? doc.payment.status === 'REFUND_PENDING' : doc.refund.status === 'PENDING';
  if (!pending) throw new ConflictError('This refund is already done');
  const amount = type === 'LAB' ? doc.payment.amount : doc.refund.amount;
  const paymentId = doc.payment && doc.payment.paymentId;
  let refundId = reference ? String(reference).slice(0, 80) : null;
  const keys = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_ENABLED !== 'false';
  if (!refundId) {
    if (!keys || !paymentId || !/^pay_/.test(paymentId)) throw new PaymentError('Enter the bank transfer reference (online refund needs Razorpay and an online payment)');
    const Razorpay = require('razorpay');
    const refund = await new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET })
      .payments.refund(paymentId, { amount: Math.round(amount * 100), notes: { [type === 'LAB' ? 'labOrderId' : 'planId']: String(doc._id) } });
    refundId = refund.id;
  }
  const now = new Date();
  if (type === 'LAB') {
    await LabOrder.updateOne({ _id: doc._id, 'payment.status': 'REFUND_PENDING' }, { $set: { 'payment.status': 'REFUNDED' }, $push: { timeline: { status: 'REFUNDED', at: now, by: 'ADMIN', note: refundId } } });
  } else {
    await CarePlan.updateOne({ _id: doc._id, 'refund.status': 'PENDING' }, { $set: { 'refund.status': 'PROCESSED', 'refund.processedAt': now, 'refund.refundId': refundId } });
  }
  logger.info('Care refund processed', { type, id: String(id), amount, by: String(adminId), refundId });
  return { amount, refundId };
}

/** Visits customers reported (extra cash, no-show) and visits started far from the address. */
async function reportQueue() {
  const rows = await NurseBooking.find({ flagged: true }).populate('patient', 'name').populate('serviceProvider', 'name').sort({ updatedAt: -1 }).limit(100).lean();
  const stores = await CareStore.find({ _id: { $in: rows.map((r) => r.marketplace && r.marketplace.store).filter(Boolean) } }).select('name').lean();
  const storeName = new Map(stores.map((s) => [String(s._id), s.name]));
  return rows.map((r) => ({
    bookingId: r._id,
    reason: r.flagReason,
    status: r.status,
    date: r.scheduledDate,
    time: r.scheduledTime,
    customer: maskName(r.patient && r.patient.name),
    professional: maskName(r.serviceProvider && r.serviceProvider.name),
    shop: r.marketplace && storeName.get(String(r.marketplace.store)),
    amount: r.pricing && r.pricing.payableAmount
  }));
}

/** Sessions a provider released (leave, suspension, can't make it): call the customer. */
async function needsActionQueue() {
  const rows = await NurseBooking.find({ 'marketplace.plan': { $exists: true }, status: 'REQUESTED', 'dispatch.status': 'NO_STAFF' })
    .populate('patient', 'name').sort({ scheduledDate: 1 }).limit(200).lean();
  const stores = await CareStore.find({ _id: { $in: rows.map((r) => r.marketplace.store) } }).select('name').lean();
  const storeName = new Map(stores.map((s) => [String(s._id), s.name]));
  return rows.map((r) => ({
    bookingId: r._id,
    plan: r.marketplace.plan,
    date: r.scheduledDate,
    time: r.scheduledTime,
    customer: maskName(r.patient && r.patient.name),
    shop: storeName.get(String(r.marketplace.store)),
    reason: (r.dispatch.dropped && r.dispatch.dropped.length && r.dispatch.dropped[r.dispatch.dropped.length - 1].reason) || 'Released'
  }));
}

/** Today's (or a day's) marketplace sessions, for the live board. */
async function sessionsBoard(date) {
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : careSlotService.todayIst();
  const rows = await NurseBooking.find({ 'marketplace.plan': { $exists: true }, scheduledDate: new Date(`${day}T00:00:00Z`) })
    .populate('patient', 'name').populate('serviceProvider', 'name').sort({ scheduledTime: 1 }).limit(500).lean();
  return rows.map((r) => ({
    bookingId: r._id,
    time: r.scheduledTime,
    status: r.status,
    mode: r.marketplace.mode,
    service: r.serviceDetails && r.serviceDetails.description,
    customer: maskName(r.patient && r.patient.name),
    professional: maskName(r.serviceProvider && r.serviceProvider.name),
    city: r.serviceLocation && r.serviceLocation.address && r.serviceLocation.address.city,
    flagged: Boolean(r.flagged)
  }));
}

/** Lab orders by status, late reports first. */
async function labBoard({ status, late } = {}) {
  const filter = {};
  if (status) filter.status = status;
  if (late === 'true' || late === true) Object.assign(filter, { status: { $in: ['COLLECTED', 'AT_LAB', 'PROCESSING'] }, reportDueAt: { $lte: new Date() } });
  const rows = await LabOrder.find(filter).populate('patient', 'name').populate('store', 'name').sort({ reportDueAt: 1, createdAt: -1 }).limit(200).lean();
  return rows.map((o) => ({
    id: o._id,
    lab: o.store && o.store.name,
    customer: maskName(o.patient && o.patient.name),
    tests: o.items.map((i) => i.name),
    mode: o.mode,
    slot: o.slot,
    status: o.status,
    reportDueAt: o.reportDueAt,
    late: Boolean(o.reportDueAt && o.reportDueAt < new Date() && !['REPORT_READY', 'CANCELLED'].includes(o.status)),
    total: o.amounts && o.amounts.total,
    payment: o.payment && o.payment.status
  }));
}

// ── Catalog ──────────────────────────────────────────────────────────────

const CATEGORY_FOR_KIND = { PHYSIO: 'PHYSIOTHERAPY', LAB: 'LAB_TEST', NURSING: 'NURSING', HOMECARE: 'HOME_CARE' };

async function catalogList(kind) {
  const filter = kind ? { 'marketplace.kind': kind } : { 'marketplace.kind': { $exists: true } };
  const rows = await ServiceCatalog.find(filter).sort({ 'marketplace.kind': 1, sortOrder: 1, displayName: 1 }).lean();
  const counts = await RateCardItem.aggregate([{ $match: { isActive: true } }, { $group: { _id: '$service', shops: { $sum: 1 }, min: { $min: '$clinic.price' }, minHome: { $min: '$home.price' } } }]);
  const by = new Map(counts.map((c) => [String(c._id), c]));
  return rows.map((s) => ({ ...s, shops: (by.get(String(s._id)) || {}).shops || 0 }));
}

function cleanCatalogInput(input, existing) {
  const kind = String(input.kind || (existing && existing.marketplace && existing.marketplace.kind) || '').toUpperCase();
  if (!STORE_KINDS.includes(kind)) throw new ValidationError('Choose physio, lab, nursing or home care');
  const displayName = String(input.displayName || (existing && existing.displayName) || '').trim().slice(0, 100);
  if (displayName.length < 3) throw new ValidationError('Enter the service name');
  const floor = Number(input.priceFloor);
  const ceiling = Number(input.priceCeiling);
  if (!Number.isFinite(floor) || !Number.isFinite(ceiling) || floor <= 0 || ceiling < floor) throw new ValidationError('Enter a price floor and a ceiling above it');
  const duration = Number(input.defaultDurationMinutes || 45);
  if (!Number.isInteger(duration) || duration < 10 || duration > 1440) throw new ValidationError('Default length must be 10–1440 minutes');
  const out = {
    displayName,
    shortDescription: input.shortDescription ? String(input.shortDescription).slice(0, 240) : undefined,
    subCategory: input.subCategory ? String(input.subCategory).slice(0, 60) : undefined,
    category: input.isPackage && kind === 'LAB' ? 'LAB_PACKAGE' : CATEGORY_FOR_KIND[kind],
    'marketplace.kind': kind,
    'marketplace.priceFloor': floor,
    'marketplace.priceCeiling': ceiling,
    'marketplace.homeAllowed': input.homeAllowed !== false,
    'marketplace.clinicAllowed': kind === 'HOMECARE' ? false : input.clinicAllowed !== false,
    'marketplace.defaultDurationMinutes': duration,
    'marketplace.bookingServiceType': input.bookingServiceType ? String(input.bookingServiceType).slice(0, 40) : undefined,
    'requirements.prescriptionRequired': Boolean(input.prescriptionRequired),
    'availability.isActive': input.isActive !== false,
    sortOrder: Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : undefined
  };
  if (kind === 'LAB') {
    Object.assign(out, {
      'lab.sampleType': input.sampleType ? String(input.sampleType).slice(0, 20) : 'BLOOD',
      'lab.fastingHours': Number(input.fastingHours) > 0 ? Math.min(24, Number(input.fastingHours)) : 0,
      'lab.homeCollectable': input.homeCollectable !== false,
      'lab.defaultReportHours': Number(input.defaultReportHours) > 0 ? Math.min(720, Number(input.defaultReportHours)) : 24,
      'lab.tests': Array.isArray(input.tests) ? input.tests.slice(0, 80) : undefined
    });
  }
  return out;
}

async function catalogCreate(adminId, input = {}) {
  const set = cleanCatalogInput(input);
  const slug = `${set.displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${crypto.randomBytes(2).toString('hex')}`;
  const doc = { name: slug.toUpperCase().replace(/-/g, '_').slice(0, 60), slug, pricing: { basePrice: set['marketplace.priceFloor'] } };
  for (const [k, v] of Object.entries(set)) {
    if (v === undefined) continue;
    const parts = k.split('.');
    let o = doc;
    for (const p of parts.slice(0, -1)) o = (o[p] = o[p] || {});
    o[parts[parts.length - 1]] = v;
  }
  const created = await ServiceCatalog.create(doc);
  logger.info('Catalog service created', { serviceId: String(created._id), by: String(adminId) });
  return created.toObject();
}

async function catalogUpdate(adminId, serviceId, input = {}) {
  const existing = await ServiceCatalog.findById(serviceId).lean();
  if (!existing) throw new NotFoundError('Service');
  const set = Object.fromEntries(Object.entries(cleanCatalogInput({ ...existing.marketplace, ...existing.lab, displayName: existing.displayName, ...input }, existing)).filter(([, v]) => v !== undefined));
  const updated = await ServiceCatalog.findByIdAndUpdate(serviceId, { $set: set }, { returnDocument: 'after' });
  logger.info('Catalog service updated', { serviceId: String(serviceId), by: String(adminId) });
  return updated.toObject();
}

/** Goodwill credit (with a reason) to a customer's Nabz wallet. */
async function giveCredit(adminId, patientId, { amount, reason } = {}) {
  if (!reason || String(reason).trim().length < 5) throw new ValidationError('Say why');
  const value = round2(amount);
  if (!(value > 0) || value > 5000) throw new ValidationError('Credit must be ₹1–₹5,000');
  return { balance: await walletService.credit(patientId, value, { reason: String(reason).slice(0, 200), ref: `admin:${adminId}:${Date.now()}`, by: adminId }) };
}

module.exports = {
  overview,
  refundQueue,
  processRefund,
  reportQueue,
  needsActionQueue,
  sessionsBoard,
  labBoard,
  catalogList,
  catalogCreate,
  catalogUpdate,
  giveCredit,
  maskName
};
