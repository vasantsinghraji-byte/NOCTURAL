/**
 * The live order strip above the tabs (lib/activeItems.ts): which visit or
 * order it shows, in what words, and with the partner's unread message.
 * Run: npm test (in frontends/mobile)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickActive } from './activeItems.ts';

const TODAY = '2026-11-10';
const visit = (over: Record<string, unknown>) => ({
  _id: 'v1', serviceType: 'WOUND_DRESSING', scheduledDate: `${TODAY}T00:00:00.000Z`, scheduledTime: '11:00', status: 'CONFIRMED',
  dispatch: { mode: 'SCHEDULED', status: 'MATCHED' }, serviceProvider: { _id: 'n1', name: 'Asha Verma' }, ...over
}) as never;
const order = (over: Record<string, unknown>) => ({
  _id: 'o1', orderNumber: 'MR123', status: 'PREPARING', vendor: { _id: 's1', name: 'C-Scheme Pharmacy' }, items: [{}, {}], ...over
}) as never;

test('nothing active: no strip', () => {
  assert.deepEqual(pickActive([visit({ status: 'COMPLETED' }), visit({ status: 'CANCELLED' })], [order({ status: 'DELIVERED' })], [], TODAY), []);
});

test('a visit later this week stays in Bookings, not on the strip', () => {
  assert.deepEqual(pickActive([visit({ scheduledDate: '2026-11-13T00:00:00.000Z' })], [], [], TODAY), []);
});

test("today's confirmed visit shows who is coming and when", () => {
  const [item] = pickActive([visit({})], [], [], TODAY);
  assert.equal(item.title, 'Asha is coming at 11:00 am');
  assert.equal(item.kind, 'VISIT');
  assert.equal(item.live, false);
});

test('the most urgent wins: a nurse on the way beats an order being packed; the rest is counted', () => {
  const items = pickActive([visit({ status: 'EN_ROUTE', scheduledDate: '2026-11-09T00:00:00.000Z' })], [order({})], [], TODAY);
  assert.equal(items[0].title, 'Asha is on the way');
  assert.equal(items[0].live, true);
  assert.equal(items[0].more, 1);
  assert.equal(items[1].title, 'Packing your medicines');
});

test('Book now while searching, and when nobody is free', () => {
  assert.equal(pickActive([visit({ status: 'REQUESTED', dispatch: { mode: 'ASAP', status: 'SEARCHING' } })], [], [], TODAY)[0].title, 'Finding your professional…');
  assert.equal(pickActive([visit({ status: 'REQUESTED', dispatch: { mode: 'ASAP', status: 'NO_STAFF' } })], [], [], TODAY)[0].title, 'No professional free right now');
});

test("the partner's unread message shows on the strip", () => {
  const thread = { _id: 't1', kind: 'CARE', ref: 'v1', me: 'patient', with: { name: 'Asha Verma' }, lastMessage: { text: 'Reaching in 5 minutes', at: new Date().toISOString(), by: 'provider' }, unread: 2, open: true, updatedAt: '' } as never;
  const [item] = pickActive([visit({ status: 'EN_ROUTE' })], [], [thread], TODAY);
  assert.equal(item.unread, 2);
  assert.equal(item.subtitle, 'Asha: Reaching in 5 minutes');
});

test('medicine orders: waiting, packing, on the way', () => {
  assert.equal(pickActive([], [order({ status: 'PLACED' })], [], TODAY)[0].title, 'Waiting for C-Scheme Pharmacy to accept');
  const [out] = pickActive([], [order({ status: 'OUT_FOR_DELIVERY' })], [], TODAY);
  assert.equal(out.title, 'Medicines on the way');
  assert.equal(out.subtitle, 'Order MR123 · 2 items');
});
