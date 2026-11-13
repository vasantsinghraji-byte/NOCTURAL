/**
 * Double-tap / retry safety for money requests (repeatGuard.ts).
 * Run: npm test (in frontends/mobile)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RepeatGuard, REPEAT_WINDOW_MS, isMoneyRequest } from '../../shared/src/repeatGuard.ts';

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

test('money routes are recognised; reads and other writes are not', () => {
  assert.equal(isMoneyRequest('POST', '/pharmacy/orders'), true);
  assert.equal(isMoneyRequest('POST', '/pharmacy/orders/abc/payment'), true);
  assert.equal(isMoneyRequest('POST', '/pharmacy/orders/abc/payment/verify'), true);
  // Adding items changes what the customer pays: one request per double tap.
  assert.equal(isMoneyRequest('POST', '/pharmacy/orders/abc/items'), true);
  assert.equal(isMoneyRequest('POST', '/bookings'), true);
  assert.equal(isMoneyRequest('PUT', '/bookings/abc/cancel'), true);
  assert.equal(isMoneyRequest('POST', '/marketplace/labs/orders/abc/payment/order'), true);
  assert.equal(isMoneyRequest('POST', '/membership/verify'), true);
  assert.equal(isMoneyRequest('POST', '/partners/me/withdrawals'), true);
  assert.equal(isMoneyRequest('GET', '/pharmacy/orders'), false);
  assert.equal(isMoneyRequest('POST', '/chat/threads'), false);
  assert.equal(isMoneyRequest('POST', '/pharmacy/delivery-quote'), false);
});

test('two taps while the first request is running send ONE request and both get its result', async () => {
  const guard = new RepeatGuard();
  const fp = RepeatGuard.fingerprint('POST', '/pharmacy/orders', { vendorId: 'v1', items: [{ id: 'm1', q: 1 }] });
  const sent: string[] = [];
  const reply = deferred<{ order: string }>();
  const send = (key: string) => { sent.push(key); return reply.promise; };

  const first = guard.run(fp, send);
  const second = guard.run(fp, send); // the double tap
  reply.resolve({ order: 'ORD-1' });

  assert.deepEqual(await first, { order: 'ORD-1' });
  assert.deepEqual(await second, { order: 'ORD-1' });
  assert.equal(sent.length, 1);
});

test('the same request again within 2 minutes reuses the Idempotency-Key (server replays, no second order)', async () => {
  let t = 1_000_000;
  const guard = new RepeatGuard(() => t);
  const fp = RepeatGuard.fingerprint('POST', '/pharmacy/orders/o1/payment', undefined);
  const keys: string[] = [];
  await guard.run(fp, async (key) => { keys.push(key); return 'ok'; });
  t += 30_000;
  await guard.run(fp, async (key) => { keys.push(key); return 'ok'; });
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
});

test('after the window a new attempt gets a new key', async () => {
  let t = 1_000_000;
  const guard = new RepeatGuard(() => t);
  const fp = RepeatGuard.fingerprint('POST', '/partners/me/withdrawals', undefined);
  const keys: string[] = [];
  await guard.run(fp, async (key) => { keys.push(key); return 'ok'; });
  t += REPEAT_WINDOW_MS + 1;
  await guard.run(fp, async (key) => { keys.push(key); return 'ok'; });
  assert.notEqual(keys[0], keys[1]);
});

test('a different basket is a different request (different key, both sent)', async () => {
  const guard = new RepeatGuard();
  const a = RepeatGuard.fingerprint('POST', '/pharmacy/orders', { items: [{ id: 'm1', q: 1 }] });
  const b = RepeatGuard.fingerprint('POST', '/pharmacy/orders', { items: [{ id: 'm1', q: 2 }] });
  const keys: string[] = [];
  await Promise.all([guard.run(a, async (k) => { keys.push(k); }), guard.run(b, async (k) => { keys.push(k); })]);
  assert.equal(keys.length, 2);
  assert.notEqual(keys[0], keys[1]);
});

test('a failed request can be retried, with the same key, and is not stuck in flight', async () => {
  const guard = new RepeatGuard();
  const fp = RepeatGuard.fingerprint('POST', '/bookings', { serviceType: 'INJECTION_IM' });
  const keys: string[] = [];
  await assert.rejects(guard.run(fp, async (k) => { keys.push(k); throw new Error('network'); }));
  const ok = await guard.run(fp, async (k) => { keys.push(k); return 'booked'; });
  assert.equal(ok, 'booked');
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
});
