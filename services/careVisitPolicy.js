/**
 * Home-visit rules in one place (pure functions, unit-tested):
 *   cancellation   who may cancel when, and what it costs
 *   booking window when a visit may be booked for
 *   overlap        a nurse can't hold two visits at the same time
 *   contact        when a nurse may see the customer's phone number
 */

const ADMIN_ROLES = ['admin', 'platform_admin'];
const STAFF_ROLES = ['nurse', 'physiotherapist', 'medical_staff'];

const num = (name, fallback) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const getVisitPolicy = () => ({
  // Customer cancels after the nurse has set off: covers their trip.
  lateCancelFee: num('CARE_LATE_CANCEL_FEE', 100),
  minLeadMinutes: num('CARE_MIN_LEAD_MINUTES', 30),
  maxAdvanceDays: num('CARE_MAX_ADVANCE_DAYS', 30),
  // A visit blocks the nurse for this long around its start time.
  blockMinutes: num('CARE_VISIT_BLOCK_MINUTES', 120),
  // Nurse sees the customer's phone until this long after completing.
  contactGraceHours: num('CARE_CONTACT_GRACE_HOURS', 2)
});

const isAdminRole = (role) => ADMIN_ROLES.includes(role);

/** When the visit is due: scheduledDate (calendar day) + HH:MM in its UTC offset. */
function visitStart(booking) {
  const d = new Date(booking.scheduledDate);
  if (Number.isNaN(d.getTime())) return null;
  const ymd = d.toISOString().slice(0, 10);
  const [h, m] = String(booking.scheduledTime || '00:00').split(':').map(Number);
  const offset = Number.isInteger(booking.scheduledTimezoneOffsetMinutes) ? booking.scheduledTimezoneOffsetMinutes : 330;
  return new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10), h || 0, m || 0) - offset * 60000);
}

/**
 * What a cancellation by this actor would do right now.
 * Returns { allowed, fee, reason? }. Admins can always cancel, for free.
 */
function cancellationQuote(booking, { role, isPatient, isProvider }, policy = getVisitPolicy()) {
  const status = booking.status;
  if (['COMPLETED', 'CANCELLED'].includes(status)) return { allowed: false, fee: 0, reason: 'This visit is already closed' };
  if (isAdminRole(role)) return { allowed: true, fee: 0 };
  if (isProvider) {
    // The nurse "can't make it": the visit goes back to searching (see bookingService.releaseVisit).
    if (status === 'IN_PROGRESS') return { allowed: false, fee: 0, reason: 'The visit has started. Complete it, or use SOS if something is wrong' };
    return { allowed: true, fee: 0, releases: true };
  }
  if (isPatient) {
    if (status === 'IN_PROGRESS') return { allowed: false, fee: 0, reason: 'The visit has started, so it can’t be cancelled. Use SOS or call support if something is wrong' };
    if (status === 'EN_ROUTE') return { allowed: true, fee: policy.lateCancelFee, reason: 'Your nurse is already on the way' };
    return { allowed: true, fee: 0 };
  }
  return { allowed: false, fee: 0, reason: 'Not allowed to cancel this visit' };
}

/**
 * Normalise and check the requested visit time. ASAP visits are "now"
 * (server time, so a wrong phone clock can't book the past); scheduled ones
 * must sit between minLead and maxAdvance. Returns { start } or throws message.
 */
function checkBookingWindow({ mode, scheduledDate, scheduledTime, scheduledTimezoneOffsetMinutes }, now = new Date(), policy = getVisitPolicy()) {
  if (mode === 'ASAP') return { start: now, asap: true };
  const start = visitStart({ scheduledDate, scheduledTime, scheduledTimezoneOffsetMinutes });
  if (!start) return { error: 'Pick a valid date and time' };
  if (start.getTime() < now.getTime() + policy.minLeadMinutes * 60000) {
    return { error: `Pick a time at least ${policy.minLeadMinutes} minutes from now, or choose "Book now"` };
  }
  if (start.getTime() > now.getTime() + policy.maxAdvanceDays * 24 * 3600000) {
    return { error: `Visits can be booked up to ${policy.maxAdvanceDays} days ahead` };
  }
  return { start };
}

/** Do two visits collide for one nurse? Active visits (en route / in progress) always block. */
function overlaps(existing, candidateStart, policy = getVisitPolicy()) {
  if (['EN_ROUTE', 'IN_PROGRESS'].includes(existing.status) && Math.abs(candidateStart - Date.now()) < policy.blockMinutes * 60000) return true;
  const start = visitStart(existing);
  if (!start) return false;
  return Math.abs(start.getTime() - candidateStart.getTime()) < policy.blockMinutes * 60000;
}

/** Nurse may see the customer's phone only around the visit. */
function providerMaySeePhone(booking, now = new Date(), policy = getVisitPolicy()) {
  if (['CONFIRMED', 'EN_ROUTE', 'IN_PROGRESS'].includes(booking.status)) return true;
  if (booking.status === 'COMPLETED') {
    const done = booking.statusTimestamps && booking.statusTimestamps.completedAt;
    return !!done && now.getTime() - new Date(done).getTime() < policy.contactGraceHours * 3600000;
  }
  return false;
}

/** All three core checks done: may go online and receive visits. */
const isVerifiedStaff = (user) => {
  const v = user && user.careProfile && user.careProfile.verification;
  return !!(v && v.idVerified && v.policeVerified && v.councilVerified);
};

const VERIFIED_FILTER = {
  'careProfile.verification.idVerified': true,
  'careProfile.verification.policeVerified': true,
  'careProfile.verification.councilVerified': true
};

module.exports = {
  ADMIN_ROLES,
  STAFF_ROLES,
  getVisitPolicy,
  isAdminRole,
  visitStart,
  cancellationQuote,
  checkBookingWindow,
  overlaps,
  providerMaySeePhone,
  isVerifiedStaff,
  VERIFIED_FILTER
};
