/**
 * Care marketplace calendar: which times a shop can take, and atomic slot
 * reservations so two customers can never take the last place at once.
 *
 *   grid       15 minutes; a session holds every slot it overlaps, and a home
 *              visit also holds the shop's travel buffer after it
 *   resource   SOLO shop → the one professional (home and clinic share them)
 *              CLINIC/LAB → CLINIC (capacity = beds/physios) and HOME (visiting staff)
 *   reserve    per slot: conditional $inc (count < capacity) with upsert; a full
 *              slot fails the filter, the upsert hits the unique key → "taken"
 *
 * All dates and times are India time ("YYYY-MM-DD", "HH:MM").
 */

const SlotReservation = require('../models/slotReservation');
const { WEEKDAYS } = require('../constants/marketplace');
const { getVisitPolicy } = require('./careVisitPolicy');
const { ConflictError, ValidationError } = require('../utils/errors');

const GRID = 15;

/** "That time was just taken" with a code the apps act on (pick another time). */
function slotTaken(date, time) {
  const err = new ConflictError(`${time} on ${date} was just taken. Pick another time.`);
  err.code = 'SLOT_TAKEN';
  err.publicDetails = { dates: [date] };
  return err;
}
const IST_OFFSET_MIN = 330;

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
};
const toHHMM = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
const weekdayOf = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();
const addDays = (date, n) => new Date(new Date(`${date}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const todayIst = (now = Date.now()) => new Date(now + IST_OFFSET_MIN * 60000).toISOString().slice(0, 10);
/** UTC instant of an IST date + time. */
const istInstant = (date, time) => new Date(`${date}T${time}:00+05:30`);

/**
 * Professionals a shop assigns by name: a clinic or home-care agency's active
 * practitioners / caregivers. Home bookings with such a shop get ONE named
 * person for every session (the same caregiver comes every day).
 */
function practitionersOf(store) {
  return (store.members || [])
    .filter((m) => m.active !== false && ['PRACTITIONER', 'CAREGIVER'].includes(m.role))
    .map((m) => String(m.user));
}

/** Does this booking get a named professional (with their own calendar)? */
const assignsPractitioner = (store, mode) => store.format !== 'SOLO' && mode === 'HOME' && practitionersOf(store).length > 0;

// A person's calendar is theirs, not the shop's: a physio with a solo practice
// who also works at a clinic, or a caregiver with two agencies, can never be
// booked twice for the same time.
function resourceFor(store, mode, practitioner) {
  if (store.format === 'SOLO') return { resource: `person:${store.owner}`, capacity: 1 };
  if (practitioner) return { resource: `person:${practitioner}`, capacity: 1 };
  if (mode === 'HOME') return { resource: 'HOME', capacity: Math.max(1, (store.home && store.home.capacity) || 1) };
  return { resource: 'CLINIC', capacity: Math.max(1, (store.clinic && store.clinic.capacity) || 1) };
}

/** Opening ranges of a mode on a date, in minutes from midnight ("23:59" counts as midnight). */
function rangesFor(store, mode, date) {
  const day = WEEKDAYS[weekdayOf(date)];
  const hours = (mode === 'HOME' ? store.home && store.home.hours : store.clinic && store.clinic.hours) || [];
  return hours.filter((h) => h.day === day)
    .map((h) => [toMinutes(h.open), h.close === '23:59' ? 1440 : toMinutes(h.close)])
    .filter(([a, b]) => b > a);
}

const onLeave = (store, date) => (store.leave || []).some((l) => date >= l.from && date <= l.to);

/**
 * Does a session fit the shop's hours? A shift past midnight (a night
 * attendant 20:00–08:00, a 24-hour live-in) must run to midnight and continue
 * in the next day's hours from 00:00.
 */
function fitsHours(store, mode, date, time, durationMinutes) {
  const start = toMinutes(time);
  const end = start + durationMinutes;
  if (end <= 1440) return rangesFor(store, mode, date).some(([open, close]) => start >= open && end <= close);
  if (durationMinutes > 1440) return false;
  const tonight = rangesFor(store, mode, date).some(([open, close]) => start >= open && close === 1440);
  const tomorrow = rangesFor(store, mode, addDays(date, 1)).some(([open, close]) => open === 0 && end - 1440 <= close);
  return tonight && tomorrow;
}

/** Travel buffer after a home visit (not after long shifts: no rushing to the next house). */
const bufferFor = (store, mode, durationMinutes) => (mode === 'HOME' && durationMinutes < 360 ? Number((store.home && store.home.bufferMinutes) || 0) : 0);

/** Slot keys a session holds; past midnight they continue on the next date. */
function slotKeysFor(store, mode, date, time, durationMinutes, practitioner) {
  const { resource } = resourceFor(store, mode, practitioner);
  const start = Math.floor(toMinutes(time) / GRID) * GRID;
  const end = Math.min(2 * 1440, toMinutes(time) + durationMinutes + bufferFor(store, mode, durationMinutes));
  const keys = [];
  for (let m = start; m < end; m += GRID) {
    const d = m >= 1440 ? addDays(date, 1) : date;
    const hhmm = toHHMM(m % 1440);
    const prefix = resource.startsWith('person:') ? resource : `${store._id}|${resource}`;
    keys.push({ key: `${prefix}|${d}|${hhmm}`, date: d, time: hhmm, resource });
  }
  return keys;
}

/** Why a time can't be booked (hours, leave, too soon), or null. Doesn't check capacity. */
function bookabilityProblem(store, mode, date, time, durationMinutes, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time))) return 'Pick a valid date and time';
  if (onLeave(store, date)) return `Not available on ${date} (on leave)`;
  if (!fitsHours(store, mode, date, time, durationMinutes)) return `${time} on ${date} is outside ${mode === 'HOME' ? 'home-visit' : 'clinic'} hours`;
  const lead = getVisitPolicy().minLeadMinutes;
  if (istInstant(date, time).getTime() < now + lead * 60000) return `Pick a time at least ${lead} minutes from now`;
  return null;
}

/**
 * Reserve every slot of a session for `holder` (a booking id). All or nothing.
 * `practitioner`: hold that person's own calendar (named caregiver / physio).
 * @returns {string[]} the keys held
 */
async function reserve(store, mode, date, time, durationMinutes, holder, { alreadyHeld = [], practitioner } = {}) {
  const { capacity } = resourceFor(store, mode, practitioner);
  // Moving a session by a little: keys it already holds aren't taken twice.
  const skip = new Set(alreadyHeld);
  const all = slotKeysFor(store, mode, date, time, durationMinutes, practitioner);
  const slots = all.filter((s) => !skip.has(s.key));
  const held = [];
  try {
    for (const s of slots) {
      try {
        const doc = await SlotReservation.findOneAndUpdate(
          { key: s.key, count: { $lt: capacity } },
          { $inc: { count: 1 }, $push: { holders: String(holder) }, $setOnInsert: { store: store._id, resource: s.resource, date: s.date, time: s.time, capacity } },
          { upsert: true, returnDocument: 'after', projection: { _id: 1 } }
        );
        if (!doc) throw slotTaken(date, time);
      } catch (err) {
        if (err && err.code === 11000) throw slotTaken(date, time);
        throw err;
      }
      held.push(s.key);
    }
    return [...held, ...all.map((s) => s.key).filter((k) => skip.has(k))];
  } catch (err) {
    await release(held, holder);
    throw err;
  }
}

/** Give back slots held by `holder`. Safe to call twice. */
async function release(keys, holder) {
  for (const key of keys || []) {
    await SlotReservation.updateOne({ key, holders: String(holder) }, { $inc: { count: -1 }, $pull: { holders: String(holder) } });
  }
}

/** Keys that are full on these dates (and the day after, for night shifts). */
async function fullKeys(store, dates) {
  const span = [...new Set(dates.flatMap((d) => [d, addDays(d, 1)]))];
  const people = [store.format === 'SOLO' ? String(store.owner) : null, ...practitionersOf(store)].filter(Boolean).map((p) => `person:${p}`);
  const rows = await SlotReservation.find({
    date: { $in: span },
    $or: [{ store: store._id }, ...(people.length ? [{ resource: { $in: people } }] : [])],
    $expr: { $gte: ['$count', '$capacity'] }
  }).select('key').lean();
  return new Set(rows.map((r) => r.key));
}

/**
 * The first named professional free at `time` on ALL of `dates` (so the same
 * person comes every time), 'POOL' for shops without named assignment when
 * there's room, or null when nobody is free.
 */
async function freePractitioner(store, mode, dates, time, durationMinutes) {
  const full = await fullKeys(store, dates);
  const people = assignsPractitioner(store, mode) ? practitionersOf(store) : [null];
  for (const p of people) {
    const ok = dates.every((d) => !slotKeysFor(store, mode, d, time, durationMinutes, p).some((s) => full.has(s.key)));
    if (ok) return p || 'POOL';
  }
  return null;
}

/**
 * Free start times per day for a session of `durationMinutes`. For shops that
 * assign a named professional, a time is free when at least one of them is.
 * @returns {Array<{date, times: string[]}>}
 */
async function availability(store, mode, durationMinutes, { from, days = 7, step = 30, now = Date.now() } = {}) {
  const span = Math.min(Math.max(1, Number(days) || 7), 31);
  const start = from && /^\d{4}-\d{2}-\d{2}$/.test(from) && from > todayIst(now) ? from : todayIst(now);
  const dates = Array.from({ length: span }, (_, i) => addDays(start, i));
  const full = await fullKeys(store, dates);
  const people = assignsPractitioner(store, mode) ? practitionersOf(store) : [null];
  return dates.map((date) => {
    const times = [];
    if (!onLeave(store, date)) {
      for (const [open, close] of rangesFor(store, mode, date)) {
        // Night shifts may start late and run past midnight (fitsHours checks the rest).
        const last = close === 1440 ? 1440 - step : close - durationMinutes;
        for (let m = Math.ceil(open / step) * step; m <= last; m += step) {
          const time = toHHMM(m);
          if (bookabilityProblem(store, mode, date, time, durationMinutes, now)) continue;
          if (!people.some((p) => !slotKeysFor(store, mode, date, time, durationMinutes, p).some((s) => full.has(s.key)))) continue;
          times.push(time);
        }
      }
    }
    return { date, times: [...new Set(times)].sort() };
  });
}

/**
 * Session dates for a plan: the chosen weekdays from the start date, skipping
 * leave days, until `sessions` dates are found or `untilDate` is passed.
 */
function planDates({ startDate, weekdays, sessions, untilDate, store }) {
  const days = [...new Set((weekdays || []).map(Number))].filter((d) => d >= 0 && d <= 6);
  if (!days.length) throw new ValidationError('Pick at least one day of the week');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate))) throw new ValidationError('Pick a start date');
  const dates = [];
  for (let d = startDate; dates.length < sessions && d <= untilDate; d = addDays(d, 1)) {
    if (days.includes(weekdayOf(d)) && !(store && onLeave(store, d))) dates.push(d);
  }
  return dates;
}

/**
 * People whose own calendar is held at any point from `start` for `minutes`
 * (planned marketplace sessions and home-care shifts, including their travel
 * buffer). Urgent "book now" dispatch skips them, so one person never gets
 * two places at once.
 * @returns {string[]} user ids
 */
async function peopleHeldAround(start = new Date(), minutes = 120) {
  const SlotReservation = require('../models/slotReservation');
  const ist = new Date(start.getTime() + 330 * 60000);
  const day = ist.toISOString().slice(0, 10);
  const from = Math.floor((ist.getUTCHours() * 60 + ist.getUTCMinutes()) / GRID) * GRID;
  const blocks = [];
  for (let m = from; m < from + minutes; m += GRID) {
    blocks.push({ date: m >= 1440 ? addDays(day, 1) : day, time: toHHMM(m % 1440) });
  }
  if (!blocks.length) return [];
  const rows = await SlotReservation.find({ resource: /^person:/, count: { $gt: 0 }, $or: blocks }).select('resource').lean();
  return [...new Set(rows.map((r) => r.resource.slice('person:'.length)))];
}

module.exports = {
  peopleHeldAround,
  GRID,
  practitionersOf,
  assignsPractitioner,
  freePractitioner,
  resourceFor,
  rangesFor,
  fitsHours,
  onLeave,
  slotKeysFor,
  bookabilityProblem,
  reserve,
  release,
  availability,
  planDates,
  todayIst,
  addDays,
  istInstant,
  weekdayOf
};
