/**
 * Care log: what happened during a home visit or shift (meals, medicines,
 * readings, activity, notes), written by the professional while there and
 * read by the customer and their Care Circle.
 */
const CareLog = require('../models/careLog');
const NurseBooking = require('../models/nurseBooking');
const familyService = require('./familyService');
const { NotFoundError, ValidationError, AuthorizationError } = require('../utils/errors');

const LATE_NOTE_HOURS = 12; // notes can still be added this long after the visit ends
const VITAL_KEYS = ['bpSys', 'bpDia', 'sugar', 'pulse', 'spo2', 'temp'];

function cleanVitals(v = {}) {
  const out = {};
  for (const k of VITAL_KEYS) {
    if (v[k] === undefined || v[k] === null || v[k] === '') continue;
    const n = Number(v[k]);
    if (!Number.isFinite(n)) throw new ValidationError(`Check the ${k} value`);
    out[k] = n;
  }
  if (!Object.keys(out).length) throw new ValidationError('Add at least one reading');
  if ((out.bpSys === undefined) !== (out.bpDia === undefined)) throw new ValidationError('Add both BP numbers, for example 120 / 80');
  return out;
}

const view = (log, booking) => ({
  bookingId: booking._id,
  serviceType: booking.serviceType,
  status: booking.status,
  scheduledDate: booking.scheduledDate,
  scheduledTime: booking.scheduledTime,
  professional: booking.serviceProvider && booking.serviceProvider.name,
  startedAt: booking.statusTimestamps && booking.statusTimestamps.startedAt,
  completedAt: booking.statusTimestamps && booking.statusTimestamps.completedAt,
  entries: ((log && log.entries) || []).map((e) => ({ _id: e._id, kind: e.kind, text: e.text, vitals: e.vitals, at: e.at }))
    .sort((a, b) => new Date(a.at) - new Date(b.at))
});

/** The professional on the visit adds an entry while there (or shortly after). */
async function addEntry(userId, bookingId, { kind, text, vitals } = {}) {
  if (!CareLog.KINDS.includes(kind)) throw new ValidationError('Choose what to log');
  const booking = await NurseBooking.findById(bookingId).select('patient serviceProvider status statusTimestamps marketplace serviceType scheduledDate scheduledTime').lean();
  if (!booking) throw new NotFoundError('Visit');
  if (String(booking.serviceProvider) !== String(userId)) throw new AuthorizationError('Only the professional on this visit can write its care log');
  const done = booking.status === 'COMPLETED' && booking.statusTimestamps && booking.statusTimestamps.completedAt;
  const lateOk = done && Date.now() - new Date(booking.statusTimestamps.completedAt).getTime() < LATE_NOTE_HOURS * 3600000;
  if (booking.status !== 'IN_PROGRESS' && !lateOk) throw new ValidationError('Start the visit first; notes can be added up to 12 hours after it ends');
  const entry = { kind, by: userId, at: new Date() };
  if (kind === 'VITALS') entry.vitals = cleanVitals(vitals);
  const note = text ? String(text).trim().slice(0, 300) : '';
  if (kind !== 'VITALS' && !note) throw new ValidationError('Write a short note');
  if (note) entry.text = note;
  await CareLog.updateOne(
    { booking: booking._id },
    { $push: { entries: entry }, $setOnInsert: { patient: booking.patient, caregiver: userId, plan: booking.marketplace && booking.marketplace.plan } },
    { upsert: true }
  );
  return getForStaff(userId, bookingId);
}

async function getForStaff(userId, bookingId) {
  const booking = await NurseBooking.findById(bookingId).populate('serviceProvider', 'name').lean();
  if (!booking) throw new NotFoundError('Visit');
  if (String(booking.serviceProvider && booking.serviceProvider._id) !== String(userId)) throw new AuthorizationError('Not your visit');
  return view(await CareLog.findOne({ booking: bookingId }).lean(), booking);
}

/** The customer, or someone in their Care Circle. */
async function getForPatient(viewerId, bookingId) {
  const booking = await NurseBooking.findById(bookingId).populate('serviceProvider', 'name').lean();
  if (!booking || !(await familyService.canSee(viewerId, booking.patient))) throw new NotFoundError('Visit');
  return view(await CareLog.findOne({ booking: bookingId }).lean(), booking);
}

/** Logs for every session of a plan (customer or Care Circle), newest first. */
async function planLogs(viewerId, planId) {
  const CarePlan = require('../models/carePlan');
  const plan = await CarePlan.findById(planId).select('patient').lean();
  if (!plan || !(await familyService.canSee(viewerId, plan.patient))) throw new NotFoundError('Plan');
  const logs = await CareLog.find({ plan: planId }).select('booking entries').lean();
  return logs.map((l) => ({ bookingId: l.booking, count: l.entries.length, last: l.entries.length ? l.entries[l.entries.length - 1].at : null }));
}

module.exports = { addEntry, getForStaff, getForPatient, planLogs, cleanVitals };
