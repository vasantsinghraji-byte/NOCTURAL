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

const NurseBooking = require('../models/nurseBooking');
const User = require('../models/user');
const Notification = require('../models/notification');
const staffAvailabilityService = require('./staffAvailabilityService');
const pushNotificationService = require('./pushNotificationService');
const pricingService = require('./pricingService');
const logger = require('../utils/logger');
const { ConflictError, NotFoundError } = require('../utils/errors');

const OFFER_TTL_MS = 45 * 1000;
const MAX_ATTEMPTS = 8;
const SEARCH_RADIUS_KM = 12;
const GIVE_UP_MS = 10 * 60 * 1000;
const SCHEDULE_LEAD_MS = 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 10 * 1000;
const BUSY_STATUSES = ['CONFIRMED', 'EN_ROUTE', 'IN_PROGRESS'];
const PHYSIO_SERVICES = new Set([
  'PHYSIOTHERAPY_SESSION', 'POST_SURGERY_REHAB', 'SPORTS_INJURY', 'SPORTS_INJURY_THERAPY', 'BACK_PAIN_THERAPY',
  'KNEE_PAIN_THERAPY', 'STROKE_REHAB', 'GERIATRIC_PHYSIO', 'PEDIATRIC_PHYSIO', 'NEUROLOGICAL_REHAB', 'PHYSIO_PACKAGE_10'
]);

const rolesFor = (serviceType) => (PHYSIO_SERVICES.has(serviceType) ? ['physiotherapist'] : ['nurse', 'medical_staff']);
const nice = (serviceType) => String(serviceType || '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/** When the visit is due (scheduledDate + scheduledTime in its timezone). */
function visitTime(booking) {
  const d = new Date(booking.scheduledDate);
  if (Number.isNaN(d.getTime())) return null;
  const ymd = d.toISOString().slice(0, 10);
  const [h, m] = String(booking.scheduledTime || '00:00').split(':').map(Number);
  const offset = Number.isInteger(booking.scheduledTimezoneOffsetMinutes) ? booking.scheduledTimezoneOffsetMinutes : 330;
  const utc = Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)), h || 0, m || 0) - offset * 60000;
  return new Date(utc);
}

async function findCandidate(booking) {
  const coords = booking.serviceLocation && booking.serviceLocation.address && booking.serviceLocation.address.coordinates;
  if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) return null;

  const [busy, holding] = await Promise.all([
    NurseBooking.distinct('serviceProvider', { status: { $in: BUSY_STATUSES }, serviceProvider: { $ne: null } }),
    NurseBooking.distinct('dispatch.offeredTo', { 'dispatch.status': 'OFFERED', _id: { $ne: booking._id } })
  ]);
  const exclude = [...(booking.dispatch?.declined || []), ...busy, ...holding].filter(Boolean);

  const query = {
    ...staffAvailabilityService.discoverableFilter(),
    role: { $in: rolesFor(booking.serviceType) },
    _id: { $nin: exclude }
  };
  const gender = booking.dispatch && booking.dispatch.preferredGender;
  if (gender === 'FEMALE' || gender === 'MALE') query['careProfile.gender'] = gender;

  const [candidate] = await User.aggregate([
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
    { $limit: 1 },
    { $project: { _id: 1, name: 1, distanceMeters: 1 } }
  ]);
  return candidate || null;
}

async function notifyStaffOfOffer(staffId, booking, distanceKm) {
  try {
    const payout = pricingService.splitCareBooking(booking).providerPayout;
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

/** Offer the visit to the next candidate (or mark SEARCHING / NO_STAFF). */
async function offerNext(bookingId) {
  const booking = await NurseBooking.findById(bookingId);
  if (!booking || booking.status !== 'REQUESTED' || booking.serviceProvider) return null;
  const d = booking.dispatch || {};
  if (['MATCHED', 'CANCELLED', 'NO_STAFF'].includes(d.status)) return null;

  const expired = d.startedAt && Date.now() - new Date(d.startedAt).getTime() > GIVE_UP_MS;
  if ((d.attempts || 0) >= MAX_ATTEMPTS || expired) {
    await NurseBooking.updateOne(
      { _id: booking._id, status: 'REQUESTED', 'dispatch.status': { $in: ['SEARCHING', 'OFFERED'] } },
      { $set: { 'dispatch.status': 'NO_STAFF' }, $unset: { 'dispatch.offeredTo': 1, 'dispatch.offerExpiresAt': 1 } }
    );
    logger.info('Dispatch gave up: no staff accepted', { bookingId: String(booking._id), attempts: d.attempts });
    return { status: 'NO_STAFF' };
  }

  const candidate = await findCandidate(booking);
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
        'dispatch.offerExpiresAt': new Date(Date.now() + OFFER_TTL_MS)
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
    earnings: pricingService.splitCareBooking(booking).providerPayout,
    patientFirstName: String(booking.patientDetails?.name || '').split(' ')[0] || undefined,
    supplies: bring.length ? { store: booking.supplies?.pharmacyVendor?.name, items: bring } : null,
    expiresAt: booking.dispatch.offerExpiresAt
  };
}

async function accept(bookingId, staffId) {
  const now = new Date();
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
