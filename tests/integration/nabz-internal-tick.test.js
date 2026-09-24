/**
 * Scheduled tick (POST /api/v1/internal/tick) and the rate-limit caller keys.
 * Needs MongoDB (MONGODB_URI) for the lease; skips otherwise.
 */
const request = require('supertest');
const mongoose = require('mongoose');
const JobLease = require('../../models/jobLease');

const SECRET = 'c'.repeat(40);

describe('Internal tick + rate-limit keys', () => {
  let app;
  let db = false;
  const saved = { cron: process.env.CRON_SECRET, proxy: process.env.PROXY_SHARED_SECRET };

  beforeAll(async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000, autoIndex: false });
      db = true;
    } catch (error) {
      console.warn(`Skipping internal tick tests: MongoDB unavailable (${error.message})`);
      return;
    }
    await JobLease.createIndexes();
    app = require('../../app');
  });

  afterAll(async () => {
    process.env.CRON_SECRET = saved.cron;
    process.env.PROXY_SHARED_SECRET = saved.proxy;
    if (saved.cron === undefined) delete process.env.CRON_SECRET;
    if (saved.proxy === undefined) delete process.env.PROXY_SHARED_SECRET;
    if (!db) return;
    await JobLease.deleteMany({});
    await mongoose.disconnect();
  });

  it('the tick endpoint does not exist without CRON_SECRET and rejects a wrong secret', async () => {
    if (!db) return;
    delete process.env.CRON_SECRET;
    expect((await request(app).post('/api/v1/internal/tick').set('x-cron-secret', SECRET)).status).toBe(404);
    process.env.CRON_SECRET = SECRET;
    expect((await request(app).post('/api/v1/internal/tick')).status).toBe(401);
    expect((await request(app).post('/api/v1/internal/tick').set('x-cron-secret', 'd'.repeat(40))).status).toBe(401);
  });

  it('only one instance runs the sweeps while the lease is held', async () => {
    if (!db) return;
    const cron = require('../../services/cronService');
    await JobLease.deleteMany({});
    await JobLease.create({ name: cron.LEASE_NAME, owner: 'other-instance', until: new Date(Date.now() + 30000) });
    expect(await cron.acquireLease()).toBe(false);
    expect(await cron.runTick()).toMatchObject({ skipped: true });

    // Expired lease: this instance takes it.
    await JobLease.updateOne({ name: cron.LEASE_NAME }, { $set: { until: new Date(Date.now() - 1000) } });
    expect(await cron.acquireLease()).toBe(true);
    // Held by us now, so a second concurrent take fails.
    expect(await cron.acquireLease()).toBe(false);
  });

  it('a valid tick runs the sweeps and records the run', async () => {
    if (!db) return;
    const cron = require('../../services/cronService');
    await JobLease.deleteMany({});
    process.env.CRON_SECRET = SECRET;
    const res = await request(app).post('/api/v1/internal/tick').set('x-cron-secret', SECRET);
    expect(res.status).toBe(200);
    expect(res.body.skipped).toBe(false);
    expect(Object.keys(res.body.results)).toEqual(expect.arrayContaining(['dispatch', 'pharmacyAcceptance', 'careRefundOutbox']));
    expect((await cron.lastRun()).lastRunAt).toBeTruthy();
  });

  describe('rate-limit caller keys', () => {
    const { clientIp, callerKey } = require('../../middleware/rateLimitEnhanced');
    const fakeReq = (headers = {}, ip = '10.0.0.1') => ({
      ip, headers, get: (h) => headers[h.toLowerCase()]
    });

    it('trusts the forwarded visitor IP only with the proxy key', () => {
      process.env.PROXY_SHARED_SECRET = 'p'.repeat(40);
      expect(clientIp(fakeReq({ 'x-nabz-client-ip': '49.36.1.2', 'x-nabz-proxy-key': 'p'.repeat(40) }))).toBe('49.36.1.2');
      expect(clientIp(fakeReq({ 'x-nabz-client-ip': '49.36.1.2', 'x-nabz-proxy-key': 'wrong' }))).toBe('10.0.0.1');
      expect(clientIp(fakeReq({ 'x-nabz-client-ip': '49.36.1.2' }))).toBe('10.0.0.1');
      expect(clientIp(fakeReq({ 'x-nabz-client-ip': 'not-an-ip', 'x-nabz-proxy-key': 'p'.repeat(40) }))).toBe('10.0.0.1');
      delete process.env.PROXY_SHARED_SECRET;
      expect(clientIp(fakeReq({ 'x-nabz-client-ip': '49.36.1.2', 'x-nabz-proxy-key': 'p'.repeat(40) }))).toBe('10.0.0.1');
    });

    it('keys signed-in callers by account and forged tokens by IP', () => {
      const { generateAccessToken } = require('../../utils/authTokens');
      const userId = new mongoose.Types.ObjectId().toString();
      const token = generateAccessToken(userId);
      expect(callerKey(fakeReq({ authorization: `Bearer ${token}` }))).toEqual({ kind: 'user', id: userId });
      expect(callerKey(fakeReq({ authorization: 'Bearer forged.token.value' })).kind).toBe('ip');
    });
  });
});
