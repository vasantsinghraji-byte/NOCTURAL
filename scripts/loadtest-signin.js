/**
 * Sign-in load test: many customers signing in at the same moment.
 *
 *   MONGODB_URI=mongodb://127.0.0.1:28017/nabz_load?replicaSet=testset \
 *   node scripts/loadtest-signin.js [users=50] [loginsPerUser=4]
 *
 * Reports sign-in latency (p50/p95/max), errors, and how slow an unrelated
 * request (health check) gets during the storm (event-loop blocking).
 * Uses a throwaway database; never point it at staging or production.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'l'.repeat(48);
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'c'.repeat(64);

const mongoose = require('mongoose');
const request = require('supertest');

const USERS = Number(process.argv[2]) || 50;
const PER_USER = Number(process.argv[3]) || 4;
// Throwaway accounts get a random password each run.
const PASSWORD = `${require('crypto').randomBytes(9).toString('base64url')}Aa1!`;
const MOBILE = { 'X-Nocturnal-Mobile': 'expo' };
const pct = (arr, p) => arr[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))];

(async () => {
  const uri = process.env.MONGODB_URI || '';
  if (!/127\.0\.0\.1|localhost/.test(uri)) throw new Error('Refusing: use a local throwaway database');
  await mongoose.connect(uri);
  const app = require('../app');
  const Patient = require('../models/patient');
  const run = Date.now().toString(36);
  const people = await Patient.create(Array.from({ length: USERS }, (_, i) => ({
    name: `Load ${i}`, email: `load${i}.${run}@nabz.test`, password: PASSWORD, phone: `9${String(Date.now() + i).slice(-9)}`
  })));

  const health = [];
  let storming = true;
  const probe = (async () => {
    while (storming) {
      const t0 = Date.now();
      await request(app).get('/api/v1/health');
      health.push(Date.now() - t0);
      await new Promise((r) => setTimeout(r, 50));
    }
  })();

  const t0 = Date.now();
  const results = await Promise.all(people.flatMap((p) => Array.from({ length: PER_USER }, async () => {
    const s = Date.now();
    const res = await request(app).post('/api/v1/patients/login').set(MOBILE).send({ email: p.email, password: PASSWORD });
    return { ms: Date.now() - s, status: res.status };
  })));
  const wall = Date.now() - t0;
  storming = false;
  await probe;

  const lat = results.map((r) => r.ms).sort((a, b) => a - b);
  const byStatus = results.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] || 0) + 1 }), {});
  const h = health.sort((a, b) => a - b);
  console.log(JSON.stringify({
    signIns: results.length,
    wallSeconds: +(wall / 1000).toFixed(1),
    perSecond: +(results.length / (wall / 1000)).toFixed(1),
    statuses: byStatus,
    signInMs: { p50: pct(lat, 50), p95: pct(lat, 95), max: lat[lat.length - 1] },
    healthCheckMsDuringStorm: { p50: pct(h, 50), p95: pct(h, 95), max: h[h.length - 1], samples: h.length }
  }, null, 1));
  await Patient.deleteMany({ _id: { $in: people.map((p) => p._id) } });
  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
