/**
 * Care marketplace plans: quote → book N sessions with one shop → pay (upfront
 * or per session) → sessions run as ordinary visits → plan settles.
 * See docs/product/PROVIDER_MARKETPLACE_PLAN.md.
 *
 *   quote      the full bill, locked for a few minutes (CareQuote)
 *   book       single use of the quote; prices re-checked against the live rate
 *              card; every session's slots reserved atomically (all or nothing);
 *              sessions created CONFIRMED with the shop's professional
 *   prepaid    slots held until paid (sweeper frees them); paid → ACTIVE, and the
 *              professional is paid per completed session via settlement
 *   settle     when no session is left open: COMPLETED/CANCELLED and, for prepaid
 *              plans, refund = paid − completed sessions at the list price
 *              (at the discounted price when the provider let the plan down)
 *
 * Sessions are NurseBooking documents with `marketplace` set; bookingService
 * calls back here when one is cancelled, completed or released.
 */

const crypto = require('crypto');
const mongoose = require('mongoose');
const CarePlan = require('../models/carePlan');
const CareQuote = require('../models/careQuote');
const CareStore = require('../models/careStore');
const RateCardItem = require('../models/rateCardItem');
const ServiceCatalog = require('../models/serviceCatalog');
const NurseBooking = require('../models/nurseBooking');
const Patient = require('../models/patient');
const SlotReservation = require('../models/slotReservation');
const { getRevenuePolicy } = require('../config/revenue');
const pricingService = require('./pricingService');
const careSlotService = require('./careSlotService');
const careStoreService = require('./careStoreService');
const membershipService = require('./membershipService');
const walletService = require('./walletService');
const PlanProposal = require('../models/planProposal');
const visitPolicy = require('./careVisitPolicy');
const { haversineKm, toLatLng } = require('../utils/geoDistance');
const { BOOKING_SERVICE_TYPES } = require('../constants/enums');
const { ValidationError, NotFoundError, ConflictError, AuthorizationError, PaymentError } = require('../utils/errors');
const logger = require('../utils/logger');

const lazyBooking = () => require('./bookingService');

const OPEN = ['REQUESTED', 'ASSIGNED', 'CONFIRMED', 'EN_ROUTE', 'IN_PROGRESS'];
const MOVABLE = ['REQUESTED', 'ASSIGNED', 'CONFIRMED'];
const round2 = pricingService.round2;

/** A ConflictError the apps can act on (code + data). */
function conflict(message, code, data) {
  const err = new ConflictError(message);
  err.code = code;
  if (data) err.publicDetails = data;
  return err;
}

function badRequest(message, code, data) {
  const err = new ValidationError(message);
  err.code = code;
  if (data) err.publicDetails = data;
  return err;
}

function cleanAddress(a) {
  if (!a || typeof a !== 'object') throw new ValidationError('Choose the visit address');
  const coordinates = toLatLng(a.coordinates || a);
  if (!coordinates) throw new ValidationError('Pin the visit address on the map');
  const street = String(a.street || a.line1 || '').trim().slice(0, 200);
  if (street.length < 3) throw new ValidationError('Enter the street address');
  if (a.pincode && !/^\d{6}$/.test(String(a.pincode))) throw new ValidationError('Enter a 6-digit pincode');
  return {
    label: a.label ? String(a.label).trim().slice(0, 40) : undefined,
    street,
    landmark: a.landmark ? String(a.landmark).trim().slice(0, 120) : undefined,
    city: a.city ? String(a.city).trim().slice(0, 80) : undefined,
    state: a.state ? String(a.state).trim().slice(0, 80) : undefined,
    pincode: a.pincode ? String(a.pincode) : undefined,
    coordinates
  };
}

function cleanPatientDetails(pd) {
  if (!pd || !pd.name) return undefined;
  const age = Number(pd.age);
  return {
    name: String(pd.name).trim().slice(0, 120),
    age: Number.isFinite(age) && age >= 0 && age <= 150 ? age : undefined,
    gender: ['Male', 'Female', 'Other'].includes(pd.gender) ? pd.gender : undefined,
    relation: pd.relation ? String(pd.relation).trim().slice(0, 40) : undefined
  };
}

const dedupeKeyFor = (patientId, serviceType, date, time, pd) => {
  const who = String((pd && pd.name) || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `${patientId}|${serviceType}|${date}|${time}|${who}`;
};

/** Last day a plan of `sessions` starting on `startDate` may be used. */
function planLastDay(sessions, startDate) {
  const p = getRevenuePolicy().care.plan;
  const weeks = Math.max(p.minWeeks, sessions * p.weeksPerSession);
  return careSlotService.addDays(startDate, weeks * 7 - 1);
}

const bookingServiceType = (service, kind) => {
  const wanted = service.marketplace && service.marketplace.bookingServiceType;
  if (wanted && BOOKING_SERVICE_TYPES.includes(wanted)) return wanted;
  return { NURSING: 'GENERAL_NURSING', PHYSIO: 'PHYSIOTHERAPY_SESSION', HOMECARE: 'ELDERLY_CARE' }[kind] || 'OTHER';
};

/** The shop, its rate card line and the catalog service, if they can be booked now. */
async function loadBookable(storeId, serviceId, mode) {
  if (!['HOME', 'CLINIC'].includes(mode)) throw new ValidationError('Choose home or clinic');
  const store = await CareStore.findOne({ _id: storeId, status: 'APPROVED' });
  if (!store || !(await careStoreService.liveOwners([store])).has(String(store.owner))) throw new NotFoundError('Provider');
  if (store.isPaused) throw conflict('This provider isn’t taking new bookings right now', 'STORE_PAUSED');
  if (mode === 'HOME' && !store.home.enabled) throw badRequest('This provider doesn’t do home visits', 'MODE_UNAVAILABLE');
  if (mode === 'CLINIC' && !store.clinic.enabled) throw badRequest('This provider only does home visits', 'MODE_UNAVAILABLE');
  const item = await RateCardItem.findOne({ store: store._id, service: serviceId, isActive: true });
  const listPrice = item && item.priceFor(mode);
  if (listPrice === null || listPrice === undefined) throw badRequest(`This provider doesn’t offer that ${mode === 'HOME' ? 'at home' : 'at the clinic'}`, 'MODE_UNAVAILABLE');
  const service = await ServiceCatalog.findOne({ _id: serviceId, 'availability.isActive': true }).lean();
  if (!service) throw new NotFoundError('Service');
  return { store, item, service, listPrice };
}

/** Saved address by id, or the address typed in. */
async function resolveAddress(patientId, input) {
  if (input && input.addressId) {
    const p = await Patient.findById(patientId).select('savedAddresses').lean();
    const saved = p && (p.savedAddresses || []).find((a) => String(a._id) === String(input.addressId));
    if (!saved) throw new NotFoundError('Saved address');
    return cleanAddress(saved);
  }
  return cleanAddress(input && input.address);
}

/** Travel to an address from the shop, or a clear "out of range". */
function travelTo(store, coordinates) {
  const straightKm = haversineKm(careStoreService.tripOrigin(store), coordinates);
  if (straightKm > store.home.radiusKm) {
    throw badRequest(`This address is ${Math.round(straightKm * 1.3)} km away, outside ${store.name}'s home-visit area (${store.home.radiusKm} km). Choose a clinic visit or another provider.`, 'OUT_OF_RANGE', { radiusKm: store.home.radiusKm });
  }
  return pricingService.quoteTravel({ straightKm, ratePerKm: store.home.ratePerKm });
}

/** Slots already full for any of these sessions (doesn't reserve). */
async function takenDates(store, mode, dates, time, durationMinutes) {
  // Named professionals (agency caregivers, clinic physios at home): someone
  // must be free on EVERY date, since the same person comes each time.
  if (careSlotService.assignsPractitioner(store, mode)) {
    return (await careSlotService.freePractitioner(store, mode, dates, time, durationMinutes)) ? [] : dates;
  }
  const { capacity } = careSlotService.resourceFor(store, mode);
  const keysByDate = new Map(dates.map((d) => [d, careSlotService.slotKeysFor(store, mode, d, time, durationMinutes).map((s) => s.key)]));
  const full = await SlotReservation.find({ key: { $in: [...keysByDate.values()].flat() }, count: { $gte: capacity } }).select('key').lean();
  const fullSet = new Set(full.map((r) => r.key));
  return dates.filter((d) => keysByDate.get(d).some((k) => fullSet.has(k)));
}

/**
 * Hold every session's slots, all or nothing. Shops that assign a named
 * professional try each one in turn until someone can take ALL sessions.
 * @returns {{ practitioner, reserved: [{ id, keys }] }}
 */
async function reservePlanSlots(store, mode, dates, time, durationMinutes, sessionIds) {
  const named = careSlotService.assignsPractitioner(store, mode);
  const people = named ? careSlotService.practitionersOf(store) : [null];
  let lastErr;
  for (const person of people) {
    const reserved = [];
    try {
      for (const [i, date] of dates.entries()) {
        const keys = await careSlotService.reserve(store, mode, date, time, durationMinutes, sessionIds[i], { practitioner: person || undefined });
        reserved.push({ id: sessionIds[i], keys });
      }
      return { practitioner: person ? new mongoose.Types.ObjectId(person) : store.owner, reserved };
    } catch (err) {
      for (const r of reserved) await careSlotService.release(r.keys, r.id).catch(() => undefined);
      lastErr = err;
      if (!err || err.code !== 'SLOT_TAKEN') throw err;
    }
  }
  if (named) throw conflict('No caregiver is free at this time on all the days you picked. Try another time or fewer days a week.', 'SLOT_TAKEN', { dates });
  throw lastErr;
}

/** Everything a quote holds, computed fresh from live data. */
async function buildQuote(patientId, input = {}) {
  const policy = getRevenuePolicy().care.plan;
  const mode = String(input.mode || '').toUpperCase();
  const sessions = Number(input.sessions);
  if (!Number.isInteger(sessions) || sessions < 1 || sessions > policy.maxSessions) throw new ValidationError(`Choose 1–${policy.maxSessions} sessions`);
  const paymentMode = input.paymentMode === 'PREPAID' ? 'PREPAID' : 'PER_SESSION';
  const { store, item, service, listPrice } = await loadBookable(input.storeId, input.serviceId, mode);

  let address;
  let travel = { perSession: 0, waived: false };
  if (mode === 'HOME') {
    address = await resolveAddress(patientId, input);
    const t = travelTo(store, address.coordinates);
    travel = { straightKm: t.straightKm, roadKm: t.roadKm, chargedKm: t.chargedKm, ratePerKm: t.ratePerKm, perSession: t.fee };
  }

  const schedule = input.schedule || {};
  const time = String(schedule.time || '');
  const startDate = String(schedule.startDate || '');
  const weekdays = sessions === 1 && !(schedule.weekdays && schedule.weekdays.length)
    ? [careSlotService.weekdayOf(startDate || careSlotService.todayIst())]
    : schedule.weekdays;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new ValidationError('Pick a start date');
  if (startDate < careSlotService.todayIst()) throw new ValidationError('The start date has passed');
  const lastDay = planLastDay(sessions, startDate);
  // One session: exactly the day picked (never silently moved past a leave day).
  // Several: the chosen weekdays from that day, skipping leave days (all shown in the quote).
  const dates = sessions === 1 ? [startDate] : careSlotService.planDates({ startDate, weekdays, sessions, untilDate: lastDay, store });
  if (dates.length < sessions) throw badRequest(`Pick more days a week so all ${sessions} sessions fit by ${lastDay}`, 'SCHEDULE_TOO_SHORT');
  const problems = dates.map((d) => careSlotService.bookabilityProblem(store, mode, d, time, item.durationMinutes)).filter(Boolean);
  if (problems.length) throw badRequest(problems[0], 'SCHEDULE_UNAVAILABLE', { problems: problems.slice(0, 10) });
  const taken = await takenDates(store, mode, dates, time, item.durationMinutes);
  if (taken.length) throw conflict(`${time} is already booked on ${taken.slice(0, 3).join(', ')}${taken.length > 3 ? ` and ${taken.length - 3} more` : ''}. Pick another time.`, 'SLOT_TAKEN', { dates: taken });

  // Two family members at one address on the same days: one trip, no second travel fee.
  if (mode === 'HOME' && travel.perSession > 0) {
    const sameDay = await NurseBooking.find({
      patient: patientId,
      'marketplace.store': store._id,
      'serviceLocation.type': 'HOME',
      status: { $in: ['ASSIGNED', 'CONFIRMED', 'EN_ROUTE'] },
      scheduledDate: { $in: dates.map((d) => new Date(`${d}T00:00:00Z`)) }
    }).select('scheduledDate serviceLocation.address.coordinates').lean();
    const covered = dates.every((d) => sameDay.some((s) => s.scheduledDate.toISOString().slice(0, 10) === d
      && s.serviceLocation.address && s.serviceLocation.address.coordinates
      && haversineKm(s.serviceLocation.address.coordinates, address.coordinates) <= 0.1));
    if (covered) travel = { ...travel, perSession: 0, waived: true };
  }

  // A plan the professional proposed after a visit: must match what they proposed.
  let proposal = null;
  if (input.proposalId) {
    proposal = await PlanProposal.findOne({ _id: input.proposalId, patient: patientId, status: 'PENDING', expiresAt: { $gt: new Date() } }).lean();
    if (!proposal) throw conflict('This plan suggestion has expired or was already answered', 'PROPOSAL_CLOSED');
    if (String(proposal.store) !== String(store._id) || String(proposal.service) !== String(service._id) || proposal.mode !== mode || proposal.sessions !== sessions) {
      throw badRequest('Book the plan as suggested, or book a new one without the suggestion', 'PROPOSAL_MISMATCH');
    }
  }

  const isMember = await membershipService.isMember(patientId);
  const travelFeeOnce = item.liveIn && mode === 'HOME' && sessions > 1 ? travel.perSession : 0;
  const q = pricingService.quoteCarePlan({
    listPrice, sessions, mode, travelPerSession: travelFeeOnce ? 0 : travel.perSession, discountTiers: item.sessionDiscounts, paymentMode, isMember
  });

  // The shop's new-customer offer: % off the first session (shop-funded, admin approved).
  // Live-in care: the caregiver travels once, so travel is on the first day only.
  let offer = 0;
  let firstSession;
  const travelOnce = Boolean(item.liveIn) && mode === 'HOME' && travel.perSession > 0 && sessions > 1;
  if (item.offer && item.offer.status === 'APPROVED' && item.offer.percent > 0
    && !(await CarePlan.exists({ patient: patientId, store: store._id, status: { $ne: 'CANCELLED' } }))) {
    offer = round2(Math.min(item.offer.maxDiscount || Infinity, (q.servicePerSession * item.offer.percent) / 100));
  }
  if (offer > 0 || travelOnce) {
    const first = pricingService.quoteCarePlan({
      listPrice: round2(q.servicePerSession - offer), sessions: 1, mode, travelPerSession: travelFeeOnce || travel.perSession, paymentMode, isMember, discountPercent: 0
    });
    firstSession = { servicePrice: first.servicePerSession, platformFee: first.platformFeePerSession, gst: first.gstPerSession, payable: first.perSessionPayable };
    const delta = (key) => round2(first[key] - q[key]);
    q.platformFee = round2(q.platformFee + delta('platformFeePerSession'));
    q.gst = round2(q.gst + delta('gstPerSession'));
    q.total = round2(q.total + delta('perSessionPayable'));
    q.lines = [
      ...q.lines.filter((l) => ['SERVICE', 'DISCOUNT'].includes(l.code)),
      ...(offer > 0 ? [{ code: 'OFFER', label: `${item.offer.percent}% off your first session`, amount: -offer }] : []),
      ...(travelOnce ? [{ code: 'TRAVEL', label: `Travel once (live-in care)`, amount: travelFeeOnce }] : q.lines.filter((l) => l.code === 'TRAVEL')),
      { code: 'PLATFORM_FEE', label: q.lines.find((l) => l.code === 'PLATFORM_FEE').label, amount: q.platformFee },
      { code: 'GST', label: 'GST', amount: q.gst }
    ];
  }
  if (travel.waived) q.lines.push({ code: 'TRAVEL_WAIVED', label: 'No travel fee: same address and day as your other booking', amount: 0 });

  return {
    patient: patientId,
    store: store._id,
    rateCardItem: item._id,
    rateCardVersion: item.version,
    storeTravelRate: store.home.ratePerKm,
    service: service._id,
    serviceName: service.displayName || service.name,
    mode,
    sessions,
    paymentMode,
    durationMinutes: item.durationMinutes,
    schedule: { startDate, weekdays: [...new Set((weekdays || []).map(Number))], time, dates },
    address,
    patientDetails: cleanPatientDetails(input.patientDetails),
    travel: travelFeeOnce ? { ...travel, liveInOnce: true } : travel,
    proposal: proposal ? proposal._id : undefined,
    firstSession,
    amounts: {
      listPricePerSession: q.listPricePerSession,
      discountPercent: q.discountPercent,
      servicePerSession: q.servicePerSession,
      serviceSubtotal: q.serviceSubtotal,
      discount: q.discount,
      offer,
      creditAvailable: await walletService.balance(patientId),
      travelTotal: q.travelTotal,
      platformFee: q.platformFee,
      gst: q.gst,
      total: q.total,
      perSessionPayable: q.perSessionPayable
    },
    memberFeeWaived: q.memberFeeWaived,
    lines: q.lines,
    _perSession: { platformFee: q.platformFeePerSession, gst: q.gstPerSession },
    _store: store,
    _service: service,
    _kind: store.kind
  };
}

/** A built quote without its working fields (the ones starting with _). */
const quoteFields = (built) => Object.fromEntries(Object.entries(built).filter(([k]) => !k.startsWith('_')));

const publicQuote = (doc, store) => {
  const o = doc.toObject ? doc.toObject() : doc;
  return { ...o, store: store ? careStoreService.publicStore(store.toObject ? store.toObject() : store) : o.store };
};

/** The bill for a plan, locked for a few minutes. */
async function createQuote(patientId, input) {
  const built = await buildQuote(patientId, input);
  const store = built._store;
  const quote = await CareQuote.create({ ...quoteFields(built), expiresAt: new Date(Date.now() + getRevenuePolicy().care.plan.quoteMinutes * 60000) });
  return publicQuote(quote, store);
}

/** Free a session's slots (and forget them on the session). */
async function releaseSlots(booking) {
  const keys = (booking.marketplace && booking.marketplace.slotKeys) || [];
  if (!keys.length) return;
  await careSlotService.release(keys, booking._id);
  await NurseBooking.updateOne({ _id: booking._id }, { $set: { 'marketplace.slotKeys': [] } });
}

/**
 * Book the plan in a quote. Single use (a double tap returns the same plan).
 * Prices are re-checked: if the shop changed them, the customer gets a new
 * quote to confirm (PRICE_CHANGED) and nothing is booked.
 */
async function bookPlan(patientId, quoteId) {
  const now = new Date();
  const quote = await CareQuote.findOneAndUpdate(
    { _id: quoteId, patient: patientId, usedAt: { $exists: false }, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
    { returnDocument: 'after' }
  );
  if (!quote) {
    const old = await CareQuote.findOne({ _id: quoteId, patient: patientId }).lean();
    if (!old) throw new NotFoundError('Quote');
    if (old.plan) return getPlan(patientId, old.plan);
    if (old.usedAt) throw conflict('This booking is already being placed', 'QUOTE_IN_USE');
    throw conflict('This price has expired. Check the latest price and book again.', 'QUOTE_EXPIRED');
  }

  const reserved = []; // [{ id, keys }]
  const createdIds = [];
  let plan = null;
  let keepQuoteUsed = false;
  try {
    const fresh = await buildQuote(patientId, {
      storeId: quote.store,
      serviceId: quote.service,
      mode: quote.mode,
      sessions: quote.sessions,
      paymentMode: quote.paymentMode,
      address: quote.address,
      schedule: { startDate: quote.schedule.startDate, weekdays: quote.schedule.weekdays, time: quote.schedule.time },
      patientDetails: quote.patientDetails,
      proposalId: quote.proposal
    });
    const { _store: store, _perSession: perSession, _service: service, _kind: kind } = fresh;
    if (fresh.amounts.total !== quote.amounts.total || fresh.amounts.perSessionPayable !== quote.amounts.perSessionPayable) {
      keepQuoteUsed = true;
      const newQuote = await CareQuote.create({ ...quoteFields(fresh), expiresAt: new Date(Date.now() + getRevenuePolicy().care.plan.quoteMinutes * 60000) });
      throw conflict(`The price changed from ₹${quote.amounts.total} to ₹${fresh.amounts.total}. Please confirm the new price.`, 'PRICE_CHANGED', { quote: publicQuote(newQuote, store) });
    }

    // Hold every session's slots first: all or nothing, one named person throughout.
    const sessionIds = fresh.schedule.dates.map(() => new mongoose.Types.ObjectId());
    const held = await reservePlanSlots(store, fresh.mode, fresh.schedule.dates, fresh.schedule.time, fresh.durationMinutes, sessionIds);
    reserved.push(...held.reserved);

    const policy = getRevenuePolicy().care.plan;
    const prepaid = fresh.paymentMode === 'PREPAID';
    // Solo: the professional; agency / clinic at home: the named caregiver or physio; else the shop's account.
    const { practitioner } = held;
    const seriesId = crypto.randomBytes(8).toString('hex');
    const lastDay = planLastDay(fresh.sessions, fresh.schedule.startDate);
    const a = fresh.amounts;
    plan = await CarePlan.create({
      patient: patientId,
      store: store._id,
      practitioner,
      rateCardItem: fresh.rateCardItem,
      service: fresh.service,
      serviceName: fresh.serviceName,
      serviceType: bookingServiceType(service, kind),
      mode: fresh.mode,
      quote: quote._id,
      seriesId,
      sessionsTotal: fresh.sessions,
      price: {
        listPricePerSession: a.listPricePerSession,
        discountPercent: a.discountPercent,
        servicePerSession: a.servicePerSession,
        travelPerSession: fresh.travel.liveInOnce ? 0 : fresh.travel.perSession || 0,
        ratePerKm: fresh.travel.ratePerKm,
        roadKm: fresh.travel.roadKm,
        platformFeePerSession: perSession.platformFee,
        gstPerSession: perSession.gst,
        offer: a.offer || 0,
        travelWaived: Boolean(fresh.travel.waived),
        total: a.total
      },
      proposal: fresh.proposal,
      address: fresh.address,
      patientDetails: fresh.patientDetails,
      paymentMode: fresh.paymentMode,
      payment: prepaid
        ? { status: 'PENDING', amount: a.total, holdUntil: new Date(Date.now() + policy.paymentHoldMinutes * 60000) }
        : { status: 'NOT_REQUIRED' },
      status: prepaid ? 'PENDING_PAYMENT' : 'ACTIVE',
      expiresAt: careSlotService.istInstant(lastDay, '23:59')
    });

    // Pay-per-session: an unpaid late-cancellation fee rides on the first visit's bill.
    const patient = await Patient.findById(patientId).select('pendingDues').lean();
    const dues = !prepaid ? round2(Number(patient && patient.pendingDues) || 0) : 0;
    const clinicAddress = {
      street: [store.address && store.address.line1, store.address && store.address.line2].filter(Boolean).join(', ') || store.name,
      city: store.address && store.address.city,
      state: store.address && store.address.state,
      pincode: store.address && store.address.pincode,
      coordinates: { lat: store.location.coordinates[1], lng: store.location.coordinates[0] }
    };
    const docs = fresh.schedule.dates.map((date, i) => ({
      _id: sessionIds[i],
      patient: patientId,
      serviceProvider: practitioner,
      serviceType: plan.serviceType,
      serviceDetails: { description: fresh.serviceName, duration: fresh.durationMinutes, totalSessions: fresh.sessions, completedSessions: 0 },
      scheduledDate: new Date(`${date}T00:00:00Z`),
      scheduledTime: fresh.schedule.time,
      scheduledTimezone: 'Asia/Kolkata',
      scheduledTimezoneOffsetMinutes: 330,
      estimatedDuration: fresh.durationMinutes,
      isRecurring: fresh.sessions > 1,
      serviceLocation: fresh.mode === 'HOME'
        ? { type: 'HOME', address: { ...fresh.address, label: undefined } }
        : { type: 'CLINIC', address: clinicAddress },
      patientDetails: fresh.patientDetails,
      series: { id: seriesId, index: i + 1, total: fresh.sessions },
      marketplace: {
        store: store._id,
        plan: plan._id,
        rateCardItem: fresh.rateCardItem,
        mode: fresh.mode,
        slotKeys: reserved[i].keys,
        travel: fresh.mode === 'HOME' ? { roadKm: fresh.travel.roadKm, ratePerKm: fresh.travel.ratePerKm } : undefined
      },
      // The first session carries the shop's new-customer offer, if any.
      pricing: i === 0 && fresh.firstSession ? {
        basePrice: fresh.firstSession.servicePrice,
        travelFee: fresh.travel.liveInOnce ? fresh.travel.perSession : fresh.travel.perSession || 0,
        platformFee: fresh.firstSession.platformFee,
        gst: fresh.firstSession.gst,
        discount: a.offer,
        totalAmount: fresh.firstSession.payable,
        previousDues: dues,
        payableAmount: round2(fresh.firstSession.payable + dues)
      } : {
        basePrice: a.servicePerSession,
        travelFee: fresh.travel.liveInOnce ? 0 : fresh.travel.perSession || 0,
        platformFee: perSession.platformFee,
        gst: perSession.gst,
        discount: 0,
        totalAmount: a.perSessionPayable,
        previousDues: i === 0 ? dues : 0,
        payableAmount: round2(a.perSessionPayable + (i === 0 ? dues : 0))
      },
      payment: prepaid ? { method: 'ONLINE', status: 'PENDING', amount: i === 0 && fresh.firstSession ? fresh.firstSession.payable : a.perSessionPayable } : { status: 'PENDING' },
      status: 'CONFIRMED',
      statusTimestamps: { requestedAt: now, confirmedAt: now },
      dispatch: { mode: 'SCHEDULED', status: 'MATCHED', requestedProvider: practitioner, allowSubstitute: false, matchedAt: now },
      visitOtp: { code: String(crypto.randomInt(0, 10000)).padStart(4, '0') },
      shareToken: crypto.randomBytes(16).toString('hex'),
      dedupeKey: dedupeKeyFor(patientId, plan.serviceType, date, fresh.schedule.time, fresh.patientDetails)
    }));
    try {
      for (const doc of docs) {
        await NurseBooking.create(doc);
        createdIds.push(doc._id);
      }
    } catch (err) {
      if (err && err.code === 11000 && err.keyPattern && err.keyPattern.dedupeKey) {
        throw conflict('You already have a visit booked at one of these times for the same person. Check My bookings.', 'DUPLICATE_VISIT');
      }
      throw err;
    }
    if (dues > 0) await Patient.updateOne({ _id: patientId, pendingDues: patient.pendingDues }, { $set: { pendingDues: 0 } });
    await CareQuote.updateOne({ _id: quote._id }, { $set: { plan: plan._id } });

    // Nabz credit pays first: off the upfront payment, or off the first visits' bills.
    const credit = await walletService.spend(patientId, prepaid ? a.total : round2(docs.reduce((s, d) => s + d.pricing.payableAmount, 0)), `plan:${plan._id}`);
    if (credit > 0) {
      await CarePlan.updateOne({ _id: plan._id }, { $set: { creditUsed: credit } });
      if (prepaid) {
        const remaining = round2(a.total - credit);
        await CarePlan.updateOne({ _id: plan._id }, { $set: { 'payment.amount': remaining } });
        if (remaining <= 0) await markPlanPaid(plan._id, { orderId: 'WALLET', paymentId: `wallet:${plan._id}` });
      } else {
        let left = credit;
        for (const d of docs) {
          if (left <= 0) break;
          const use = round2(Math.min(left, d.pricing.payableAmount));
          await NurseBooking.updateOne({ _id: d._id }, { $inc: { 'pricing.discount': use, 'pricing.payableAmount': -use } });
          left = round2(left - use);
        }
      }
    }
    if (fresh.proposal) {
      await PlanProposal.updateOne({ _id: fresh.proposal, status: 'PENDING' }, { $set: { status: 'ACCEPTED', plan: plan._id, respondedAt: new Date() } });
    }

    const when = `${fresh.schedule.dates[0]} at ${fresh.schedule.time}`;
    lazyBooking().notifyUser(practitioner, 'User', 'New booking',
      `${fresh.sessions} ${fresh.mode === 'HOME' ? 'home' : 'clinic'} session${fresh.sessions > 1 ? 's' : ''} of ${fresh.serviceName}, starting ${when}.`, createdIds[0]).catch(() => undefined);
    logger.info('Care plan booked', { planId: String(plan._id), storeId: String(store._id), sessions: fresh.sessions, mode: fresh.mode, paymentMode: fresh.paymentMode });
    return getPlan(patientId, plan._id);
  } catch (err) {
    // Undo everything: no half-booked plan.
    for (const r of reserved) await careSlotService.release(r.keys, r.id).catch(() => undefined);
    if (createdIds.length) await NurseBooking.deleteMany({ _id: { $in: createdIds } });
    if (plan) await CarePlan.deleteOne({ _id: plan._id });
    if (!keepQuoteUsed) await CareQuote.updateOne({ _id: quote._id }, { $unset: { usedAt: 1 } });
    throw err;
  }
}

function publicSession(s) {
  return {
    _id: s._id,
    index: s.series && s.series.index,
    scheduledDate: s.scheduledDate,
    scheduledTime: s.scheduledTime,
    status: s.status,
    needsAction: s.status === 'REQUESTED' && s.dispatch && s.dispatch.status === 'NO_STAFF',
    mode: s.marketplace && s.marketplace.mode,
    address: s.serviceLocation && s.serviceLocation.address,
    pricing: s.pricing,
    payment: s.payment && { status: s.payment.status, method: s.payment.method },
    rating: s.rating && s.rating.stars ? { stars: s.rating.stars } : undefined
  };
}

async function getPlan(patientId, planId) {
  const plan = await CarePlan.findOne({ _id: planId, patient: patientId }).lean();
  if (!plan) throw new NotFoundError('Plan');
  const [sessions, store] = await Promise.all([
    NurseBooking.find({ 'marketplace.plan': plan._id }).sort({ 'series.index': 1 }).lean(),
    CareStore.findById(plan.store).lean()
  ]);
  return { ...plan, store: store ? careStoreService.publicStore(store) : null, sessions: sessions.map(publicSession) };
}

async function listMyPlans(patientId) {
  const plans = await CarePlan.find({ patient: patientId }).sort({ createdAt: -1 }).limit(50).lean();
  const stores = await CareStore.find({ _id: { $in: plans.map((p) => p.store) } }).lean();
  const byId = new Map(stores.map((s) => [String(s._id), careStoreService.publicStore(s)]));
  return plans.map((p) => ({ ...p, store: byId.get(String(p.store)) || null }));
}

/** The shop's plans (partner app): upcoming work per customer, no contact details. */
async function listStorePlans(user) {
  const store = await CareStore.findOne({ $or: [{ owner: user._id || user.id }, { 'members.user': user._id || user.id }] }).lean();
  if (!store) return [];
  const plans = await CarePlan.find({ store: store._id, status: { $in: ['ACTIVE', 'PENDING_PAYMENT'] } }).sort({ createdAt: -1 }).limit(100).lean();
  return plans.map((p) => ({
    _id: p._id, serviceName: p.serviceName, mode: p.mode, sessionsTotal: p.sessionsTotal, sessionsCompleted: p.sessionsCompleted,
    status: p.status, paymentMode: p.paymentMode, patientDetails: p.patientDetails, city: p.address && p.address.city, createdAt: p.createdAt
  }));
}

// ── Prepaid payment ──────────────────────────────────────────────────────

function razorpayConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret || process.env.RAZORPAY_ENABLED === 'false') return null;
  return { keyId, keySecret };
}

async function createPaymentOrder(patientId, planId) {
  const plan = await CarePlan.findOne({ _id: planId, patient: patientId });
  if (!plan) throw new NotFoundError('Plan');
  if (plan.status !== 'PENDING_PAYMENT') throw conflict(plan.payment.status === 'PAID' ? 'This plan is already paid' : 'This plan can’t be paid now', 'NOT_PAYABLE');
  const cfg = razorpayConfig();
  if (!cfg) throw new PaymentError('Online payment isn’t available yet. Choose “Pay after each session”.');
  const Razorpay = require('razorpay');
  const client = new Razorpay({ key_id: cfg.keyId, key_secret: cfg.keySecret });
  const order = await client.orders.create({
    amount: Math.round(plan.payment.amount * 100),
    currency: 'INR',
    receipt: `plan_${plan._id}`.slice(0, 40),
    notes: { planId: String(plan._id) }
  });
  await CarePlan.updateOne({ _id: plan._id, status: 'PENDING_PAYMENT' }, { $set: { 'payment.orderId': order.id } });
  return { orderId: order.id, amount: plan.payment.amount, currency: 'INR', keyId: cfg.keyId };
}

/** Mark a prepaid plan paid (after the signature check). Late payment for a freed plan becomes a refund. */
async function markPlanPaid(planId, { orderId, paymentId }) {
  const now = new Date();
  const plan = await CarePlan.findOneAndUpdate(
    { _id: planId, status: 'PENDING_PAYMENT' },
    { $set: { status: 'ACTIVE', 'payment.status': 'PAID', 'payment.paidAt': now, 'payment.orderId': orderId, 'payment.paymentId': paymentId } },
    { returnDocument: 'after' }
  );
  if (!plan) {
    const late = await CarePlan.findById(planId);
    if (late && late.payment.status !== 'PAID' && ['CANCELLED', 'EXPIRED'].includes(late.status)) {
      // Paid after the hold ran out: nothing is booked any more, so all of it goes back.
      await CarePlan.updateOne({ _id: late._id }, {
        $set: {
          'payment.status': 'PAID', 'payment.paidAt': now, 'payment.orderId': orderId, 'payment.paymentId': paymentId,
          refund: { amount: late.payment.amount, credit: 0, status: 'PENDING', reason: 'Paid after the booking hold expired', requestedAt: now }
        }
      });
      logger.warn('Care plan paid after hold expired; full refund queued', { planId: String(planId) });
      throw conflict('Your payment came after the booking hold expired. A full refund is on its way.', 'PAID_TOO_LATE');
    }
    if (late && late.payment.status === 'PAID') return late.toObject();
    throw new NotFoundError('Plan');
  }
  await NurseBooking.updateMany(
    { 'marketplace.plan': plan._id, status: { $ne: 'CANCELLED' } },
    { $set: { 'payment.status': 'PAID', 'payment.paidAt': now, 'payment.orderId': orderId, 'payment.paymentId': paymentId } }
  );
  logger.info('Care plan paid', { planId: String(plan._id), amount: plan.payment.amount });
  return plan.toObject();
}

async function verifyPayment(patientId, planId, { orderId, paymentId, signature } = {}) {
  const plan = await CarePlan.findOne({ _id: planId, patient: patientId }).select('_id payment').lean();
  if (!plan) throw new NotFoundError('Plan');
  const cfg = razorpayConfig();
  if (!cfg) throw new PaymentError('Online payment isn’t available yet');
  if (!orderId || orderId !== plan.payment.orderId) throw new PaymentError('This payment isn’t for this plan');
  const expected = crypto.createHmac('sha256', cfg.keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  const given = String(signature || '');
  if (given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    logger.logSecurity && logger.logSecurity('care_plan_payment_signature_invalid', { planId: String(planId) });
    throw new PaymentError('Payment could not be verified');
  }
  await markPlanPaid(plan._id, { orderId, paymentId });
  return getPlan(patientId, plan._id);
}

// ── Changes during a plan ────────────────────────────────────────────────

async function ownedSession(patientId, bookingId) {
  const booking = await NurseBooking.findOne({ _id: bookingId, patient: patientId });
  if (!booking || !booking.marketplace || !booking.marketplace.plan) throw new NotFoundError('Session');
  const plan = await CarePlan.findById(booking.marketplace.plan);
  if (!plan) throw new NotFoundError('Plan');
  return { booking, plan };
}

/** Move one session (also how a customer re-books a session the provider released). */
async function rescheduleSession(patientId, bookingId, { date, time } = {}) {
  const { booking, plan } = await ownedSession(patientId, bookingId);
  if (!['ACTIVE', 'PENDING_PAYMENT'].includes(plan.status)) throw conflict('This plan is closed', 'PLAN_CLOSED');
  if (!MOVABLE.includes(booking.status)) throw conflict('This session can’t be moved now', 'NOT_MOVABLE');
  const start = visitPolicy.visitStart(booking);
  if (start && start.getTime() < Date.now() + visitPolicy.getVisitPolicy().minLeadMinutes * 60000) throw conflict('It’s too close to the session to move it. Cancel it instead.', 'TOO_LATE');
  const store = await CareStore.findById(plan.store);
  if (!store || store.status !== 'APPROVED') throw conflict('This provider is no longer taking bookings. Cancel the session for a refund.', 'STORE_UNAVAILABLE');
  const duration = booking.estimatedDuration || 45;
  const problem = careSlotService.bookabilityProblem(store, plan.mode, date, time, duration);
  if (problem) throw new ValidationError(problem);
  const lastDay = careSlotService.todayIst(plan.expiresAt.getTime());
  if (date > lastDay) throw badRequest(`Sessions of this plan must be done by ${lastDay}`, 'AFTER_PLAN_END');

  const oldKeys = booking.marketplace.slotKeys || [];
  const named = careSlotService.assignsPractitioner(store, plan.mode) && careSlotService.practitionersOf(store).includes(String(plan.practitioner));
  const newKeys = await careSlotService.reserve(store, plan.mode, date, time, duration, booking._id, { alreadyHeld: oldKeys, practitioner: named ? String(plan.practitioner) : undefined });
  const updated = await NurseBooking.findOneAndUpdate(
    { _id: booking._id, status: booking.status, scheduledTime: booking.scheduledTime, scheduledDate: booking.scheduledDate },
    {
      $set: {
        scheduledDate: new Date(`${date}T00:00:00Z`),
        scheduledTime: time,
        status: 'CONFIRMED',
        serviceProvider: plan.practitioner,
        'dispatch.status': 'MATCHED',
        'dispatch.matchedAt': new Date(),
        'marketplace.slotKeys': newKeys,
        dedupeKey: dedupeKeyFor(patientId, booking.serviceType, date, time, booking.patientDetails)
      }
    },
    { returnDocument: 'after' }
  ).catch((err) => {
    if (err && err.code === 11000) throw conflict('You already have a visit at that time for the same person', 'DUPLICATE_VISIT');
    throw err;
  });
  if (!updated) {
    await careSlotService.release(newKeys.filter((k) => !oldKeys.includes(k)), booking._id);
    throw conflict('This session just changed. Refresh and try again.', 'CHANGED');
  }
  await careSlotService.release(oldKeys.filter((k) => !newKeys.includes(k)), booking._id);
  lazyBooking().notifyUser(plan.practitioner, 'User', 'Session moved', `A ${plan.serviceName} session moved to ${date} at ${time}.`, booking._id).catch(() => undefined);
  return publicSession(updated.toObject());
}

/**
 * New visit address for one session or all upcoming ones (home plans). The
 * travel fee is worked out again; out of range → OUT_OF_RANGE. Prepaid: a
 * higher fee goes on the customer's next bill (dues), a lower one is credited
 * back when the plan settles.
 */
async function changeSessionAddress(patientId, bookingId, input = {}) {
  const { booking, plan } = await ownedSession(patientId, bookingId);
  if (plan.mode !== 'HOME') throw new ValidationError('This is a clinic plan; the address is the clinic');
  if (!['ACTIVE', 'PENDING_PAYMENT'].includes(plan.status)) throw conflict('This plan is closed', 'PLAN_CLOSED');
  const store = await CareStore.findById(plan.store);
  if (!store || store.status !== 'APPROVED' || !store.home.enabled) throw conflict('This provider no longer does home visits', 'STORE_UNAVAILABLE');
  const address = await resolveAddress(patientId, input);
  const travel = travelTo(store, address.coordinates);

  const targets = input.allUpcoming
    ? await NurseBooking.find({ 'marketplace.plan': plan._id, status: { $in: MOVABLE } })
    : [booking];
  const movable = targets.filter((s) => MOVABLE.includes(s.status));
  if (!movable.length) throw conflict('No upcoming session to change', 'NOT_MOVABLE');

  const repriced = pricingService.quoteCarePlan({
    listPrice: plan.price.listPricePerSession,
    sessions: 1,
    mode: 'HOME',
    travelPerSession: travel.fee,
    paymentMode: plan.paymentMode,
    discountPercent: plan.price.discountPercent,
    isMember: plan.price.platformFeePerSession === 0
  });
  let extraDue = 0;
  let credit = 0;
  for (const s of movable) {
    const before = Number(s.pricing && s.pricing.totalAmount) || 0;
    const set = {
      'serviceLocation.address': { ...address, label: undefined },
      'marketplace.travel': { roadKm: travel.roadKm, ratePerKm: travel.ratePerKm },
      'pricing.travelFee': travel.fee,
      'pricing.gst': repriced.gstPerSession,
      'pricing.totalAmount': repriced.perSessionPayable
    };
    if (plan.paymentMode === 'PER_SESSION') {
      set['pricing.payableAmount'] = round2(repriced.perSessionPayable + (Number(s.pricing && s.pricing.previousDues) || 0));
    } else {
      const diff = round2(repriced.perSessionPayable - before);
      if (diff > 0) extraDue = round2(extraDue + diff);
      if (diff < 0) credit = round2(credit - diff);
    }
    await NurseBooking.updateOne({ _id: s._id, status: { $in: MOVABLE } }, { $set: set });
  }
  if (extraDue > 0) await Patient.updateOne({ _id: patientId }, { $inc: { pendingDues: extraDue } });
  if (credit > 0) await CarePlan.updateOne({ _id: plan._id }, { $inc: { 'refund.credit': credit } });
  return { sessions: movable.length, travelFee: travel.fee, roadKm: travel.roadKm, extraDue, credit };
}

/** Cancel every session not yet started (fees as for any visit), then settle. */
async function cancelPlan(patientId, planId, reason = 'Customer cancelled the plan') {
  const plan = await CarePlan.findOne({ _id: planId, patient: patientId });
  if (!plan) throw new NotFoundError('Plan');
  if (!['ACTIVE', 'PENDING_PAYMENT'].includes(plan.status)) throw conflict('This plan is already closed', 'PLAN_CLOSED');
  const sessions = await NurseBooking.find({ 'marketplace.plan': plan._id, status: { $in: ['REQUESTED', 'ASSIGNED', 'CONFIRMED', 'EN_ROUTE'] } }).select('_id').lean();
  let cancelled = 0;
  for (const s of sessions) {
    try {
      await lazyBooking().cancelBooking(s._id, patientId, String(reason).slice(0, 300), 'patient');
      cancelled += 1;
    } catch (err) {
      logger.warn('Plan session could not be cancelled', { planId: String(plan._id), bookingId: String(s._id), error: err.message });
    }
  }
  await CarePlan.updateOne({ _id: plan._id }, { $set: { cancelReason: String(reason).slice(0, 300) } });
  await settlePlan(plan._id);
  return { cancelled, plan: await getPlan(patientId, plan._id) };
}

// ── Settlement ───────────────────────────────────────────────────────────

/**
 * What goes back to the customer of a prepaid plan:
 *   paid − completed sessions × list price per session (the multi-session
 *   discount was for taking them all) + credits, never below the credits.
 * When the provider let the plan down (released / suspended), completed
 * sessions count at the discounted price instead.
 */
function refundDue(plan, sessions) {
  if (plan.paymentMode !== 'PREPAID' || !plan.payment || plan.payment.status !== 'PAID') return 0;
  const completed = sessions.filter((s) => s.status === 'COMPLETED').length;
  const providerFault = sessions.some((s) => s.status === 'CANCELLED' && s.cancellation && ['PROVIDER', 'NURSE', 'ADMIN', 'SYSTEM'].includes(s.cancellation.cancelledBy));
  const p = plan.price;
  const perSession = providerFault
    ? round2(p.servicePerSession + p.travelPerSession + p.platformFeePerSession + p.gstPerSession)
    : pricingService.quoteCarePlan({
      listPrice: p.listPricePerSession, sessions: 1, mode: plan.mode, travelPerSession: p.travelPerSession,
      paymentMode: 'PER_SESSION', isMember: p.platformFeePerSession === 0
    }).perSessionPayable;
  const credit = Number(plan.refund && plan.refund.credit) || 0;
  return round2(Math.max(0, plan.payment.amount - completed * perSession) + credit);
}

/** Close a plan once no session is left open; prepaid → refund what's due. */
async function settlePlan(planId) {
  const plan = await CarePlan.findById(planId);
  if (!plan || !['ACTIVE', 'PENDING_PAYMENT', 'EXPIRED'].includes(plan.status)) return plan;
  const sessions = await NurseBooking.find({ 'marketplace.plan': plan._id }).select('status cancellation').lean();
  const completed = sessions.filter((s) => s.status === 'COMPLETED').length;
  const cancelled = sessions.filter((s) => s.status === 'CANCELLED').length;
  const open = sessions.filter((s) => OPEN.includes(s.status)).length;
  const set = { sessionsCompleted: completed, sessionsCancelled: cancelled };
  if (open === 0) {
    const closing = plan.status === 'EXPIRED' ? 'EXPIRED' : completed > 0 ? 'COMPLETED' : 'CANCELLED';
    set.status = closing;
    if (closing === 'CANCELLED') set.cancelledAt = new Date();
    if (completed === 0 && plan.creditUsed > 0) await walletService.reverse(plan.patient, `plan:${plan._id}`);
    const amount = refundDue(plan, sessions);
    if (amount > 0 && plan.refund.status === 'NONE') {
      set.refund = { amount, credit: plan.refund.credit || 0, status: 'PENDING', reason: `Plan ${closing.toLowerCase()} with ${plan.sessionsTotal - completed} of ${plan.sessionsTotal} sessions unused`, requestedAt: new Date() };
    }
  }
  const updated = await CarePlan.findOneAndUpdate({ _id: plan._id, status: plan.status }, { $set: set }, { returnDocument: 'after' });
  if (updated && set.refund) {
    logger.info('Care plan refund due', { planId: String(plan._id), amount: set.refund.amount });
    lazyBooking().notifyUser(plan.patient, 'Patient', 'Refund on its way', `₹${set.refund.amount} from your ${plan.serviceName} plan will be refunded to your payment method.`, plan._id).catch(() => undefined);
  }
  return updated;
}

// ── Callbacks from bookingService ────────────────────────────────────────

/** A session was cancelled or completed. */
async function onSessionClosed(booking) {
  try {
    // Done or cancelled: the time is no longer held (a session finished early frees it).
    await releaseSlots(booking);
    if (booking.status === 'COMPLETED' && booking.serviceProvider) {
      await NurseBooking.updateMany({ 'marketplace.plan': booking.marketplace.plan }, { $inc: { 'serviceDetails.completedSessions': 1 } });
    }
    await settlePlan(booking.marketplace.plan);
  } catch (err) {
    logger.error('Care plan update after session failed', { bookingId: String(booking._id), error: err.message });
  }
}

/**
 * The professional can't do a session (or the shop went on leave / was
 * suspended). Marketplace sessions don't go to dispatch: the customer chose this
 * provider, so the session waits for the customer to move it or cancel it for free.
 */
async function releaseSession(booking, { reason = 'The professional can’t make it', strike = false } = {}) {
  const released = await NurseBooking.findOneAndUpdate(
    { _id: booking._id, status: { $in: ['ASSIGNED', 'CONFIRMED', 'EN_ROUTE'] } },
    {
      $set: { status: 'REQUESTED', 'dispatch.status': 'NO_STAFF', 'marketplace.slotKeys': [] },
      $unset: { serviceProvider: 1, 'dispatch.matchedAt': 1, 'dispatch.offeredTo': 1, 'dispatch.offerExpiresAt': 1 },
      $push: { 'dispatch.dropped': { provider: booking.serviceProvider, at: new Date(), reason: String(reason).slice(0, 200) } }
    },
    { returnDocument: 'after' }
  );
  if (!released) throw conflict('This session just changed. Refresh and try again.', 'CHANGED');
  await careSlotService.release((booking.marketplace && booking.marketplace.slotKeys) || [], booking._id);
  if (strike && booking.marketplace && booking.marketplace.store) {
    await careStoreService.addStrike(booking.marketplace.store, `Released a session at short notice: ${reason}`, booking._id);
  }
  const date = released.scheduledDate.toISOString().slice(0, 10);
  lazyBooking().notifyUser(released.patient, 'Patient', 'Your session needs a new time',
    `${reason} on ${date}. Move the session to another time, or cancel it for free.`, released._id).catch(() => undefined);
  return released;
}

/** bookingService.releaseVisit for a marketplace session (provider "can't make it"). */
async function onProviderReleased(booking, providerId, reason) {
  if (!booking.serviceProvider || String(booking.serviceProvider) !== String(providerId)) {
    throw new AuthorizationError('Not your session');
  }
  const start = visitPolicy.visitStart(booking);
  const shortNotice = start && start.getTime() - Date.now() < 24 * 3600000;
  return releaseSession(booking, { reason, strike: shortNotice });
}

/** Leave days / suspension: release the shop's booked sessions in a date range. */
async function releaseStoreSessions(store, { from, to, reason, practitioner } = {}) {
  const dateFilter = {};
  if (from) dateFilter.$gte = new Date(`${from}T00:00:00Z`);
  if (to) dateFilter.$lte = new Date(`${to}T00:00:00Z`);
  const sessions = await NurseBooking.find({
    'marketplace.store': store._id,
    status: { $in: ['ASSIGNED', 'CONFIRMED'] },
    ...(practitioner ? { serviceProvider: practitioner } : {}),
    ...(from || to ? { scheduledDate: dateFilter } : { scheduledDate: { $gte: new Date(`${careSlotService.todayIst()}T00:00:00Z`) } })
  });
  let released = 0;
  for (const s of sessions) {
    try {
      await releaseSession(s, { reason });
      released += 1;
    } catch (err) {
      logger.warn('Session release failed', { bookingId: String(s._id), error: err.message });
    }
  }
  return released;
}

/** Keep the shop's rating in step with its sessions' ratings. */
async function syncStoreRating(storeId) {
  if (!storeId) return;
  const [agg] = await NurseBooking.aggregate([
    { $match: { 'marketplace.store': new mongoose.Types.ObjectId(String(storeId)), 'rating.stars': { $gte: 1 } } },
    { $group: { _id: null, avg: { $avg: '$rating.stars' }, count: { $sum: 1 } } }
  ]);
  await CareStore.updateOne({ _id: storeId }, { $set: { rating: { avg: agg ? Math.round(agg.avg * 10) / 10 : 0, count: agg ? agg.count : 0 } } });
}

/** Customer: "the professional asked for extra cash" / "didn't come". Flags the visit for ops. */
async function reportProblem(patientId, bookingId, { kind, note } = {}) {
  const kinds = { EXTRA_CASH: 'Asked to pay extra', NO_SHOW: 'Professional did not come', OTHER: 'Other problem' };
  if (!kinds[kind]) throw new ValidationError('Choose what went wrong');
  const { booking } = await ownedSession(patientId, bookingId);
  await NurseBooking.updateOne({ _id: booking._id }, {
    $set: { flagged: true, flagReason: `${kinds[kind]}${note ? `: ${String(note).slice(0, 300)}` : ''}` }
  });
  logger.warn('Marketplace session reported', { bookingId: String(booking._id), kind });
  return { reported: true };
}

// ── Plan proposals (the professional suggests a plan after a visit) ──────

async function createProposal(user, bookingId, input = {}) {
  const userId = user._id || user.id;
  const booking = await NurseBooking.findOne({ _id: bookingId, serviceProvider: userId, status: { $in: ['IN_PROGRESS', 'COMPLETED'] } }).lean();
  if (!booking) throw new NotFoundError('Visit (you can suggest a plan during or after your own visit)');
  const store = await CareStore.findOne({ $or: [{ owner: userId }, { 'members.user': userId }], status: 'APPROVED' });
  if (!store) throw new NotFoundError('Your shop');
  const mode = input.mode === 'CLINIC' ? 'CLINIC' : 'HOME';
  const sessions = Number(input.sessions);
  const max = getRevenuePolicy().care.plan.maxSessions;
  if (!Number.isInteger(sessions) || sessions < 1 || sessions > max) throw new ValidationError(`Suggest 1–${max} sessions`);
  const item = await RateCardItem.findOne({ store: store._id, service: input.serviceId, isActive: true }).populate('service', 'name displayName');
  if (!item || item.priceFor(mode) === null) throw new ValidationError(`Add this service ${mode === 'HOME' ? 'at home' : 'at the clinic'} to your rate card first`);
  const perWeek = Number(input.sessionsPerWeek);
  try {
    const proposal = await PlanProposal.create({
      store: store._id,
      patient: booking.patient,
      fromBooking: booking._id,
      proposedBy: userId,
      service: item.service._id,
      serviceName: item.service.displayName || item.service.name,
      mode,
      sessions,
      sessionsPerWeek: Number.isInteger(perWeek) && perWeek >= 1 && perWeek <= 7 ? perWeek : undefined,
      note: input.note ? String(input.note).slice(0, 500) : undefined,
      expiresAt: new Date(Date.now() + 14 * 86400000)
    });
    lazyBooking().notifyUser(booking.patient, 'Patient', 'Your physio suggested a plan',
      `${sessions} ${mode === 'HOME' ? 'home' : 'clinic'} sessions of ${proposal.serviceName}. Open the app to see the price and choose your days.`, booking._id).catch(() => undefined);
    return proposal.toObject();
  } catch (err) {
    if (err && err.code === 11000) throw conflict('You already suggested a plan for this visit', 'PROPOSAL_EXISTS');
    throw err;
  }
}

async function listMyProposals(patientId) {
  const rows = await PlanProposal.find({ patient: patientId, status: 'PENDING', expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }).lean();
  const stores = await CareStore.find({ _id: { $in: rows.map((r) => r.store) } }).lean();
  const byId = new Map(stores.map((s) => [String(s._id), careStoreService.publicStore(s)]));
  return rows.map((r) => ({ ...r, store: byId.get(String(r.store)) || null }));
}

async function declineProposal(patientId, proposalId) {
  const res = await PlanProposal.findOneAndUpdate({ _id: proposalId, patient: patientId, status: 'PENDING' }, { $set: { status: 'DECLINED', respondedAt: new Date() } }, { returnDocument: 'after' });
  if (!res) throw new NotFoundError('Plan suggestion');
  return res.toObject();
}

async function listStoreProposals(user) {
  const userId = user._id || user.id;
  const store = await CareStore.findOne({ $or: [{ owner: userId }, { 'members.user': userId }] }).lean();
  if (!store) return [];
  return PlanProposal.find({ store: store._id }).sort({ createdAt: -1 }).limit(50).lean();
}

// ── Ops: reported problems ───────────────────────────────────────────────

/**
 * Admin decision on a flagged visit:
 *   NO_SHOW       the professional didn't come → session cancelled (provider's
 *                 fault), Nabz credit to the customer, a strike for the shop
 *   EXTRA_CASH    asked for money outside the bill → strike, credit
 *   DISMISS       nothing wrong
 */
async function resolveReport(adminId, bookingId, { outcome, note } = {}) {
  const booking = await NurseBooking.findOne({ _id: bookingId, flagged: true });
  if (!booking) throw new NotFoundError('Reported visit');
  const policy = getRevenuePolicy().care;
  const result = { outcome, credit: 0, strike: false };
  if (outcome === 'NO_SHOW' || outcome === 'EXTRA_CASH') {
    if (outcome === 'NO_SHOW' && ['REQUESTED', 'ASSIGNED', 'CONFIRMED', 'EN_ROUTE'].includes(booking.status)) {
      await lazyBooking().cancelBooking(booking._id, adminId, `Professional did not come${note ? `: ${note}` : ''}`, 'platform_admin');
    }
    if (booking.marketplace && booking.marketplace.store) {
      await careStoreService.addStrike(booking.marketplace.store, outcome === 'NO_SHOW' ? 'Did not come to a visit' : 'Asked for extra cash', booking._id);
      result.strike = true;
    }
    if (policy.noShowCredit > 0) {
      await walletService.credit(booking.patient, policy.noShowCredit, { reason: outcome === 'NO_SHOW' ? 'Your professional didn’t come' : 'Sorry about the extra charge request', ref: `report:${booking._id}`, by: adminId });
      result.credit = policy.noShowCredit;
    }
  } else if (outcome !== 'DISMISS') {
    throw new ValidationError('Choose NO_SHOW, EXTRA_CASH or DISMISS');
  }
  await NurseBooking.updateOne({ _id: booking._id }, { $set: { flagged: false, adminNotes: `Report resolved: ${outcome}${note ? ` (${String(note).slice(0, 200)})` : ''}` } });
  logger.info('Visit report resolved', { bookingId: String(booking._id), outcome, by: String(adminId) });
  return result;
}

// ── Sweepers (internal tick) ─────────────────────────────────────────────

/** Prepaid plans not paid in time: free their slots and cancel them. */
async function expireUnpaidPlans(now = new Date()) {
  const due = await CarePlan.find({ status: 'PENDING_PAYMENT', 'payment.holdUntil': { $lte: now } }).select('_id').limit(100).lean();
  let expired = 0;
  for (const { _id } of due) {
    const plan = await CarePlan.findOneAndUpdate(
      { _id, status: 'PENDING_PAYMENT', 'payment.status': { $ne: 'PAID' } },
      { $set: { status: 'CANCELLED', cancelledAt: now, cancelReason: 'Not paid in time', 'payment.status': 'FAILED' } },
      { returnDocument: 'after' }
    );
    if (!plan) continue;
    const sessions = await NurseBooking.find({ 'marketplace.plan': plan._id, status: { $ne: 'CANCELLED' } });
    for (const s of sessions) {
      await NurseBooking.updateOne({ _id: s._id }, {
        $set: { status: 'CANCELLED', 'dispatch.status': 'CANCELLED', cancellation: { cancelledAt: now, cancelledBy: 'SYSTEM', reason: 'Plan not paid in time', cancellationFee: 0 } },
        $unset: { dedupeKey: 1 }
      });
      await releaseSlots(s);
    }
    expired += 1;
  }
  return expired;
}

/** Plans past their last day: unused sessions cancelled, prepaid money settled. */
async function expireOldPlans(now = new Date()) {
  const due = await CarePlan.find({ status: 'ACTIVE', expiresAt: { $lte: now } }).select('_id').limit(100).lean();
  let expired = 0;
  for (const { _id } of due) {
    const plan = await CarePlan.findOneAndUpdate({ _id, status: 'ACTIVE' }, { $set: { status: 'EXPIRED' } }, { returnDocument: 'after' });
    if (!plan) continue;
    const sessions = await NurseBooking.find({ 'marketplace.plan': plan._id, status: { $in: MOVABLE } });
    for (const s of sessions) {
      await NurseBooking.updateOne({ _id: s._id, status: s.status }, {
        $set: { status: 'CANCELLED', cancellation: { cancelledAt: now, cancelledBy: 'SYSTEM', reason: 'Plan expired', cancellationFee: 0 } },
        $unset: { dedupeKey: 1 }
      });
      await releaseSlots(s);
    }
    await settlePlan(plan._id);
    expired += 1;
  }
  return expired;
}

async function sweep(now = new Date()) {
  const unpaid = await expireUnpaidPlans(now);
  const old = await expireOldPlans(now);
  const proposals = (await PlanProposal.updateMany({ status: 'PENDING', expiresAt: { $lte: now } }, { $set: { status: 'EXPIRED' } })).modifiedCount;
  const labs = await require('./labOrderService').sweep(now);
  return { unpaid, old, proposals, labs };
}

module.exports = {
  createQuote,
  bookPlan,
  getPlan,
  listMyPlans,
  listStorePlans,
  createPaymentOrder,
  verifyPayment,
  markPlanPaid,
  rescheduleSession,
  changeSessionAddress,
  cancelPlan,
  refundDue,
  settlePlan,
  onSessionClosed,
  onProviderReleased,
  releaseSession,
  releaseStoreSessions,
  syncStoreRating,
  reportProblem,
  createProposal,
  listMyProposals,
  declineProposal,
  listStoreProposals,
  resolveReport,
  expireUnpaidPlans,
  expireOldPlans,
  sweep,
  planLastDay
};
