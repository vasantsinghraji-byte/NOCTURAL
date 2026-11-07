/**
 * Tester feedback fixes (Nov 2026): same-day slots and the Hindi dictionary.
 * Run: npm test (in frontends/mobile)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_SLOTS, earliestTodayMinutes, fmtVisitDay, istYmd, slotOpen } from './visitSlots.ts';
import { translatePhrase } from './phrases.ts';
import { HI_PHRASES } from './hiPhrases.ts';

// 2026-11-05 09:10 IST = 03:40 UTC
const MORNING_IST = Date.UTC(2026, 10, 5, 3, 40);
const today = '2026-11-05';

test('same day: slots at least 30 minutes away can be booked, earlier ones cannot', () => {
  const earliest = earliestTodayMinutes(0, MORNING_IST); // 09:40
  const open = ALL_SLOTS.filter((tm) => slotOpen(today, tm, today, earliest));
  assert.deepEqual(open, ['10:00', '11:00', '12:30', '14:00', '15:30', '17:00', '18:30', '20:00']);
  assert.equal(slotOpen(today, '09:00', today, earliest), false);
});

test('a service asking for more notice hides more of today; other days stay fully open', () => {
  const earliest = earliestTodayMinutes(4, MORNING_IST); // 13:10
  assert.deepEqual(ALL_SLOTS.filter((tm) => slotOpen(today, tm, today, earliest)), ['14:00', '15:30', '17:00', '18:30', '20:00']);
  assert.equal(ALL_SLOTS.every((tm) => slotOpen('2026-11-06', tm, today, earliest)), true);
});

test('exactly 30 minutes ahead still counts (the server accepts it); later in the evening nothing is left', () => {
  const at1930 = earliestTodayMinutes(0, Date.UTC(2026, 10, 5, 14, 0)); // 19:30 IST
  assert.deepEqual(ALL_SLOTS.filter((tm) => slotOpen(today, tm, today, at1930)), ['20:00']);
  const at1945 = earliestTodayMinutes(0, Date.UTC(2026, 10, 5, 14, 15)); // 19:45 IST
  assert.equal(ALL_SLOTS.some((tm) => slotOpen(today, tm, today, at1945)), false);
});

test('"today" is India\'s date even when the phone is abroad', () => {
  // 2026-11-05 20:00 UTC is already 2026-11-06 01:30 in India.
  assert.equal(istYmd(new Date(Date.UTC(2026, 10, 5, 20, 0) + 330 * 60000)), '2026-11-06');
});

test('the review screen shows the picked day even on a phone behind UTC', () => {
  const before = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    assert.match(fmtVisitDay('2026-11-05'), /5 Nov/);
    assert.match(fmtVisitDay('2026-11-05'), /Thu/);
    // The old way showed the day before here.
    assert.match(new Date('2026-11-05').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), /4 Nov/);
  } finally {
    if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
  }
});

test('translation keeps surrounding spaces and leaves unknown text alone', () => {
  assert.equal(translatePhrase('Bookings'), 'बुकिंग');
  assert.equal(translatePhrase('  Upload later '), '  बाद में अपलोड करें ');
  assert.equal(translatePhrase('Kamla Devi'), 'Kamla Devi');
  assert.equal(translatePhrase('Wound   Dressing'), 'घाव की पट्टी');
});

test('the main screens\' labels all have Hindi', () => {
  for (const label of ['Home', 'Care', 'Pharmacy', 'Bookings', 'Account', 'Staff visits', 'Medicine orders', 'Saved addresses', 'Easy mode',
    'Language', 'Book visit', 'Pick a time', 'Upload later', 'Email or mobile number', 'Search medicines in Pharmacy', 'Exit demo']) {
    assert.ok(HI_PHRASES[label], `missing Hindi for "${label}"`);
  }
});

test('the dictionary has no duplicate or empty entries', () => {
  const src = readFileSync(join(__dirname, 'hiPhrases.ts'), 'utf8');
  const keys = [...src.matchAll(/^\s+'((?:[^'\\]|\\.)*)':/gm)].map((m) => m[1]);
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
  assert.deepEqual(dupes, []);
  for (const [en, hi] of Object.entries(HI_PHRASES)) assert.ok(hi.trim(), `empty Hindi for "${en}"`);
});
