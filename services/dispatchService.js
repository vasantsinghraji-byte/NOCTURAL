/**
 * Dispatch — Uber-style matching of a "Book now" visit to a nurse/physio.
 *
 *   startDispatch(booking)  → SEARCHING, then offer to the nearest candidate
 *   candidate               = online + fresh heartbeat (staffAvailabilityService),
 *                             right role for the service, preferred gender,
 *                             not busy on another visit, not holding another
 *                             offer, hasn't declined this one
 *   offer                   → OFFERED for OFFER_TTL_MS; the partner app shows
 *                             it with a countdown (push + in-app)
 *   accept                  → CAS: provider set, booking CONFIRMED, MATCHED
 *   decline / expiry        → next candidate
 *   nobody after a while    → NO_STAFF (ops assign manually / patient reschedules)
 *
 * Scheduled visits start dispatch SCHEDULE_LEAD_MS before the visit time.
 * All state changes are compare-and-set, so a double tap or a racing sweeper
 * can't assign two nurses.
 */

const mongoose = require('mongoose');
const NurseBooking = require('../models/nurseBooking');
const User = require('../models/user');
const Notification = require('../models/notification');
const staffAvailabilityService = require('./staffAvailabilityService');
const pushNotificationService = require('./pushNotificationService');
const pricingService = require('./pricingService');
const logger = require('../utils/logger');
const { ConflictError, NotFoundError } = require('../utils/errors');
const visitPolicy = require('./careVisitPolicy');
const lazyAccess = () => require('./doctorAccessService');

const OFFER_TTL_MS = 45 * 1000;
// A chosen professional gets longer to answer a scheduled visit (they may be offline).
const REQUESTED_OFFER_TTL_MS = 20 * 60 * 1000;

function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
const MAX_ATTEMPTS = 8;
const SEARCH_RADIUS_KM = 12;
const GIVE_UP_MS = 10 * 60 * 1000; // "Book now": stop searching after 10 min
// Scheduled visits: start offering 12 h ahead and keep trying until 30 min before.
const SCHEDULE_LEAD_MS = 12 * 60 * 60 * 1000;
const SCHEDULED_STOP_BEFORE_MS = 30 * 60 * 1000;
const SWEEP_INTERVAL_MS = 10 * 1000;
const BUSY_STATUSES = ['CONFIRMED', 'EN_ROUTE', 'IN_PROGRESS'];
const PHYSIO_SERVICES = new Set([
  'PHYSIOTHERAPY_SESSION', 'POST_SURGERY_REHAB', 'SPORTS_INJURY', 'SPORTS_INJURY_THERAPY', 'BACK_PAIN_THERAPY',
  'KNEE_PAIN_THERAPY', 'STROKE_REHAB', 'GERIATRIC_PHYSIO', 'PEDIATRIC_PHYSIO', 'NEUROLOGICAL_REHAB', 'PHYSIO_PACKAGE_10'
]);

const rolesFor = (serviceType) => (PHYSIO_SERVICES.has(serviceType) ? ['physiotherapist'] : ['nurse', 'medical_staff']);
const nice = (serviceType) => String(serviceType || '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/** When the visit is due (scheduledDate + scheduledTime in its timezone). */
const visitTime = (booking) => visitPolicy.visitStart(booking);

/**
 * Staff who can't take this visit because they already hold one around the
 * same time. (Previously any confirmed visit, even tomorrow's, made a nurse
 * "busy" all day, and nothing stopped overlapping visits.)
 */
async function busyStaffFor(booking) {
  const start = booking.dispatch && booking.dispatch.mode === 'ASAP' ? new Date() : (visitTime(booking) || new Date());
  const held = await NurseBooking.find({
    status: { $in: BUSY_STATUSES.concat('ASSIGNED') },
    serviceProvider: { $ne: null },
    _id: { $ne: booking._id },
    scheduledDate: { $gte: new Date(start.getTime() - 2 * 86400000), $lte: new Date(start.getTime() + 2 * 86400000) }
  }).select('serviceProvider status scheduledDate scheduledTime scheduledTimezoneOffsetMinutes').lean();
  return held.filter((b) => visitPolicy.overlaps(b, start)).map((b) => b.serviceProvider);
}

/**
 * Among the nearest professionals, prefer the more reliable one when they're
 * about as close (within 2 km of the nearest). New professionals count as 80.
 */
function pickReliable(candidates) {
  if (!candidates.length) return null;
  const nearest = candidates[0].distanceMeters;
  const close = candidates.filter((c) => c.distanceMeters <= nearest + 2000);
  return close.reduce((best, c) => ((c.reliability ?? 80) > (best.reliability ?? 80) ? c : best), close[0]);
}

async function findCandidate(booking) {
  const coords = booking.serviceLocation && booking.serviceLocation.address && booking.serviceLocation.address.coordinates;
  if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) return null;

  const start = booking.dispatch && booking.dispatch.mode === 'ASAP' ? new Date() : (visitTime(booking) || new Date());
  const [busy, holding, held] = await Promise.all([
    busyStaffFor(booking),
    NurseBooking.distinct('dispatch.offeredTo', { 'dispatch.status': 'OFFERED', _id: { $ne: booking._id } }),
    // One calendar per person: planned sessions and home-care shifts block urgent offers too.
    require('./careSlotService').peopleHeldAround(start, 120).catch(() => [])
  ]);
  const toId = (v) => (typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v) ? new mongoose.Types.ObjectId(v) : v);
  const exclude = [...(booking.dispatch?.declined || []), ...busy, ...holding, ...held.map(toId)].filter(Boolean);

  const query = {
    ...staffAvailabilityService.discoverableFilter(),
    role: { $in: rolesFor(booking.serviceType) },
    _id: { $nin: exclude }
  };
  const gender = booking.dispatch && booking.dispatch.preferredGender;
  if (gender === 'FEMALE' || gender === 'MALE') query['careProfile.gender'] = gender;

  // The customer chose a professional (or a package locked one in): offer to
  // them first. Scheduled visits don't need them online right now (they get a
  // push and a longer window); "Book now" does.
  const requested = booking.dispatch && booking.dispatch.requestedProvider;
  if (requested && !exclude.some((id) => String(id) === String(requested))) {
    const who = await User.findOne({
      _id: requested,
      role: { $in: rolesFor(booking.serviceType) },
      isActive: { $ne: false },
      ...visitPolicy.VERIFIED_FILTER,
      ...(booking.dispatch.mode === 'ASAP' ? staffAvailabilityService.discoverableFilter() : {})
    }).select('_id name currentLocation').lean();
    if (who) {
      const loc = who.currentLocation && who.currentLocation.coordinates;
      const distanceMeters = loc ? haversineMeters(coords, { lat: loc[1], lng: loc[0] }) : 0;
      return { _id: who._id, name: who.name, distanceMeters, requested: true };
    }
  }
  if (requested && booking.dispatch.allowSubstitute === false) return null;

  const candidates = await User.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [coords.lng, coords.lat] },
        key: 'currentLocation',
        distanceField: 'distanceMeters',
        maxDistance: SEARCH_RADIUS_KM * 1000,
        spherical: true,
        query
      }
    },
    { $limit: 5 },
    { $project: { _id: 1, name: 1, distanceMeters: 1, reliability: '$careProfile.reliability.score' } }
  ]);
  return pickReliable(candidates);
}

/** What this professional would earn for the visit at their current monthly tier. */
async function payoutPreview(booking, staffId) {
  try {
    const rate = await require('./commissionService').previewCareRate(staffId);
    return pricingService.splitCareBooking({ ...(booking.toObject ? booking.toObject() : booking), commissionOverride: { rate } }).providerPayout;
  } catch {
    return pricingService.splitCareBooking(booking).providerPayout;
  }
}

async function notifyStaffOfOffer(staffId, booking, distanceKm) {
  try {
    const payout = await payoutPreview(booking, staffId);
    const title = `New visit · ${nice(booking.serviceType)}`;
    const body = `${distanceKm} km away · you earn ₹${payout} · accept within 45 s`;
    const data = { type: 'CARE_VISIT_REQUEST', bookingId: String(booking._id) };
    await Notification.create({
      user: staffId, recipientModel: 'User', type: 'CARE_VISIT_REQUEST', title, message: body,
      priority: 'URGENT', channels: { inApp: true, push: true }, metadata: data,
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000)
    });
    await pushNotificationService.sendToOwner({ owner: staffId, userType: 'provider', title, body, data }).catch(() => undefined);
  } catch (err) {
    logger.warn('Offer notification failed', { bookingId: String(booking._id), error: err.message });
  }
}

async function notifyPatientMatched(booking, staffName) {
  try {
    const title = `${staffName.split(' ')[0]} accepted your visit`;
    const body = `${nice(booking.serviceType)} · track them live in the app`;
    const data = { type: 'CARE_VISIT_MATCHED', bookingId: String(booking._id) };
    await Notification.create({
      user: booking.patient, recipientModel: 'Patient', type: 'CARE_VISIT_MATCHED', title, message: body,
      priority: 'HIGH', channels: { inApp: true, push: true }, metadata: data,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000)
    });
    await pushNotificationService.sendToOwner({ owner: booking.patient, userType: 'patient', title, body, data }).catch(() => undefined);
  } catch (err) {
    logger.warn('Match notification failed', { bookingId: String(booking._id), error: err.message });
  }
}

/** Nobody took it: tell the customer (reschedule / cancel free) and ops. */
async function notifyNoStaff(booking, customMessage) {
  try {
    const title = customMessage ? 'Your chosen professional isn’t available' : 'No nurse available right now';
    const body = customMessage || `We couldn't find anyone for your ${nice(booking.serviceType).toLowerCase()} visit. Pick another time, or cancel at no charge.`;
    const data = { type: 'CARE_VISIT_UPDATE', bookingId: String(booking._id) };
    await Notification.create({
      user: booking.patient, recipientModel: 'Patient', type: 'CARE_VISIT_UPDATE', title, message: body,
      priority: 'HIGH', channels: { inApp: true, push: true }, metadata: data, expiresAt: new Date(Date.now() + 7 * 86400000)
    });
    await pushNotificationService.sendToOwner({ owner: booking.patient, userType: 'patient', title, body, data }).catch(() => undefined);
    const ops = await User.find({ role: 'platform_admin', isActive: { $ne: false } }).select('_id').lean();
    await Promise.all(ops.map((o) => Notification.create({
      user: o._id, recipientModel: 'User', type: 'CARE_VISIT_UPDATE', priority: 'HIGH',
      title: 'Visit with no staff', message: `Booking ${booking._id} · ${nice(booking.serviceType)} found nobody. Assign manually?`,
      channels: { inApp: true, push: false }, metadata: data
    })));
  } catch (err) {
    logger.warn('No-staff notice failed', { bookingId: String(booking._id), error: err.message });
  }
}

/** Offer the visit to the next candidate (or mark SEARCHING / NO_STAFF). */
async function offerNext(bookingId) {
  const booking = await NurseBooking.findById(bookingId);
  if (!booking || booking.status !== 'REQUESTED' || booking.serviceProvider) return null;
  const d = booking.dispatch || {};
  if (['MATCHED', 'CANCELLED', 'NO_STAFF'].includes(d.status)) return null;
  // "Book now" gives up after 10 minutes; scheduled visits keep trying until
  // 30 minutes before they're due. Declines stop mattering once everyone's asked.
  const start = visitTime(booking);
  const expired = d.mode === 'SCHEDULED' && start
    ? Date.now() > start.getTime() - SCHEDULED_STOP_BEFORE_MS
    : d.startedAt && Date.now() - new Date(d.startedAt).getTime() > GIVE_UP_MS;
  if ((d.mode !== 'SCHEDULED' && (d.attempts || 0) >= MAX_ATTEMPTS) || expired) {
    const gaveUp = await NurseBooking.findOneAndUpdate(
      { _id: booking._id, status: 'REQUESTED', 'dispatch.status': { $in: ['SEARCHING', 'OFFERED'] } },
      { $set: { 'dispatch.status': 'NO_STAFF' }, $unset: { 'dispatch.offeredTo': 1, 'dispatch.offerExpiresAt': 1 } }
    );
    if (gaveUp) {
      logger.info('Dispatch gave up: no staff accepted', { bookingId: String(booking._id), attempts: d.attempts });
      await notifyNoStaff(booking);
    }
    return { status: 'NO_STAFF' };
  }

  const candidate = await findCandidate(booking);
  const chosen = d.requestedProvider;
  if (!candidate && chosen && d.allowSubstitute === false && (d.declined || []).some((id) => String(id) === String(chosen))) {
    const stopped = await NurseBooking.findOneAndUpdate(
      { _id: booking._id, status: 'REQUESTED', 'dispatch.status': { $in: ['IDLE', 'SEARCHING', 'OFFERED'] } },
      { $set: { 'dispatch.status': 'NO_STAFF' }, $unset: { 'dispatch.offeredTo': 1, 'dispatch.offerExpiresAt': 1 } }
    );
    if (stopped) await notifyNoStaff(booking, 'Your chosen professional can’t make this time. Pick another time, or let us send another verified professional.');
    return { status: 'NO_STAFF' };
  }
  if (!candidate) {
    await NurseBooking.updateOne(
      { _id: booking._id, status: 'REQUESTED', 'dispatch.status': { $in: ['IDLE', 'SEARCHING', 'OFFERED'] } },
      { $set: { 'dispatch.status': 'SEARCHING' }, $unset: { 'dispatch.offeredTo': 1, 'dispatch.offerExpiresAt': 1 } }
    );
    return { status: 'SEARCHING' };
  }

  const offered = await NurseBooking.findOneAndUpdate(
    { _id: booking._id, status: 'REQUESTED', serviceProvider: null, 'dispatch.status': { $in: ['IDLE', 'SEARCHING'] } },
    {
      $set: {
        'dispatch.status': 'OFFERED',
        'dispatch.offeredTo': candidate._id,
        'dispatch.offerExpiresAt': new Date(Date.now() + (candidate.requested && d.mode === 'SCHEDULED' ? REQUESTED_OFFER_TTL_MS : OFFER_TTL_MS))
      },
      $inc: { 'dispatch.attempts': 1 }
    },
    { new: true }
  );
  if (!offered) return null; // someone else moved it
  const distanceKm = Math.round((candidate.distanceMeters / 1000) * 10) / 10;
  await notifyStaffOfOffer(candidate._id, offered, distanceKm);
  logger.info('Visit offered', { bookingId: String(booking._id), staffId: String(candidate._id), distanceKm });
  return { status: 'OFFERED', staffId: candidate._id };
}

async function startDispatch(booking) {
  try {
    await NurseBooking.updateOne(
      { _id: booking._id, status: 'REQUESTED', 'dispatch.status': 'IDLE' },
      { $set: { 'dispatch.status': 'SEARCHING', 'dispatch.startedAt': new Date() } }
    );
    return await offerNext(booking._id);
  } catch (err) {
    logger.error('Dispatch start failed', { bookingId: String(booking._id), error: err.message });
    return null;
  }
}

/** Partner app: the offer waiting for me (if any). */
async function getMyOffer(staffId) {
  const booking = await NurseBooking.findOne({
    'dispatch.offeredTo': staffId,
    'dispatch.status': 'OFFERED',
    'dispatch.offerExpiresAt': { $gt: new Date() },
    status: 'REQUESTED'
  }).populate('supplies.pharmacyVendor', 'name address');
  if (!booking) return null;
  const me = await User.findById(staffId).select('currentLocation').lean();
  const dest = booking.serviceLocation?.address?.coordinates;
  let distanceKm = null;
  if (me?.currentLocation?.coordinates && dest && Number.isFinite(dest.lat)) {
    const [lng, lat] = me.currentLocation.coordinates;
    const rad = (x) => (x * Math.PI) / 180;
    const h = Math.sin(rad(dest.lat - lat) / 2) ** 2 + Math.cos(rad(lat)) * Math.cos(rad(dest.lat)) * Math.sin(rad(dest.lng - lng) / 2) ** 2;
    distanceKm = Math.round(6371 * 2 * Math.asin(Math.sqrt(h)) * 10) / 10;
  }
  const bring = (booking.supplies?.items || []).filter((i) => i.source === 'STAFF_BRINGS').map((i) => `${i.quantity} × ${i.name}`);
  return {
    bookingId: booking._id,
    serviceType: booking.serviceType,
    area: [booking.serviceLocation?.address?.street, booking.serviceLocation?.address?.pincode].filter(Boolean).join(', '),
    distanceKm,
    when: booking.dispatch.mode === 'ASAP' ? 'Now' : `${new Date(booking.scheduledDate).toISOString().slice(0, 10)} ${booking.scheduledTime}`,
    earnings: await payoutPreview(booking, staffId),
    patientFirstName: String(booking.patientDetails?.name || '').split(' ')[0] || undefined,
    supplies: bring.length ? { store: booking.supplies?.pharmacyVendor?.name, items: bring } : null,
    expiresAt: booking.dispatch.offerExpiresAt
  };
}

/**
 * Packages keep one professional: once someone takes a session, the later
 * sessions of the same series are offered to them first (and only them),
 * unless the customer already chose someone or changes it later.
 */
async function lockSeriesProvider(booking, staffId) {
  if (!booking.series || !booking.series.id) return 0;
  try {
    const res = await NurseBooking.updateMany(
      {
        'series.id': booking.series.id,
        'series.index': { $gt: booking.series.index || 0 },
        status: 'REQUESTED',
        'dispatch.requestedProvider': { $exists: false }
      },
      { $set: { 'dispatch.requestedProvider': staffId, 'dispatch.allowSubstitute': false } }
    );
    return res.modifiedCount;
  } catch (err) {
    logger.error('Series provider lock failed', { seriesId: booking.series.id, error: err.message });
    return 0;
  }
}

async function accept(bookingId, staffId) {
  const now = new Date();
  const pending = await NurseBooking.findById(bookingId).select('dispatch scheduledDate scheduledTime scheduledTimezoneOffsetMinutes').lean();
  if (pending) {
    const busy = await busyStaffFor(pending);
    if (busy.some((id) => String(id) === String(staffId))) {
      throw new ConflictError('You already have a visit around this time');
    }
  }
  const booking = await NurseBooking.findOneAndUpdate(
    {
      _id: bookingId,
      status: 'REQUESTED',
      'dispatch.status': 'OFFERED',
      'dispatch.offeredTo': staffId,
      'dispatch.offerExpiresAt': { $gt: now }
    },
    {
      $set: {
        serviceProvider: staffId,
        status: 'CONFIRMED',
        'dispatch.status': 'MATCHED',
        'dispatch.matchedAt': now,
        'statusTimestamps.assignedAt': now,
        'statusTimestamps.confirmedAt': now
      },
      $unset: { 'dispatch.offerExpiresAt': 1 }
    },
    { new: true }
  );
  if (!booking) throw new ConflictError('This request is no longer available');
  // Visit-scoped health data access (previously only admin assignment granted it).
  try {
    const start = visitTime(booking) || now;
    await lazyAccess().grantForVisit({
      patientId: booking.patient, providerId: staffId, bookingId: booking._id,
      expiresAt: new Date(Math.max(start.getTime() + 86400000, now.getTime() + 3600000))
    });
  } catch (err) {
    logger.error('Visit access grant failed', { bookingId: String(booking._id), error: err.message });
  }
  await lockSeriesProvider(booking, staffId);
  const staff = await User.findById(staffId).select('name').lean();
  await notifyPatientMatched(booking, (staff && staff.name) || 'Your nurse');
  logger.info('Visit matched', { bookingId: String(booking._id), staffId: String(staffId) });
  return booking;
}

async function decline(bookingId, staffId) {
  const booking = await NurseBooking.findOneAndUpdate(
    { _id: bookingId, status: 'REQUESTED', 'dispatch.status': 'OFFERED', 'dispatch.offeredTo': staffId },
    {
      $set: { 'dispatch.status': 'SEARCHING' },
      $addToSet: { 'dispatch.declined': staffId },
      $unset: { 'dispatch.offeredTo': 1, 'dispatch.offerExpiresAt': 1 }
    },
    { new: true }
  );
  if (!booking) throw new NotFoundError('Visit request');
  await offerNext(booking._id);
  return { declined: true };
}

/** Periodic: expire offers, retry searches, start scheduled visits in time. */
async function sweep() {
  const now = new Date();
  const expired = await NurseBooking.find({ 'dispatch.status': 'OFFERED', 'dispatch.offerExpiresAt': { $lte: now } }).select('_id dispatch.offeredTo').limit(100);
  for (const b of expired) {
    const moved = await NurseBooking.findOneAndUpdate(
      { _id: b._id, 'dispatch.status': 'OFFERED', 'dispatch.offerExpiresAt': { $lte: now } },
      {
        $set: { 'dispatch.status': 'SEARCHING' },
        $addToSet: { 'dispatch.declined': b.dispatch.offeredTo },
        $unset: { 'dispatch.offeredTo': 1, 'dispatch.offerExpiresAt': 1 }
      }
    );
    if (moved) await offerNext(b._id);
  }
  const searching = await NurseBooking.find({ 'dispatch.status': 'SEARCHING', status: 'REQUESTED' }).select('_id').limit(50);
  for (const b of searching) await offerNext(b._id);

  const soon = await NurseBooking.find({
    status: 'REQUESTED', serviceProvider: null, 'dispatch.mode': 'SCHEDULED', 'dispatch.status': 'IDLE',
    scheduledDate: { $lte: new Date(now.getTime() + 2 * 24 * 3600 * 1000) }
  }).limit(100);
  for (const b of soon) {
    const at = visitTime(b);
    if (at && at.getTime() - now.getTime() <= SCHEDULE_LEAD_MS) await startDispatch(b);
  }
}

let timer = null;
function startWorker() {
  if (timer) return;
  timer = setInterval(() => {
    sweep().catch((err) => {
      try { logger.error('Dispatch sweep failed', { error: err.message }); } catch { /* never crash the timer */ }
    });
  }, SWEEP_INTERVAL_MS);
  if (timer.unref) timer.unref();
}
function stopWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  OFFER_TTL_MS,
  lockSeriesProvider,
  SCHEDULE_LEAD_MS,
  busyStaffFor,
  findCandidate,
  pickReliable,
  startDispatch,
  offerNext,
  getMyOffer,
  accept,
  decline,
  sweep,
  startWorker,
  stopWorker,
  visitTime
};
