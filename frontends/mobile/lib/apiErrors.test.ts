/**
 * Error text the screens show (shared/src/api.ts).
 * Run: npm test (in frontends/mobile)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, MedRushApi } from '../../shared/src/api.ts';

const replying = (status: number, body: unknown) => new MedRushApi({
  baseUrl: 'https://api.example.test',
  fetchImpl: (async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })) as typeof fetch
});

const failure = async (api: MedRushApi) => {
  try {
    await api.getMyOrders({});
  } catch (e) {
    assert.ok(e instanceof ApiError);
    return e;
  }
  throw new Error('expected the request to fail');
};

test('a validation error shows the first field message, not "Validation failed"', async () => {
  const e = await failure(replying(400, { success: false, message: 'Validation failed', errors: [{ field: 'email', message: 'Invalid email format' }, { field: 'password', message: 'Password is required' }] }));
  assert.equal(e.status, 400);
  assert.equal(e.message, 'Invalid email format');
});

test('other errors keep the server message', async () => {
  const e = await failure(replying(401, { success: false, message: 'Invalid credentials' }));
  assert.equal(e.message, 'Invalid credentials');
});

test('rate limiting gets the friendly busy message', async () => {
  const e = await failure(replying(429, { success: false, message: 'API rate limit exceeded', errors: [{ message: 'x' }] }));
  assert.match(e.message, /busy right now/);
});
