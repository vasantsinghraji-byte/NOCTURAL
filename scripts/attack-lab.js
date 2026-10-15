/**
 * Attack lab: brute force and endurance against a local copy of the API.
 *
 *   MONGODB_URI=mongodb://127.0.0.1:28017/nabz_attack?replicaSet=testset \
 *   node scripts/attack-lab.js [accounts=2000] [soakSeconds=180]
 *
 * 1. Credential stuffing: every account is hit with 20 wrong passwords at once
 *    (40,000 guesses). Rule: no account ever lets more than 10 guesses through,
 *    and no wrong password ever signs in.
 * 2. Password spraying: one common password tried against every account.
 *    Rule: nobody gets in with it (the real users' passwords are random).
 * 3. Code guessing at scale: 200 visits, 30 parallel visit-code guesses each.
 *    Rule: at most 5 guesses checked per visit, none started without its code.
 * 4. Soak: steady mixed traffic for soakSeconds. Rules: no 5xx, memory settles
 *    (no leak), latency doesn't creep up.
 * Local throwaway database only.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'a'.repeat(48);
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'e'.repeat(64);

const crypto = require('crypto');
const http = require('http');
const mongoose = require('mongoose');

const ACCOUNTS = Number(process.argv[2]) || 2000;
const SOAK_SECONDS = Number(process.argv[3]) || 180;
// A well-known weak password that sprayers try on every account (not a real credential).
const SPRAY_GUESS = ['Password', '@123'].join('');
const RUN = `al${Date.now().toString(36)}`;
const HOME = { lat: 26.9110, lng: 75.8010 };
const violations = [];
const violate = (rule, detail) => violations.push({ rule, detail: typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 240) });
const report = {};

let BASE;
const agent = new http.Agent({ keepAlive: true, maxSockets: Number(process.env.LAB_IN_FLIGHT) || 100 });
const statusCount = {};
let fiveHundreds = 0;
function call(method, path, { token, body } = {}) {
  const payload = body !== undefined ? JSON.stringify(body) : undefined;
  const url = new URL(`${BASE}${path}`);
  const h = { 'X-Nocturnal-Mobile': 'expo', 'User-Agent': 'okhttp/4.12.0' };
  if (token) h.Authorization = `Bearer ${token}`;
  if (payload) { h['Content-Type'] = 'application/json'; h['Content-Length'] = Buffer.byteLength(payload); }
  const t0 = Date.now();
  return new Promise((resolve) => {
    const req = http.request({ hostname: url.hostname, port: url.port, path: url.pathname + url.search, method, headers: h, agent }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        let json = {};
        try { json = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { /* not json */ }
        statusCount[res.statusCode] = (statusCount[res.statusCode] || 0) + 1;
        if (res.statusCode >= 500) fiveHundreds += 1;
        resolve({ status: res.statusCode, body: json, ms: Date.now() - t0 });
      });
    });
    req.on('error', (err) => resolve({ status: 599, body: { error: err.code || err.message }, ms: Date.now() - t0 }));
    req.setTimeout(120000, () => req.destroy(new Error('client timeout')));
    if (payload) req.write(payload);
    req.end();
  });
}
const tokenOf = (r) => r.body?.tokens?.accessToken || r.body?.data?.tokens?.accessToken;
const mb = (n) => Math.round(n / 1048576);

(async () => {
  const uri = process.env.MONGODB_URI || '';
  if (!/127\.0\.0\.1|localhost/.test(uri)) throw new Error('Refusing: use a local throwaway database');
  await mongoose.connect(uri);
  const app = require('../app');
  const server = app.listen(0);
  BASE = `http://127.0.0.1:${server.address().port}/api/v1`;
  const Patient = require('../models/patient');
  const User = require('../models/user');
  const NurseBooking = require('../models/nurseBooking');
  const ServiceCatalog = require('../models/serviceCatalog');
  const { hashPassword } = require('../utils/passwordHash');
  for (const M of [Patient, User, NurseBooking]) await M.createIndexes();
  await ServiceCatalog.findOneAndUpdate({ name: 'INJECTION_IM' }, { $setOnInsert: {
    name: 'INJECTION_IM', slug: `inj-${RUN}`, category: 'NURSING', displayName: 'IM Injection',
    pricing: { basePrice: 299, currency: 'INR' }, availability: { isActive: true, availableCities: ['Jaipur'] }, requirements: { prescriptionRequired: false }
  } }, { upsert: true });

  console.log(`Creating ${ACCOUNTS} customer accounts with random passwords…`);
  const passwords = Array.from({ length: ACCOUNTS }, () => `${crypto.randomBytes(9).toString('base64url')}Aa1!`);
  const people = await Patient.insertMany(await Promise.all(passwords.map(async (pw, i) => ({
    name: `Target ${i}`, email: `t${i}.${RUN}@nabz.test`, phone: `8${String(6e8 + i).padStart(9, '0')}`, password: await hashPassword(pw)
  }))));

  // ── 1. Credential stuffing ──
  console.log('1. Credential stuffing: 20 wrong passwords per account, all at once…');
  let t0 = Date.now();
  const stuffing = await Promise.all(people.map((p, i) => Promise.all(Array.from({ length: 20 }, (_, k) =>
    call('POST', '/patients/login', { body: { email: p.email, password: `Guess${k}${i}!aA` } })))));
  const wrongSignIns = stuffing.flat().filter((r) => r.status === 200).length;
  if (wrongSignIns) violate('a wrong password never signs in', `${wrongSignIns} wrong-password sign-ins`);
  const checkedPerAccount = stuffing.map((rs) => rs.filter((r) => r.status === 401).length);
  const worst = Math.max(...checkedPerAccount);
  if (worst > 10) violate('no account lets more than 10 guesses through', `worst account: ${worst}`);
  const locked = await Patient.countDocuments({ _id: { $in: people.map((p) => p._id) }, 'loginGuard.lockUntil': { $gt: new Date() } });
  // The owner, with the right password, is refused while locked (expected), then a reset would unlock.
  const owner = await call('POST', '/patients/login', { body: { email: people[0].email, password: passwords[0] } });
  report.credentialStuffing = { guesses: stuffing.flat().length, seconds: +((Date.now() - t0) / 1000).toFixed(1), maxGuessesCheckedOnOneAccount: worst, accountsLocked: locked, ownerDuringLock: owner.status };
  console.log('  ->', JSON.stringify(report.credentialStuffing));

  // ── 2. Password spraying ──
  console.log('2. Password spraying: one common password against every account…');
  await Patient.updateMany({ _id: { $in: people.map((p) => p._id) } }, { $set: { 'loginGuard.failed': 0 }, $unset: { 'loginGuard.lockUntil': 1 } });
  t0 = Date.now();
  const spray = await Promise.all(people.map((p) => call('POST', '/patients/login', { body: { email: p.email, password: SPRAY_GUESS } })));
  const sprayHits = spray.filter((r) => r.status === 200).length;
  if (sprayHits) violate('a common password opens no account', `${sprayHits} accounts opened`);
  report.passwordSpraying = { attempts: spray.length, accountsOpened: sprayHits, seconds: +((Date.now() - t0) / 1000).toFixed(1), note: 'In production the WAF also caps sign-in attempts per IP.' };
  console.log('  ->', JSON.stringify(report.passwordSpraying));

  // ── 3. Visit-code guessing at scale ──
  console.log('3. Visit-code guessing: 200 visits × 30 parallel guesses…');
  const nurse = await User.create({ name: 'Lab Nurse', email: `nurse.${RUN}@nabz.test`, phone: `7${String(Date.now()).slice(-9)}`, password: await hashPassword(passwords[0]), role: 'nurse', isVerified: true, careProfile: { verification: { idVerified: true, policeVerified: true, councilVerified: true } } });
  const nurseTok = tokenOf(await call('POST', '/auth/login', { body: { email: nurse.email, password: passwords[0], portal: 'staff' } }));
  const visits = await NurseBooking.insertMany(people.slice(0, 200).map((p, i) => ({
    patient: p._id, serviceProvider: nurse._id, serviceType: 'INJECTION', status: 'EN_ROUTE', scheduledDate: new Date(), scheduledTime: '10:00', scheduledTimezone: 'Asia/Kolkata', scheduledTimezoneOffsetMinutes: 330,
    serviceLocation: { type: 'HOME', address: { street: 'Lab Road', city: 'Jaipur', pincode: '302001', coordinates: HOME } },
    pricing: { basePrice: 299, payableAmount: 299, totalAmount: 299 }, visitOtp: { code: String(1000 + i).padStart(4, '0') }
  })));
  t0 = Date.now();
  await Promise.all(visits.map((v, i) => Promise.all(Array.from({ length: 30 }, (_, k) => {
    const guess = String((i * 37 + k * 131) % 10000).padStart(4, '0');
    return call('PUT', `/bookings/${v._id}/start`, { token: nurseTok, body: { visitCode: guess === v.visitOtp.code ? '0000' : guess } });
  }))));
  const after = await NurseBooking.find({ _id: { $in: visits.map((v) => v._id) } }).select('+visitOtp.code status').lean();
  const overChecked = after.filter((v) => (v.visitOtp.failedAttempts || 0) > 5).length;
  const startedByGuess = after.filter((v) => v.status === 'IN_PROGRESS').length;
  if (overChecked) violate('at most 5 visit-code guesses are checked per visit', `${overChecked} visits over the limit`);
  if (startedByGuess) violate('no visit starts without its code', `${startedByGuess} started`);
  report.codeGuessing = { visits: visits.length, guesses: visits.length * 30, seconds: +((Date.now() - t0) / 1000).toFixed(1), visitsOverLimit: overChecked, startedByGuessing: startedByGuess };
  console.log('  ->', JSON.stringify(report.codeGuessing));

  // ── 4. Soak ──
  console.log(`4. Soak: ${SOAK_SECONDS}s of steady mixed traffic…`);
  await Patient.updateMany({ _id: { $in: people.map((p) => p._id) } }, { $set: { 'loginGuard.failed': 0 }, $unset: { 'loginGuard.lockUntil': 1 } });
  const tokens = await Promise.all(people.slice(0, 100).map((p, i) => call('POST', '/patients/login', { body: { email: p.email, password: passwords[i] } }).then(tokenOf)));
  if (global.gc) global.gc();
  const memStart = process.memoryUsage().rss;
  const samples = [];
  const minuteLatency = [];
  const end = Date.now() + SOAK_SECONDS * 1000;
  let n = 0;
  let windowLat = [];
  let windowStart = Date.now();
  const worker = async (w) => {
    while (Date.now() < end) {
      const tok = tokens[(w + n) % tokens.length];
      n += 1;
      const r = await [
        () => call('GET', '/care/services'),
        () => call('GET', '/bookings/patient/me', { token: tok }),
        () => call('GET', '/patients/me', { token: tok }),
        () => call('GET', `/care/providers?lat=${HOME.lat}&lng=${HOME.lng}`, { token: tok }),
        () => call('GET', '/pharmacy/medicines/search?q=para', { token: tok })
      ][n % 5]();
      windowLat.push(r.ms);
      if (Date.now() - windowStart >= 30000) {
        windowLat.sort((a, b) => a - b);
        minuteLatency.push(windowLat[Math.floor(windowLat.length * 0.95)] || 0);
        samples.push(mb(process.memoryUsage().rss));
        windowLat = [];
        windowStart = Date.now();
      }
    }
  };
  await Promise.all(Array.from({ length: 50 }, (_, w) => worker(w)));
  if (global.gc) global.gc();
  const memEnd = process.memoryUsage().rss;
  report.soak = {
    seconds: SOAK_SECONDS, requests: n, perSecond: +(n / SOAK_SECONDS).toFixed(1),
    p95MsPer30s: minuteLatency, rssMbPer30s: samples, rssStartMb: mb(memStart), rssEndMb: mb(memEnd)
  };
  if (minuteLatency.length >= 3 && minuteLatency[minuteLatency.length - 1] > 3 * Math.max(50, minuteLatency[0])) violate('latency stays flat during a soak', minuteLatency);
  if (samples.length >= 3 && samples[samples.length - 1] - samples[1] > 300) violate('memory settles during a soak (no leak)', samples);
  if (fiveHundreds) violate('no request fails with a server error', `${fiveHundreds} 5xx`);

  console.log(JSON.stringify({ accounts: ACCOUNTS, statuses: statusCount, ...report, violations }, null, 1));
  await Promise.all([
    NurseBooking.deleteMany({ patient: { $in: people.map((p) => p._id) } }),
    Patient.deleteMany({ _id: { $in: people.map((p) => p._id) } }),
    User.deleteOne({ _id: nurse._id })
  ]);
  server.close();
  await mongoose.disconnect();
  process.exit(violations.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
