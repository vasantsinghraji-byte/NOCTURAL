/**
 * Saved cart (lib/cartStore.ts): same account only, a day at most, junk dropped.
 * Run: npm test (in frontends/mobile)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CART_MAX_AGE_MS, cartOwner, decodeCart, encodeCart, keepListed } from './cartStore.ts';

const STORE = 'a'.repeat(24);
const MED = 'b'.repeat(24);
const MED2 = 'c'.repeat(24);
const me = cartOwner({ kind: 'patient', email: 'Savitri@Example.com ' });
const now = 1_800_000_000_000;

test('a saved cart comes back for the same account', () => {
  const raw = encodeCart(me, STORE, { [MED]: 2 }, now);
  assert.deepEqual(decodeCart(raw, cartOwner({ kind: 'patient', email: 'savitri@example.com' }), now + 1000), { storeId: STORE, cart: { [MED]: 2 } });
});

test('another account on the same phone never sees it, and signed-out users save nothing', () => {
  const raw = encodeCart(me, STORE, { [MED]: 2 }, now);
  assert.equal(decodeCart(raw, cartOwner({ kind: 'patient', email: 'someone@else.com' }), now), null);
  assert.equal(decodeCart(raw, null, now), null);
  assert.equal(cartOwner({ kind: 'pharmacy', email: 'store@x.com' }), null);
  assert.equal(encodeCart(null, STORE, { [MED]: 1 }, now), null);
  assert.equal(encodeCart(me, STORE, {}, now), null);
});

test('a cart older than a day is dropped', () => {
  const raw = encodeCart(me, STORE, { [MED]: 1 }, now);
  assert.equal(decodeCart(raw, me, now + CART_MAX_AGE_MS + 1), null);
});

test('damaged or odd data is dropped line by line, quantities capped', () => {
  const raw = JSON.stringify({ owner: me, storeId: STORE, at: now, cart: { [MED]: 99, bad: 1, [MED2]: 0, ['d'.repeat(24)]: 1.5 } });
  assert.deepEqual(decodeCart(raw, me, now), { storeId: STORE, cart: { [MED]: 20 } });
  assert.equal(decodeCart('not json', me, now), null);
  assert.equal(decodeCart(JSON.stringify({ owner: me, storeId: '../x', at: now, cart: { [MED]: 1 } }), me, now), null);
});

test('lines the store no longer lists are dropped; an unchanged cart is the same object', () => {
  const cart = { [MED]: 1, [MED2]: 2 };
  assert.deepEqual(keepListed(cart, [MED]), { [MED]: 1 });
  assert.equal(keepListed(cart, [MED, MED2]), cart);
});
