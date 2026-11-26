/**
 * Offline banner state (shared/src/connection.ts).
 * Run: npm test (in frontends/mobile)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Connection } from '../../shared/src/connection.ts';

const ok = (async () => new Response('{}', { status: 200 })) as typeof fetch;
const serverError = (async () => new Response('{}', { status: 503 })) as typeof fetch;
const noNetwork = (async () => { throw new TypeError('Network request failed'); }) as typeof fetch;
const aborted = (async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }) as typeof fetch;

test('a request that cannot reach the server shows the banner; the next answer hides it', async () => {
  const c = new Connection();
  const seen: boolean[] = [];
  c.subscribe((v) => seen.push(v));
  await assert.rejects(c.trackFetch(noNetwork)('https://x'));
  assert.equal(c.isOnline(), false);
  await c.trackFetch(ok)('https://x');
  assert.equal(c.isOnline(), true);
  assert.deepEqual(seen, [false, true]);
});

test('an error answer from the server still counts as reachable; our own cancel says nothing', async () => {
  const c = new Connection();
  await c.trackFetch(serverError)('https://x');
  assert.equal(c.isOnline(), true);
  await assert.rejects(c.trackFetch(aborted)('https://x'));
  assert.equal(c.isOnline(), true);
});

test('repeats of the same state are not announced; unsubscribe stops updates', async () => {
  const c = new Connection();
  const seen: boolean[] = [];
  const stop = c.subscribe((v) => seen.push(v));
  c.set(false); c.set(false); stop(); c.set(true);
  assert.deepEqual(seen, [false]);
});

test('the recheck pings only while offline, and stops', () => {
  const c = new Connection();
  let tick: () => void = () => undefined;
  let cleared = false;
  const timers = { setInterval: ((fn: () => void) => { tick = fn; return 1; }) as unknown as typeof setInterval, clearInterval: (() => { cleared = true; }) as typeof clearInterval };
  let pings = 0;
  const stop = c.startRecheck(async () => { pings += 1; }, 1000, timers);
  tick();
  assert.equal(pings, 0);
  c.set(false);
  tick(); tick();
  assert.equal(pings, 2);
  stop();
  assert.equal(cleared, true);
});
