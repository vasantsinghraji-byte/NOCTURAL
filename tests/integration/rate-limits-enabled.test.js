/**
 * Rate limits with the limiters switched ON (real MongoDB store).
 *
 * Every other suite runs with NODE_ENV=test, where app.js skips the limiters,
 * so nothing proved they work. This suite builds the app in development mode
 * (limits on, as on staging), gives each run its own visitor IP through the
 * trusted proxy header, and checks:
 *   staff sign-in       5 failed attempts per IP, then 429
 *   customer sign-in    30 failed attempts per IP, then 429 (shared carrier IPs)
 *   isolation           another IP is not affected
 *   success not counted a correct password does not use up the allowance
 */
const crypto = require('crypto');
const request = require('supertest');
const mongoose = require('mongoose');

const PROXY_KEY = crypto.randomBytes(24).toString('hex'); // 48 chars; clientIp needs >= 32
const randomIp = () => `10.${crypto.randomInt(1, 255)}.${crypto.randomInt(1, 255)}.${crypto.randomInt(1, 255)}`;
const RUN = Date.now();
const PASSWORD = 'Strong@12345';

describe('Rate limits enabled (real MongoDB)', () => {
  let app;
  let db = false;
  let Patient;
  let patient;
  const saved = {};

  const from = (ip, req) => req
    .set('x-nabz-client-ip', ip)
    .set('x-nabz-proxy-key', PROXY_KEY)
    .set('User-Agent', 'NabzRateLimitTest/1.0')
    .set('X-Nocturnal-Mobile', 'expo');
  const staffLogin = (ip) => from(ip, request(app).post('/api/v1/auth/login')).send({ email: `nobody.${RUN}@nabz.test`, password: 'Wrong@12345' });
  const customerLogin = (ip, password = 'Wrong@12345', email = `nobody.${RUN}@nabz.test`) => from(ip, request(app).post('/api/v1/patients/login')).send({ email, password });

  beforeAll(async () => {
    for (const k of ['NODE_ENV', 'RATE_LIMIT_ENABLED', 'PROXY_SHARED_SECRET']) saved[k] = process.env[k];
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000, autoIndex: false });
      db = true;
    } catch (error) {
      console.warn(`Skipping rate-limit tests: MongoDB unavailable (${error.message})`);
      return;
    }
    // app.js decides at load time whether to mount the limiters, so set the
    // environment before the first require (each Jest file has its own module registry).
    process.env.NODE_ENV = 'development';
    process.env.RATE_LIMIT_ENABLED = 'true';
    process.env.PROXY_SHARED_SECRET = PROXY_KEY;
    app = require('../../app');
    Patient = require('../../models/patient');
    await Patient.createIndexes();
    patient = await Patient.create({ name: 'Rate Limit Test', email: `rl.${RUN}@nabz.test`, password: PASSWORD, phone: `95${String(RUN).slice(-8)}` });
  }, 60000);

  afterAll(async () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    if (!db) return;
    if (patient) await Patient.deleteOne({ _id: patient._id });
    // Limiter windows for this run's random IPs expire on their own; remove them now anyway.
    const { COLLECTION } = require('../../middleware/mongoRateLimitStore');
    await mongoose.connection.db.collection(COLLECTION).deleteMany({ _id: { $regex: /10\.\d+\.\d+\.\d+/ } }).catch(() => undefined);
    await mongoose.disconnect();
  });

  it('staff sign-in: 5 failed attempts from one IP, then 429; another IP is unaffected', async () => {
    if (!db) return;
    const ip = randomIp();
    for (let i = 0; i < 5; i += 1) {
      const r = await staffLogin(ip);
      expect(r.status).not.toBe(429);
    }
    const blocked = await staffLogin(ip);
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    expect((await staffLogin(randomIp())).status).not.toBe(429);
  });

  it('customer sign-in: 30 failed attempts from one IP, then 429', async () => {
    if (!db) return;
    const ip = randomIp();
    for (let i = 0; i < 30; i += 1) {
      const r = await customerLogin(ip);
      expect(r.status).not.toBe(429);
    }
    expect((await customerLogin(ip)).status).toBe(429);
    expect((await customerLogin(randomIp())).status).not.toBe(429);
  });

  it('a correct customer password does not use up the allowance', async () => {
    if (!db) return;
    const ip = randomIp();
    for (let i = 0; i < 10; i += 1) {
      const ok = await customerLogin(ip, PASSWORD, patient.email);
      expect(ok.status).toBe(200);
    }
    // Still the full allowance of failures left after ten successful sign-ins.
    for (let i = 0; i < 30; i += 1) expect((await customerLogin(ip)).status).not.toBe(429);
    expect((await customerLogin(ip)).status).toBe(429);
  });
});
