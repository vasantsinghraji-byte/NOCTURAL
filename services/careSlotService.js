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

function resourceFor(store, mode) {
  if (store.format === 'SOLO') return { resource: 'PRACTITIONER', capacity: 1 };
  if (mode === 'HOME') return { resource: 'HOME', capacity: Math.max(1, (store.home && store.home.capacity) || 1) };
  return { resource: 'CLINIC', capacity: Math.max(1, (store.clinic && store.clinic.capacity) || 1) };
}

/** Opening ranges of a mode on a date, in minutes from midnight. */
function rangesFor(store, mode, date) {
  const day = WEEKDAYS[weekdayOf(date)];
  const hours = (mode === 'HOME' ? store.home && store.home.hours : store.clinic && store.clinic.hours) || [];
  return hours.filter((h) => h.day === day).map((h) => [toMinutes(h.open), toMinutes(h.close)]).filter(([a, b]) => b > a);
}

const onLeave = (store, date) => (store.leave || []).some((l) => date >= l.from && date <= l.to);

/** Does a session of `durationMinutes` at date/time fit the shop's hours for this mode? */
function fitsHours(store, mode, date, time, durationMinutes) {
  const start = toMinutes(time);
  const end = start + durationMinutes;
  return rangesFor(store, mode, date).some(([open, close]) => start >= open && end <= close);
}

/** Slot keys a session holds (home visits also hold the travel buffer after them). */
function slotKeysFor(store, mode, date, time, durationMinutes) {
  const { resource } = resourceFor(store, mode);
  const start = Math.floor(toMinutes(time) / GRID) * GRID;
  const buffer = mode === 'HOME' ? Number((store.home && store.home.bufferMinutes) || 0) : 0;
  const end = Math.min(24 * 60, toMinutes(time) + durationMinutes + buffer);
  const keys = [];
  for (let m = start; m < end; m += GRID) keys.push({ key: `${store._id}|${resource}|${date}|${toHHMM(m)}`, date, time: toHHMM(m), resource });
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
 * @returns {string[]} the keys held
 */
async function reserve(store, mode, date, time, durationMinutes, holder, { alreadyHeld = [] } = {}) {
  const { capacity } = resourceFor(store, mode);
  // Moving a session by a little: keys it already holds aren't taken twice.
  const skip = new Set(alreadyHeld);
  const slots = slotKeysFor(store, mode, date, time, durationMinutes).filter((s) => !skip.has(s.key));
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
    return [...held, ...slotKeysFor(store, mode, date, time, durationMinutes).map((s) => s.key).filter((k) => skip.has(k))];
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

/**
 * Free start times per day for a session of `durationMinutes`.
 * @returns {Array<{date, times: string[]}>}
 */
async function availability(store, mode, durationMinutes, { from, days = 7, step = 30, now = Date.now() } = {}) {
  const span = Math.min(Math.max(1, Number(days) || 7), 31);
  const start = from && /^\d{4}-\d{2}-\d{2}$/.test(from) && from > todayIst(now) ? from : todayIst(now);
  const dates = Array.from({ length: span }, (_, i) => addDays(start, i));
  const { capacity } = resourceFor(store, mode);
  const rows = await SlotReservation.find({ store: store._id, date: { $in: dates }, count: { $gte: capacity } }).select('key').lean();
  const full = new Set(rows.map((r) => r.key));
  return dates.map((date) => {
    const times = [];
    if (!onLeave(store, date)) {
      for (const [open, close] of rangesFor(store, mode, date)) {
        for (let m = Math.ceil(open / step) * step; m + durationMinutes <= close; m += step) {
          const time = toHHMM(m);
          if (bookabilityProblem(store, mode, date, time, durationMinutes, now)) continue;
          if (slotKeysFor(store, mode, date, time, durationMinutes).some((s) => full.has(s.key))) continue;
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

module.exports = {
  GRID,
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
