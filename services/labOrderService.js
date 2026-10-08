/**
 * Path labs on the care marketplace: compare labs for a set of tests, book
 * tests from ONE lab (home collection or walk-in), track the sample to the
 * report. See docs/product/PROVIDER_MARKETPLACE_PLAN.md.
 *
 *   compare     labs offering the tests: how many of them, total, collection
 *               fee to the address, slowest report time, NABL badge
 *   quote/book  prices from the lab's rate card (the app's numbers are never
 *               used); a stale price → PRICE_CHANGED with the new bill; fasting
 *               tests only in morning slots; the slot reserved atomically
 *   lab side    collect (customer's 4-digit code), at lab, processing, report
 *               upload → REPORT_READY and the lab is paid; a rejected sample
 *               gives the customer a free re-collection
 *   sweeps      unpaid prepaid orders expire; late reports credit the customer
 */

const crypto = require('crypto');
const LabOrder = require('../models/labOrder');
const CareStore = require('../models/careStore');
const RateCardItem = require('../models/rateCardItem');
const ServiceCatalog = require('../models/serviceCatalog');
const Patient = require('../models/patient');
const { getRevenuePolicy } = require('../config/revenue');
const pricingService = require('./pricingService');
const careSlotService = require('./careSlotService');
const careStoreService = require('./careStoreService');
const walletService = require('./walletService');
const settlementService = require('./settlementService');
const { haversineKm, toLatLng } = require('../utils/geoDistance');
const { reserveAttempt } = require('../utils/attemptGuard');
const { ValidationError, NotFoundError, ConflictError, PaymentError } = require('../utils/errors');
const logger = require('../utils/logger');

const round2 = pricingService.round2;
const HOME_MINUTES = 20; // a home collection visit
const WALKIN_MINUTES = 10;
const FASTING_LAST_TIME = '10:00';

const lazyBooking = () => require('./bookingService');
const notify = (userId, model, title, message, id) => lazyBooking().notifyUser(userId, model, title, message, id).catch(() => undefined);

function coded(Err, message, code, data) {
  const err = new Err(message);
  err.code = code;
  if (data) err.publicDetails = data;
  return err;
}

function cleanAddress(a) {
  const coordinates = toLatLng(a && (a.coordinates || a));
  if (!coordinates) throw new ValidationError('Pin the collection address on the map');
  const street = String((a && (a.street || a.line1)) || '').trim().slice(0, 200);
  if (street.length < 3) throw new ValidationError('Enter the street address');
  if (a.pincode && !/^\d{6}$/.test(String(a.pincode))) throw new ValidationError('Enter a 6-digit pincode');
  return {
    street,
    landmark: a.landmark ? String(a.landmark).slice(0, 120) : undefined,
    city: a.city ? String(a.city).slice(0, 80) : undefined,
    state: a.state ? String(a.state).slice(0, 80) : undefined,
    pincode: a.pincode ? String(a.pincode) : undefined,
    coordinates
  };
}

async function resolveAddress(patientId, input) {
  if (input && input.addressId) {
    const p = await Patient.findById(patientId).select('savedAddresses').lean();
    const saved = p && (p.savedAddresses || []).find((a) => String(a._id) === String(input.addressId));
    if (!saved) throw new NotFoundError('Saved address');
    return cleanAddress(saved);
  }
  return cleanAddress(input && input.address);
}

const uniqueIds = (ids) => [...new Set((Array.isArray(ids) ? ids : []).map(String))].slice(0, 30);

/** Test price at a lab for one mode. */
const priceAt = (item, mode) => (mode === 'HOME' ? (item.home.enabled ? item.home.price : null) : (item.clinic.enabled ? item.clinic.price : null));

/** Collection fee to a point (per order, one trip), waived above the lab's basket value. */
function collectionFee(store, point, testsSubtotal) {
  const km = haversineKm(careStoreService.tripOrigin(store), point);
  if (km > store.home.radiusKm) return null;
  const travel = pricingService.quoteTravel({ straightKm: km, ratePerKm: store.home.ratePerKm });
  const waived = store.home.freeCollectionAbove > 0 && testsSubtotal >= store.home.freeCollectionAbove;
  return { ...travel, waived, charged: waived ? 0 : travel.fee };
}

/**
 * Labs that offer some or all of `serviceIds`, cheapest complete basket first.
 */
async function compareLabs({ serviceIds, lat, lng, mode } = {}) {
  const ids = uniqueIds(serviceIds);
  if (!ids.length) throw new ValidationError('Choose at least one test');
  const services = await ServiceCatalog.find({ _id: { $in: ids }, 'availability.isActive': true }).select('name displayName lab category').lean();
  const items = await RateCardItem.find({ service: { $in: ids }, kind: 'LAB', isActive: true }).lean();
  const storeIds = [...new Set(items.map((i) => String(i.store)))];
  const stores = await CareStore.find({ _id: { $in: storeIds }, kind: 'LAB', status: 'APPROVED', isPaused: false }).lean();
  const live = await careStoreService.liveOwners(stores);
  const point = toLatLng({ lat, lng });
  const nameOf = new Map(services.map((s) => [String(s._id), s.displayName || s.name]));

  const rows = [];
  for (const store of stores) {
    if (!live.has(String(store.owner))) continue;
    const mine = items.filter((i) => String(i.store) === String(store._id));
    const tests = [];
    for (const id of ids) {
      const item = mine.find((i) => String(i.service) === id);
      const p = item && priceAt(item, mode === 'CLINIC' ? 'CLINIC' : (item.home.enabled ? 'HOME' : 'CLINIC'));
      if (item && Number.isFinite(p)) tests.push({ serviceId: id, name: nameOf.get(id), price: p, home: item.home.enabled, reportHours: (item.lab && item.lab.reportHours) || 24 });
    }
    if (!tests.length) continue;
    const missing = ids.filter((id) => !tests.some((t) => t.serviceId === id)).map((id) => ({ serviceId: id, name: nameOf.get(id) }));
    const subtotal = round2(tests.reduce((s, t) => s + t.price, 0));
    const reach = point ? careStoreService.reachFor(store, point) : {};
    const allHome = store.home && store.home.enabled && tests.every((t) => t.home);
    const collection = point && allHome ? collectionFee(store, point, subtotal) : null;
    if (mode === 'HOME' && !collection) continue;
    rows.push({
      store: careStoreService.publicStore(store),
      distanceKm: reach.distanceKm,
      tests,
      missing,
      offersAll: missing.length === 0,
      testsSubtotal: subtotal,
      homeCollection: collection ? { fee: collection.charged, waived: collection.waived, roadKm: collection.roadKm } : null,
      reportHours: Math.max(...tests.map((t) => t.reportHours)),
      accredited: Boolean(store.registration && store.registration.accredited)
    });
  }
  rows.sort((a, b) => Number(b.offersAll) - Number(a.offersAll) || b.tests.length - a.tests.length
    || (a.testsSubtotal + ((a.homeCollection && a.homeCollection.fee) || 0)) - (b.testsSubtotal + ((b.homeCollection && b.homeCollection.fee) || 0)));
  return rows.slice(0, 30);
}

/** A lab's tests (its menu) with "you save" for packages it can price test by test. */
async function labMenu(storeId) {
  const store = await CareStore.findOne({ _id: storeId, kind: 'LAB', status: 'APPROVED' }).lean();
  if (!store) throw new NotFoundError('Lab');
  const items = await RateCardItem.find({ store: store._id, isActive: true })
    .populate('service', 'name displayName category shortDescription lab requirements availability.isActive').lean();
  const live = items.filter((i) => i.service && i.service.availability && i.service.availability.isActive);
  const priceOf = new Map(live.map((i) => [String(i.service._id), priceAt(i, i.clinic.enabled ? 'CLINIC' : 'HOME')]));
  return live.map((i) => {
    const own = priceAt(i, i.clinic.enabled ? 'CLINIC' : 'HOME');
    const parts = (i.service.lab && i.service.lab.tests) || [];
    const partPrices = parts.map((t) => priceOf.get(String(t)));
    const separately = parts.length && partPrices.every(Number.isFinite) ? round2(partPrices.reduce((s, p) => s + p, 0)) : null;
    return {
      _id: i._id,
      service: { _id: i.service._id, name: i.service.displayName || i.service.name, category: i.service.category, shortDescription: i.service.shortDescription, lab: i.service.lab, prescriptionRequired: Boolean(i.service.requirements && i.service.requirements.prescriptionRequired) },
      price: own,
      home: i.home.enabled,
      walkIn: i.clinic.enabled,
      reportHours: (i.lab && i.lab.reportHours) || 24,
      save: separately && separately > own ? round2(separately - own) : 0
    };
  });
}

/** Everything a lab order costs, computed from live data. */
async function buildLabQuote(patientId, input = {}) {
  const mode = input.mode === 'HOME' ? 'HOME' : 'CLINIC';
  const ids = uniqueIds(input.serviceIds);
  if (!ids.length) throw new ValidationError('Choose at least one test');
  const store = await CareStore.findOne({ _id: input.storeId, kind: 'LAB', status: 'APPROVED' });
  if (!store || !(await careStoreService.liveOwners([store])).has(String(store.owner))) throw new NotFoundError('Lab');
  if (store.isPaused) throw coded(ConflictError, 'This lab isn’t taking new bookings right now', 'STORE_PAUSED');
  if (mode === 'HOME' && !store.home.enabled) throw coded(ValidationError, 'This lab doesn’t collect at home', 'MODE_UNAVAILABLE');
  if (mode === 'CLINIC' && !store.clinic.enabled) throw coded(ValidationError, 'This lab only collects at home', 'MODE_UNAVAILABLE');

  const [services, items] = await Promise.all([
    ServiceCatalog.find({ _id: { $in: ids }, 'availability.isActive': true }).lean(),
    RateCardItem.find({ store: store._id, service: { $in: ids }, isActive: true }).lean()
  ]);
  const lines = [];
  const missing = [];
  for (const id of ids) {
    const service = services.find((s) => String(s._id) === id);
    const item = items.find((i) => String(i.service) === id);
    const price = item && priceAt(item, mode);
    if (!service || !item || !Number.isFinite(price)) {
      missing.push({ serviceId: id, name: service ? service.displayName || service.name : 'A test' });
      continue;
    }
    if (mode === 'HOME' && service.lab && service.lab.homeCollectable === false) {
      missing.push({ serviceId: id, name: service.displayName || service.name, reason: 'Lab visit only' });
      continue;
    }
    lines.push({
      rateCardItem: item._id,
      service: service._id,
      name: service.displayName || service.name,
      price,
      sampleType: service.lab && service.lab.sampleType,
      fastingHours: (service.lab && service.lab.fastingHours) || 0,
      reportHours: (item.lab && item.lab.reportHours) || (service.lab && service.lab.defaultReportHours) || 24,
      prescriptionRequired: Boolean(service.requirements && service.requirements.prescriptionRequired)
    });
  }
  if (missing.length) {
    throw coded(ValidationError, `${store.name} can’t do ${missing.map((m) => m.name).join(', ')}${mode === 'HOME' ? ' at home' : ''}. Remove ${missing.length > 1 ? 'them' : 'it'} or choose another lab.`, 'TESTS_UNAVAILABLE', { missing });
  }

  // When: fasting tests only in the morning; the lab's hours, leave and lead time.
  const slot = { date: String((input.slot && input.slot.date) || ''), time: String((input.slot && input.slot.time) || '') };
  const fasting = lines.some((l) => l.fastingHours > 0);
  if (fasting && slot.time > FASTING_LAST_TIME) {
    throw coded(ValidationError, `These tests need fasting (${Math.max(...lines.map((l) => l.fastingHours))} hours). Choose a collection time by ${FASTING_LAST_TIME}.`, 'FASTING_MORNING');
  }
  const minutes = mode === 'HOME' ? HOME_MINUTES : WALKIN_MINUTES;
  const problem = careSlotService.bookabilityProblem(store, mode, slot.date, slot.time, minutes);
  if (problem) throw coded(ValidationError, problem, 'SCHEDULE_UNAVAILABLE');
  if (lines.some((l) => l.prescriptionRequired) && !input.prescriptionKey) {
    throw coded(ValidationError, `Upload the doctor’s prescription for ${lines.filter((l) => l.prescriptionRequired).map((l) => l.name).join(', ')}`, 'PRESCRIPTION_REQUIRED');
  }

  const testsSubtotal = round2(lines.reduce((s, l) => s + l.price, 0));
  let address;
  let collection = { fee: 0, charged: 0, waived: false };
  if (mode === 'HOME') {
    address = await resolveAddress(patientId, input);
    const fee = collectionFee(store, address.coordinates, testsSubtotal);
    if (!fee) throw coded(ValidationError, `This address is outside ${store.name}’s home-collection area (${store.home.radiusKm} km)`, 'OUT_OF_RANGE');
    collection = fee;
  }
  const policy = getRevenuePolicy();
  const feeP = Math.round(testsSubtotal * 100 * policy.care.lab.customerFeeRate);
  const taxableP = policy.gstHealthcareExempt ? feeP : Math.round(testsSubtotal * 100) + Math.round(collection.charged * 100) + feeP;
  const gstP = Math.round(taxableP * policy.gstRate);
  const total = round2((Math.round(testsSubtotal * 100) + Math.round(collection.charged * 100) + feeP + gstP) / 100);
  return {
    store,
    mode,
    slot,
    lines,
    address,
    fasting,
    amounts: {
      testsSubtotal,
      collectionFee: round2(collection.fee),
      collectionWaived: collection.waived,
      platformFee: feeP / 100,
      gst: gstP / 100,
      total
    },
    creditAvailable: await walletService.balance(patientId),
    reportHours: Math.max(...lines.map((l) => l.reportHours))
  };
}

const publicLabQuote = (q) => ({
  store: careStoreService.publicStore(q.store.toObject ? q.store.toObject() : q.store),
  mode: q.mode,
  slot: q.slot,
  tests: q.lines.map(({ rateCardItem: _item, ...rest }) => rest),
  address: q.address,
  fasting: q.fasting,
  amounts: q.amounts,
  creditAvailable: q.creditAvailable,
  reportHours: q.reportHours
});

async function quoteLabOrder(patientId, input) {
  return publicLabQuote(await buildLabQuote(patientId, input));
}

const dedupeKeyFor = (patientId, storeId, slot, pd) => `${patientId}|${storeId}|${slot.date}|${slot.time}|${String((pd && pd.name) || '').trim().toLowerCase()}`;

/**
 * Book a lab order. `expectedTotal` is the total the customer saw; if prices
 * moved since, nothing is booked and the new bill comes back (PRICE_CHANGED).
 */
async function bookLabOrder(patientId, input = {}) {
  const q = await buildLabQuote(patientId, input);
  if (Number.isFinite(Number(input.expectedTotal)) && round2(input.expectedTotal) !== q.amounts.total) {
    throw coded(ConflictError, `The price changed from ₹${round2(input.expectedTotal)} to ₹${q.amounts.total}. Please confirm the new price.`, 'PRICE_CHANGED', { quote: publicLabQuote(q) });
  }
  const pd = input.patientDetails && input.patientDetails.name ? {
    name: String(input.patientDetails.name).slice(0, 120),
    age: Number.isFinite(Number(input.patientDetails.age)) ? Number(input.patientDetails.age) : undefined,
    gender: ['Male', 'Female', 'Other'].includes(input.patientDetails.gender) ? input.patientDetails.gender : undefined,
    relation: input.patientDetails.relation ? String(input.patientDetails.relation).slice(0, 40) : undefined
  } : undefined;
  const dedupeKey = dedupeKeyFor(patientId, q.store._id, q.slot, pd);
  if (await LabOrder.exists({ dedupeKey })) throw coded(ConflictError, 'You already have this collection booked. Check My lab tests.', 'DUPLICATE_ORDER');

  const _id = new (require('mongoose').Types.ObjectId)();
  const minutes = q.mode === 'HOME' ? HOME_MINUTES : WALKIN_MINUTES;
  const slotKeys = await careSlotService.reserve(q.store, q.mode, q.slot.date, q.slot.time, minutes, _id);
  const prepaid = input.paymentMode === 'PREPAID';
  try {
    let order = await LabOrder.create({
      _id,
      dedupeKey,
      patient: patientId,
      store: q.store._id,
      items: q.lines.map(({ prescriptionRequired: _rx, ...rest }) => rest),
      mode: q.mode,
      slot: q.slot,
      slotKeys,
      address: q.address,
      patientDetails: pd,
      prescriptionKey: input.prescriptionKey ? String(input.prescriptionKey).slice(0, 300) : undefined,
      amounts: { ...q.amounts },
      payment: {
        mode: prepaid ? 'PREPAID' : 'PAY_AT_COLLECTION',
        status: 'PENDING',
        amount: q.amounts.total,
        holdUntil: prepaid ? new Date(Date.now() + getRevenuePolicy().care.plan.paymentHoldMinutes * 60000) : undefined
      },
      collectionOtp: { code: String(crypto.randomInt(0, 10000)).padStart(4, '0') },
      timeline: [{ status: 'SCHEDULED', by: 'CUSTOMER' }]
    });
    // Nabz credit pays first.
    const credit = await walletService.spend(patientId, q.amounts.total, `lab:${order._id}`);
    if (credit > 0) {
      const remaining = round2(q.amounts.total - credit);
      order = await LabOrder.findByIdAndUpdate(order._id, {
        $set: { 'amounts.credit': credit, 'payment.amount': remaining, ...(remaining === 0 ? { 'payment.status': 'PAID', 'payment.paidAt': new Date() } : {}) }
      }, { returnDocument: 'after' });
    }
    const store = q.store;
    notify(store.owner, 'User', 'New lab booking', `${q.lines.length} test${q.lines.length > 1 ? 's' : ''}, ${q.mode === 'HOME' ? 'home collection' : 'walk-in'} on ${q.slot.date} at ${q.slot.time}.`, order._id);
    logger.info('Lab order booked', { labOrderId: String(order._id), storeId: String(store._id), tests: q.lines.length, mode: q.mode });
    return getMyLabOrder(patientId, order._id);
  } catch (err) {
    await careSlotService.release(slotKeys, _id);
    await LabOrder.deleteOne({ _id });
    if (err && err.code === 11000) throw coded(ConflictError, 'You already have this collection booked. Check My lab tests.', 'DUPLICATE_ORDER');
    throw err;
  }
}

function publicOrder(o, { forCustomer = false } = {}) {
  return {
    _id: o._id,
    store: o.store,
    items: o.items,
    mode: o.mode,
    slot: o.slot,
    address: o.address,
    patientDetails: o.patientDetails,
    amounts: o.amounts,
    payment: o.payment && { mode: o.payment.mode, status: o.payment.status, amount: o.payment.amount, method: o.payment.method, holdUntil: o.payment.holdUntil },
    status: o.status,
    collectedAt: o.collectedAt,
    reportDueAt: o.reportDueAt,
    reportReady: Boolean(o.report && o.report.uploadedAt),
    rejection: o.rejection,
    recollectionOf: o.recollectionOf,
    lateCredit: o.lateCredit,
    timeline: o.timeline,
    createdAt: o.createdAt,
    // Shown to the customer only, to give the phlebotomist at collection.
    ...(forCustomer && o.collectionOtp && o.collectionOtp.code && o.status === 'SCHEDULED' ? { collectionCode: o.collectionOtp.code } : {})
  };
}

async function getMyLabOrder(patientId, orderId) {
  const o = await LabOrder.findOne({ _id: orderId, patient: patientId }).select('+collectionOtp.code').lean();
  if (!o) throw new NotFoundError('Lab order');
  const store = await CareStore.findById(o.store).lean();
  return { ...publicOrder(o, { forCustomer: true }), store: store ? careStoreService.publicStore(store) : null };
}

async function listMyLabOrders(patientId) {
  const orders = await LabOrder.find({ patient: patientId }).sort({ createdAt: -1 }).limit(50).lean();
  const stores = await CareStore.find({ _id: { $in: orders.map((o) => o.store) } }).lean();
  const byId = new Map(stores.map((s) => [String(s._id), careStoreService.publicStore(s)]));
  return orders.map((o) => ({ ...publicOrder(o), store: byId.get(String(o.store)) || null }));
}

/** Customer cancels before collection: free; prepaid money and credit come back. */
async function cancelLabOrder(patientId, orderId, reason = 'Customer cancelled') {
  const now = new Date();
  const order = await LabOrder.findOneAndUpdate(
    { _id: orderId, patient: patientId, status: 'SCHEDULED' },
    {
      $set: { status: 'CANCELLED', cancellation: { by: 'CUSTOMER', reason: String(reason).slice(0, 200), at: now } },
      $unset: { dedupeKey: 1 },
      $push: { timeline: { status: 'CANCELLED', at: now, by: 'CUSTOMER' } }
    },
    { returnDocument: 'after' }
  );
  if (!order) {
    const exists = await LabOrder.exists({ _id: orderId, patient: patientId });
    if (!exists) throw new NotFoundError('Lab order');
    throw coded(ConflictError, 'The sample is already collected, so this can’t be cancelled. Contact support if something is wrong.', 'NOT_CANCELLABLE');
  }
  await careSlotService.release(order.slotKeys, order._id);
  await walletService.reverse(patientId, `lab:${order._id}`);
  if (order.payment.mode === 'PREPAID' && order.payment.status === 'PAID' && order.payment.amount > 0) {
    await LabOrder.updateOne({ _id: order._id }, { $set: { 'payment.status': 'REFUND_PENDING' } });
  }
  const store = await CareStore.findById(order.store).select('owner').lean();
  if (store) notify(store.owner, 'User', 'Lab booking cancelled', `The ${order.slot.date} ${order.slot.time} collection was cancelled.`, order._id);
  return getMyLabOrder(patientId, order._id);
}

/** Move the collection before it happens. */
async function rescheduleLabOrder(patientId, orderId, { date, time } = {}) {
  const order = await LabOrder.findOne({ _id: orderId, patient: patientId });
  if (!order) throw new NotFoundError('Lab order');
  if (order.status !== 'SCHEDULED') throw coded(ConflictError, 'Only a collection that hasn’t happened can be moved', 'NOT_MOVABLE');
  const store = await CareStore.findById(order.store);
  if (!store || store.status !== 'APPROVED') throw coded(ConflictError, 'This lab is no longer taking bookings', 'STORE_UNAVAILABLE');
  if (order.items.some((i) => i.fastingHours > 0) && time > FASTING_LAST_TIME) throw coded(ValidationError, `Fasting tests: choose a time by ${FASTING_LAST_TIME}`, 'FASTING_MORNING');
  const minutes = order.mode === 'HOME' ? HOME_MINUTES : WALKIN_MINUTES;
  const problem = careSlotService.bookabilityProblem(store, order.mode, date, time, minutes);
  if (problem) throw coded(ValidationError, problem, 'SCHEDULE_UNAVAILABLE');
  const keys = await careSlotService.reserve(store, order.mode, date, time, minutes, order._id, { alreadyHeld: order.slotKeys });
  const updated = await LabOrder.findOneAndUpdate(
    { _id: order._id, status: 'SCHEDULED', 'slot.date': order.slot.date, 'slot.time': order.slot.time },
    { $set: { slot: { date, time }, slotKeys: keys, dedupeKey: dedupeKeyFor(patientId, order.store, { date, time }, order.patientDetails) } },
    { returnDocument: 'after' }
  ).catch((err) => {
    if (err && err.code === 11000) throw coded(ConflictError, 'You already have a collection at that time', 'DUPLICATE_ORDER');
    throw err;
  });
  if (!updated) {
    await careSlotService.release(keys.filter((k) => !order.slotKeys.includes(k)), order._id);
    throw coded(ConflictError, 'This booking just changed. Refresh and try again.', 'CHANGED');
  }
  await careSlotService.release(order.slotKeys.filter((k) => !keys.includes(k)), order._id);
  notify(store.owner, 'User', 'Collection moved', `A collection moved to ${date} at ${time}.`, order._id);
  return getMyLabOrder(patientId, order._id);
}

/** Customer picks a time for the free re-collection after a rejected sample. */
async function bookRecollection(patientId, orderId, { date, time } = {}) {
  const original = await LabOrder.findOne({ _id: orderId, patient: patientId, status: 'SAMPLE_REJECTED' });
  if (!original) throw new NotFoundError('Rejected sample');
  if (original.rejection && original.rejection.recollectionOrder) return getMyLabOrder(patientId, original.rejection.recollectionOrder);
  const store = await CareStore.findById(original.store);
  if (!store || store.status !== 'APPROVED') throw coded(ConflictError, 'This lab is no longer taking bookings. A refund will be arranged.', 'STORE_UNAVAILABLE');
  if (original.items.some((i) => i.fastingHours > 0) && time > FASTING_LAST_TIME) throw coded(ValidationError, `Fasting tests: choose a time by ${FASTING_LAST_TIME}`, 'FASTING_MORNING');
  const minutes = original.mode === 'HOME' ? HOME_MINUTES : WALKIN_MINUTES;
  const problem = careSlotService.bookabilityProblem(store, original.mode, date, time, minutes);
  if (problem) throw coded(ValidationError, problem, 'SCHEDULE_UNAVAILABLE');
  const _id = new (require('mongoose').Types.ObjectId)();
  const slotKeys = await careSlotService.reserve(store, original.mode, date, time, minutes, _id);
  try {
    const order = await LabOrder.create({
      _id,
      patient: patientId,
      store: original.store,
      items: original.items,
      mode: original.mode,
      slot: { date, time },
      slotKeys,
      address: original.address,
      patientDetails: original.patientDetails,
      amounts: { testsSubtotal: 0, collectionFee: 0, collectionWaived: true, platformFee: 0, gst: 0, total: 0 },
      payment: { mode: 'PAY_AT_COLLECTION', status: 'PAID', amount: 0, paidAt: new Date() },
      collectionOtp: { code: String(crypto.randomInt(0, 10000)).padStart(4, '0') },
      recollectionOf: original._id,
      timeline: [{ status: 'SCHEDULED', by: 'CUSTOMER', note: 'Free re-collection' }]
    });
    await LabOrder.updateOne({ _id: original._id }, { $set: { 'rejection.recollectionOrder': order._id } });
    notify(store.owner, 'User', 'Re-collection booked', `Free re-collection on ${date} at ${time}.`, order._id);
    return getMyLabOrder(patientId, order._id);
  } catch (err) {
    await careSlotService.release(slotKeys, _id);
    throw err;
  }
}

/** Customer opens the report: a short-lived link, logged. */
async function reportLink(patientId, orderId) {
  const order = await LabOrder.findOne({ _id: orderId, patient: patientId }).select('+report.key').lean();
  if (!order) throw new NotFoundError('Lab order');
  if (!order.report || !order.report.key) throw coded(ConflictError, 'The report isn’t ready yet', 'REPORT_NOT_READY');
  const storageConfig = require('../config/storage');
  logger.info('Lab report opened', { labOrderId: String(orderId), patientId: String(patientId) });
  if (storageConfig.USE_CLOUD) {
    const url = await storageConfig.getSignedUrl(order.report.key, 300);
    if (!url) throw new NotFoundError('Report file');
    return { url, mimeType: order.report.mimeType, expiresInSeconds: 300 };
  }
  // Local development only. resolveLocalFile keeps the path inside uploads/.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const data = await require('fs').promises.readFile(storageConfig.resolveLocalFile(order.report.key));
  return { url: `data:${order.report.mimeType};base64,${data.toString('base64')}`, mimeType: order.report.mimeType, expiresInSeconds: 0 };
}

// ── Lab side ─────────────────────────────────────────────────────────────

async function myLab(user) {
  const userId = user._id || user.id;
  const store = await CareStore.findOne({ kind: 'LAB', $or: [{ owner: userId }, { 'members.user': userId, 'members.active': true }] });
  if (!store) throw new NotFoundError('Lab (set up your lab first)');
  return store;
}

async function listLabOrdersForLab(user, { date, status } = {}) {
  const store = await myLab(user);
  const filter = { store: store._id };
  if (date) filter['slot.date'] = date;
  if (status) filter.status = status;
  const orders = await LabOrder.find(filter).sort({ 'slot.date': 1, 'slot.time': 1 }).limit(200).lean();
  return orders.map((o) => ({ ...publicOrder(o), store: undefined }));
}

async function labOrderForLab(user, orderId, select = '') {
  const store = await myLab(user);
  const order = await LabOrder.findOne({ _id: orderId, store: store._id }).select(select);
  if (!order) throw new NotFoundError('Lab order');
  return { store, order };
}

const TRANSITIONS = { COLLECTED: ['SCHEDULED'], AT_LAB: ['COLLECTED'], PROCESSING: ['COLLECTED', 'AT_LAB'] };

/**
 * Sample collected. Home: the customer's 4-digit code (5 tries, parallel-safe).
 * Pay at collection: the cash/UPI taken is recorded.
 */
async function markCollected(user, orderId, { code, paidAmount, method } = {}) {
  const { order } = await labOrderForLab(user, orderId, '+collectionOtp.code');
  if (order.status !== 'SCHEDULED') throw coded(ConflictError, 'This sample is already collected or closed', 'BAD_STATE');
  if (order.mode === 'HOME') {
    if (!(await reserveAttempt(LabOrder, { _id: order._id, 'collectionOtp.verifiedAt': null }, 'collectionOtp.failedAttempts', 5))) {
      logger.logSecurity && logger.logSecurity('lab_collection_code_locked', { labOrderId: String(order._id) });
      throw new ValidationError('Too many wrong codes. Ask support to confirm this collection.');
    }
    const given = String(code || '').replace(/\D/g, '');
    if (given.length !== 4 || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(order.collectionOtp.code))) {
      throw new ValidationError('That code is not right. Ask the customer for the 4-digit collection code.');
    }
  }
  const now = new Date();
  const reportHours = Math.max(...order.items.map((i) => i.reportHours || 24));
  const set = {
    status: 'COLLECTED',
    collectedAt: now,
    reportDueAt: new Date(now.getTime() + reportHours * 3600000),
    phlebotomist: user._id || user.id,
    'collectionOtp.verifiedAt': now
  };
  if (order.payment.status === 'PENDING' && order.payment.mode === 'PAY_AT_COLLECTION' && order.payment.amount > 0) {
    const paid = Number(paidAmount);
    if (!Number.isFinite(paid) || paid < 0) throw new ValidationError('Enter the amount collected from the customer');
    Object.assign(set, {
      'payment.status': 'PAID', 'payment.method': ['CASH', 'UPI'].includes(method) ? method : 'CASH',
      'payment.paidAt': now, 'payment.collectedBy': user._id || user.id
    });
  }
  if (order.payment.mode === 'PREPAID' && order.payment.status !== 'PAID') throw coded(ConflictError, 'This order isn’t paid yet', 'NOT_PAID');
  const updated = await LabOrder.findOneAndUpdate({ _id: order._id, status: 'SCHEDULED' }, { $set: set, $push: { timeline: { status: 'COLLECTED', at: now, by: 'LAB' } } }, { returnDocument: 'after' });
  if (!updated) throw coded(ConflictError, 'This order just changed', 'CHANGED');
  await careSlotService.release(order.slotKeys, order._id);
  notify(order.patient, 'Patient', 'Sample collected', `Your report is due by ${updated.reportDueAt.toISOString().slice(0, 16).replace('T', ' ')} UTC.`, order._id);
  return publicOrder(updated.toObject());
}

async function advance(user, orderId, status) {
  if (!TRANSITIONS[status] || status === 'COLLECTED') throw new ValidationError('Unknown step');
  const { order } = await labOrderForLab(user, orderId);
  const updated = await LabOrder.findOneAndUpdate(
    { _id: order._id, status: { $in: TRANSITIONS[status] } },
    { $set: { status }, $push: { timeline: { status, at: new Date(), by: 'LAB' } } },
    { returnDocument: 'after' }
  );
  if (!updated) throw coded(ConflictError, `Can’t move from ${order.status} to ${status}`, 'BAD_STATE');
  return publicOrder(updated.toObject());
}

/** Report uploaded: REPORT_READY, the customer is told, the lab is paid. */
async function uploadReport(user, orderId, storedFile) {
  if (!storedFile || !storedFile.key) throw new ValidationError('Attach the report (PDF or image)');
  const { store, order } = await labOrderForLab(user, orderId);
  const now = new Date();
  const updated = await LabOrder.findOneAndUpdate(
    { _id: order._id, status: { $in: ['COLLECTED', 'AT_LAB', 'PROCESSING', 'REPORT_READY'] } },
    {
      $set: {
        status: 'REPORT_READY',
        report: { key: storedFile.key, mimeType: storedFile.mimeType, fileName: String(storedFile.originalName || 'report').slice(0, 120), uploadedAt: now, uploadedBy: user._id || user.id }
      },
      $push: { timeline: { status: 'REPORT_READY', at: now, by: 'LAB' } }
    },
    { returnDocument: 'after' }
  );
  if (!updated) throw coded(ConflictError, 'Collect the sample before uploading a report', 'BAD_STATE');
  if (!updated.settledAt) {
    await settlementService.recordLabOrder(updated, store.owner);
    await LabOrder.updateOne({ _id: updated._id }, { $set: { settledAt: now } });
  }
  notify(order.patient, 'Patient', 'Your report is ready', `Your ${order.items.map((i) => i.name).slice(0, 2).join(', ')} report is ready in the app.`, order._id);
  return publicOrder(updated.toObject());
}

/** Sample unusable: the customer gets a free re-collection (they pick the time). */
async function rejectSample(user, orderId, reason) {
  const { order } = await labOrderForLab(user, orderId);
  const now = new Date();
  const updated = await LabOrder.findOneAndUpdate(
    { _id: order._id, status: { $in: ['COLLECTED', 'AT_LAB', 'PROCESSING'] } },
    { $set: { status: 'SAMPLE_REJECTED', rejection: { reason: String(reason || 'Sample could not be tested').slice(0, 200), at: now } }, $push: { timeline: { status: 'SAMPLE_REJECTED', at: now, by: 'LAB', note: String(reason || '').slice(0, 120) } } },
    { returnDocument: 'after' }
  );
  if (!updated) throw coded(ConflictError, 'Only a collected sample can be rejected', 'BAD_STATE');
  notify(order.patient, 'Patient', 'We need a new sample', `${updated.rejection.reason}. Pick a time for a free re-collection.`, order._id);
  return publicOrder(updated.toObject());
}

// ── Prepaid payment (Razorpay, same flow as care plans) ──────────────────

function razorpayConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret || process.env.RAZORPAY_ENABLED === 'false') return null;
  return { keyId, keySecret };
}

async function createPaymentOrder(patientId, orderId) {
  const order = await LabOrder.findOne({ _id: orderId, patient: patientId });
  if (!order) throw new NotFoundError('Lab order');
  if (order.payment.mode !== 'PREPAID' || order.payment.status !== 'PENDING' || order.status !== 'SCHEDULED') {
    throw coded(ConflictError, order.payment.status === 'PAID' ? 'This booking is already paid' : 'This booking can’t be paid now', 'NOT_PAYABLE');
  }
  const cfg = razorpayConfig();
  if (!cfg) throw new PaymentError('Online payment isn’t available yet. Choose “Pay at collection”.');
  const Razorpay = require('razorpay');
  const client = new Razorpay({ key_id: cfg.keyId, key_secret: cfg.keySecret });
  const gateway = await client.orders.create({
    amount: Math.round(order.payment.amount * 100),
    currency: 'INR',
    receipt: `lab_${order._id}`.slice(0, 40),
    notes: { labOrderId: String(order._id) }
  });
  await LabOrder.updateOne({ _id: order._id, 'payment.status': 'PENDING' }, { $set: { 'payment.orderId': gateway.id } });
  return { orderId: gateway.id, amount: order.payment.amount, currency: 'INR', keyId: cfg.keyId };
}

/** Mark paid after the signature check. Paid after the hold ran out → full refund. */
async function markLabOrderPaid(id, { orderId, paymentId }) {
  const now = new Date();
  const paid = await LabOrder.findOneAndUpdate(
    { _id: id, status: 'SCHEDULED', 'payment.status': 'PENDING' },
    { $set: { 'payment.status': 'PAID', 'payment.method': 'ONLINE', 'payment.paidAt': now, 'payment.orderId': orderId, 'payment.paymentId': paymentId } },
    { returnDocument: 'after' }
  );
  if (paid) return paid;
  const late = await LabOrder.findById(id);
  if (late && late.payment.status === 'PENDING' && late.status === 'CANCELLED') {
    await LabOrder.updateOne({ _id: late._id, 'payment.status': 'PENDING' }, {
      $set: { 'payment.status': 'REFUND_PENDING', 'payment.method': 'ONLINE', 'payment.paidAt': now, 'payment.orderId': orderId, 'payment.paymentId': paymentId }
    });
    logger.warn('Lab order paid after hold expired; full refund queued', { labOrderId: String(id) });
    throw coded(ConflictError, 'Your payment came after the booking hold expired. A full refund is on its way.', 'PAID_TOO_LATE');
  }
  if (late && late.payment.status === 'PAID') return late;
  throw new NotFoundError('Lab order');
}

async function verifyPayment(patientId, id, { orderId, paymentId, signature } = {}) {
  const order = await LabOrder.findOne({ _id: id, patient: patientId }).select('_id payment').lean();
  if (!order) throw new NotFoundError('Lab order');
  const cfg = razorpayConfig();
  if (!cfg) throw new PaymentError('Online payment isn’t available yet');
  if (!orderId || orderId !== order.payment.orderId) throw new PaymentError('This payment isn’t for this booking');
  const expected = crypto.createHmac('sha256', cfg.keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  const given = String(signature || '');
  if (given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    if (logger.logSecurity) logger.logSecurity('lab_order_payment_signature_invalid', { labOrderId: String(id) });
    throw new PaymentError('Payment could not be verified');
  }
  await markLabOrderPaid(order._id, { orderId, paymentId });
  return getMyLabOrder(patientId, order._id);
}

// ── Sweeps ───────────────────────────────────────────────────────────────

async function expireUnpaid(now = new Date()) {
  const due = await LabOrder.find({ status: 'SCHEDULED', 'payment.mode': 'PREPAID', 'payment.status': 'PENDING', 'payment.holdUntil': { $lte: now } }).limit(100);
  let n = 0;
  for (const o of due) {
    const res = await LabOrder.updateOne({ _id: o._id, status: 'SCHEDULED', 'payment.status': 'PENDING' }, {
      $set: { status: 'CANCELLED', cancellation: { by: 'SYSTEM', reason: 'Not paid in time', at: now } },
      $unset: { dedupeKey: 1 },
      $push: { timeline: { status: 'CANCELLED', at: now, by: 'SYSTEM' } }
    });
    if (res.modifiedCount) {
      await careSlotService.release(o.slotKeys, o._id);
      await walletService.reverse(o.patient, `lab:${o._id}`);
      n += 1;
    }
  }
  return n;
}

/** Reports later than promised: credit the customer once. */
async function creditLateReports(now = new Date()) {
  const policy = getRevenuePolicy().care.lab;
  const late = await LabOrder.find({ status: { $in: ['COLLECTED', 'AT_LAB', 'PROCESSING'] }, reportDueAt: { $lte: now }, 'lateCredit.at': { $exists: false } }).limit(100);
  let n = 0;
  for (const o of late) {
    const amount = round2(Math.min(policy.lateReportCreditMax, Math.max(policy.lateReportCreditMin, (o.amounts.testsSubtotal || 0) * policy.lateReportCreditRate)));
    if (!(amount > 0) || o.recollectionOf) continue;
    const res = await LabOrder.updateOne({ _id: o._id, 'lateCredit.at': { $exists: false } }, { $set: { lateCredit: { amount, at: now } } });
    if (!res.modifiedCount) continue;
    await walletService.credit(o.patient, amount, { reason: 'Lab report later than promised', ref: `latereport:${o._id}` });
    notify(o.patient, 'Patient', 'Sorry, your report is late', `We’ve added ₹${amount} Nabz credit. Your report is on its way.`, o._id);
    n += 1;
  }
  return n;
}

async function sweep(now = new Date()) {
  return { unpaid: await expireUnpaid(now), lateCredits: await creditLateReports(now) };
}

module.exports = {
  compareLabs,
  labMenu,
  quoteLabOrder,
  bookLabOrder,
  getMyLabOrder,
  listMyLabOrders,
  cancelLabOrder,
  rescheduleLabOrder,
  bookRecollection,
  reportLink,
  createPaymentOrder,
  markLabOrderPaid,
  verifyPayment,
  listLabOrdersForLab,
  markCollected,
  advance,
  uploadReport,
  rejectSample,
  expireUnpaid,
  creditLateReports,
  sweep,
  myLab
};
