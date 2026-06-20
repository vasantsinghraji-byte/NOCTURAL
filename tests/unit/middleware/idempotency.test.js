const { EventEmitter } = require('events');

// In-memory stand-in for the Mongoose model with an atomic-claim unique scope.
jest.mock('../../../models/idempotencyKey', () => {
  const store = new Map();
  return {
    __store: store,
    async create(doc) {
      if (store.has(doc.scope)) {
        const error = new Error('duplicate key');
        error.code = 11000;
        throw error;
      }
      store.set(doc.scope, { ...doc });
      return doc;
    },
    async findOne(query) {
      return store.get(query.scope) || null;
    },
    async updateOne(query, update) {
      const current = store.get(query.scope);
      if (current) {
        Object.assign(current, update.$set);
      }
      return { modifiedCount: current ? 1 : 0 };
    },
    async deleteOne(query) {
      const existed = store.delete(query.scope);
      return { deletedCount: existed ? 1 : 0 };
    }
  };
});

// Round-trippable, inspectable encryption mock (prefix marks "encrypted").
jest.mock('../../../utils/encryptionV2', () => ({
  encrypt: (plaintext) => `enc:${plaintext}`,
  decrypt: (ciphertext) => String(ciphertext).replace(/^enc:/, '')
}));

jest.mock('../../../utils/logger', () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }));

const IdempotencyKey = require('../../../models/idempotencyKey');
const idempotency = require('../../../middleware/idempotency');

const flush = () => new Promise((resolve) => setImmediate(resolve));

const makeReq = ({ headers = {}, body = {}, userId = 'user-1', method = 'POST' } = {}) => ({
  method,
  body,
  user: { id: userId },
  get: (name) => headers[name]
});

const makeRes = () => {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.headers = {};
  res.sent = null;
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.sent = { statusCode: res.statusCode, body }; return res; };
  res.set = (key, value) => { res.headers[key] = value; return res; };
  return res;
};

const KEY = { 'Idempotency-Key': 'key-123' };

describe('idempotency middleware', () => {
  beforeEach(() => IdempotencyKey.__store.clear());

  it('passes through when no Idempotency-Key header is present', async () => {
    const next = jest.fn();
    await idempotency({ route: 'bookings/create' })(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(IdempotencyKey.__store.size).toBe(0);
  });

  it('rejects a missing Idempotency-Key when the route requires one', async () => {
    const next = jest.fn();
    const res = makeRes();
    await idempotency({ route: 'bookings/complete', required: true })(makeReq(), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.sent).toEqual({
      statusCode: 400,
      body: { success: false, message: 'Idempotency-Key header is required' }
    });
  });

  it('claims the key, caches the 2xx response, and stores no raw body or PHI', async () => {
    const mw = idempotency({ route: 'bookings/create' });
    const req = makeReq({ headers: KEY, body: { patientName: 'SENSITIVE', bookingId: 'b1' } });
    const res = makeRes();
    const next = jest.fn();

    await mw(req, res, next);
    expect(next).toHaveBeenCalledTimes(1); // claimed -> handler runs

    res.status(201).json({ success: true, data: { bookingId: 'created-1' } });
    res.emit('finish');
    await flush();

    const stored = [...IdempotencyKey.__store.values()][0];
    expect(stored.status).toBe('completed');
    expect(stored.responseStatus).toBe(201);
    expect(stored.responseBody.startsWith('enc:')).toBe(true);   // encrypted at rest
    expect(stored.scope).not.toContain('key-123');               // raw key not stored
    expect(JSON.stringify(stored)).not.toContain('SENSITIVE');   // raw body / PHI not stored
    expect(JSON.stringify(stored)).not.toContain('"bookingId":"b1"');
  });

  it('replays the cached response for a duplicate key with the same payload', async () => {
    const mw = idempotency({ route: 'payments/create-order' });
    const body = { bookingId: 'b1' };

    const first = makeRes();
    await mw(makeReq({ headers: KEY, body }), first, jest.fn());
    first.status(201).json({ success: true, data: { orderId: 'order-1' } });
    first.emit('finish');
    await flush();

    const res = makeRes();
    const next = jest.fn();
    await mw(makeReq({ headers: KEY, body }), res, next);

    expect(next).not.toHaveBeenCalled(); // handler NOT re-invoked
    expect(res.sent).toEqual({ statusCode: 201, body: { success: true, data: { orderId: 'order-1' } } });
    expect(res.headers['Idempotent-Replayed']).toBe('true');
  });

  it('rejects the same key reused with a different payload (422)', async () => {
    const mw = idempotency({ route: 'payments/verify' });

    const first = makeRes();
    await mw(makeReq({ headers: KEY, body: { amount: 100 } }), first, jest.fn());
    first.status(200).json({ success: true });
    first.emit('finish');
    await flush();

    const res = makeRes();
    const next = jest.fn();
    await mw(makeReq({ headers: KEY, body: { amount: 999 } }), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.sent.statusCode).toBe(422);
  });

  it('rejects a concurrent in-flight duplicate (409) while still processing', async () => {
    const mw = idempotency({ route: 'bookings/create' });
    const body = { bookingId: 'b1' };

    await mw(makeReq({ headers: KEY, body }), makeRes(), jest.fn()); // claim, do NOT finish

    const res = makeRes();
    const next = jest.fn();
    await mw(makeReq({ headers: KEY, body }), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.sent.statusCode).toBe(409);
  });

  it('releases the claim on a failed (non-2xx) response so the client can retry', async () => {
    const mw = idempotency({ route: 'payments/create-order' });
    const body = { bookingId: 'b1' };

    const res = makeRes();
    await mw(makeReq({ headers: KEY, body }), res, jest.fn());
    res.status(400).json({ success: false, message: 'bad request' });
    res.emit('finish');
    await flush();

    expect(IdempotencyKey.__store.size).toBe(0); // claim released

    const retry = makeRes();
    const next = jest.fn();
    await mw(makeReq({ headers: KEY, body }), retry, next);
    expect(next).toHaveBeenCalledTimes(1); // free to re-claim
  });

  it('scopes keys by identity so different users do not collide', async () => {
    const mw = idempotency({ route: 'bookings/create' });
    const body = { bookingId: 'b1' };

    const a = makeRes();
    await mw(makeReq({ headers: KEY, body, userId: 'user-A' }), a, jest.fn());

    const b = makeRes();
    const nextB = jest.fn();
    await mw(makeReq({ headers: KEY, body, userId: 'user-B' }), b, nextB);

    expect(nextB).toHaveBeenCalledTimes(1); // different identity -> own claim
    expect(IdempotencyKey.__store.size).toBe(2);
  });
});
