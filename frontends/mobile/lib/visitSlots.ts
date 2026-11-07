/**
 * Visit times on the booking screen (app/book.tsx). Visits are always in
 * India time, so "today" and "now" are India's, whatever the phone's zone.
 */
export const SLOTS: Record<string, string[]> = {
  Morning: ['08:00', '09:00', '10:00', '11:00'],
  Afternoon: ['12:30', '14:00', '15:30'],
  Evening: ['17:00', '18:30', '20:00']
};
export const ALL_SLOTS = Object.values(SLOTS).flat();

/** The server wants at least 30 minutes' notice; some services ask for more. */
export const MIN_LEAD_MINUTES = 30;

/** India time as a Date whose getUTC* fields read IST. */
export const istNow = (nowMs = Date.now()) => new Date(nowMs + 330 * 60000);
export const istYmd = (d: Date) => d.toISOString().slice(0, 10);
export const slotMinutes = (tm: string) => Number(tm.slice(0, 2)) * 60 + Number(tm.slice(3, 5));

/** Minutes after midnight (IST) of the first time that can still be booked today. */
export function earliestTodayMinutes(advanceBookingHours = 0, nowMs = Date.now()) {
  const now = istNow(nowMs);
  return now.getUTCHours() * 60 + now.getUTCMinutes() + Math.max(MIN_LEAD_MINUTES, advanceBookingHours * 60);
}

/** Can this slot be booked? Any slot on a later day; today only with enough notice. */
export const slotOpen = (day: string, tm: string, todayKey: string, earliestToday: number) => day !== todayKey || slotMinutes(tm) >= earliestToday;
