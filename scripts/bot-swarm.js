/**
 * Bot swarm: hundreds of scripted users and attackers hit the API at the same
 * time, then we check the rules that must hold no matter what.
 *
 *   MONGODB_URI=mongodb://127.0.0.1:28017/nabz_swarm?replicaSet=testset \
 *   node scripts/bot-swarm.js [bots=500]
 *
 * Mix (scaled to the bot count): 60% customers, 20% attackers, 10% nurses,
 * 10% partners withdrawing. Local throwaway database only.
 *
 * Invariants checked afterwards:
 *   - no request got a 5xx
 *   - no customer has two live visits for the same person and time
 *   - scarce stock never goes negative and never oversells
 *   - at most one open withdrawal per partner, never above the balance
 *   - nobody read or changed another customer's visit
 *   - suspended/forged tokens never got data
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 's'.repeat(48);
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'd'.repeat(64);

const crypto = require('crypto');
const mongoose = require('mongoose');

const BOTS = Number(process.argv[2]) || 500;
const PASSWORD = `${crypto.randomBytes(9).toString('base64url')}Aa1!`;
const HOME = { lat: 26.9110, lng: 75.8010 };
const RUN = `sw${Date.now().toString(36)}`;
const SCARCE_STOCK = 50;

const stats = { requests: 0, byStatus: {}, fiveHundreds: [], latencies: [], firstRefusal: {} };
const violations = [];
const violate = (rule, detail) => violations.push({ rule, detail: typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 240) });
const ist = (days) => new Date(Date.now() + 330 * 60000 + days * 86400000).toISOString().slice(0, 10);
const rand = (n) => Math.floor(Math.random() * n);

let BASE;
// Plain HTTP client like the Android app (fetch() adds browser sec-fetch-*
// headers, and the API rightly gives browsers cookies, not tokens). The
// keep-alive pool acts like the load balancer in front of App Runner: at most
// MAX_IN_FLIGHT connections, the rest queue.
const http = require('http');
const MAX_IN_FLIGHT = Number(process.env.SWARM_IN_FLIGHT) || 100;
const agent = new http.Agent({ keepAlive: true, maxSockets: MAX_IN_FLIGHT });
function call(method, path, { token, body, raw, headers = {} } = {}) {
  const t0 = Date.now();
  const payload = raw !== undefined ? String(raw) : body !== undefined ? JSON.stringify(body) : undefined;
  const url = new URL(`${BASE}${path}`);
  const h = { 'X-Nocturnal-Mobile': 'expo', 'User-Agent': 'okhttp/4.12.0', ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (payload !== undefined) { h['Content-Type'] = 'application/json'; h['Content-Length'] = Buffer.byteLength(payload); }
  return new Promise((resolve) => {
    const done = (status, json) => {
      stats.requests += 1;
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
      stats.latencies.push(Date.now() - t0);
      const key = `${method} ${path.replace(/[a-f0-9]{24}/g, ':id').split('?')[0]}`;
      if (status >= 400 && status < 500 && !stats.firstRefusal[key]) stats.firstRefusal[key] = `${status} ${JSON.stringify(json).slice(0, 160)}`;
      if (status >= 500 && stats.fiveHundreds.length < 50) stats.fiveHundreds.push(`${method} ${path.slice(0, 60)} -> ${status} ${JSON.stringify(json).slice(0, 120)}`);
      resolve({ status, body: json || {} });
    };
    const req = http.request({ hostname: url.hostname, port: url.port, path: url.pathname + url.search, method, headers: h, agent }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json;
        try { json = text ? JSON.parse(text) : null; } catch { json = { text: text.slice(0, 200) }; }
        done(res.statusCode, json);
      });
    });
    req.on('error', (err) => done(599, { error: err.message, cause: err.code }));
    req.setTimeout(120000, () => req.destroy(new Error('client timeout')));
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}
const tokenOf = (r) => r.body?.tokens?.accessToken || r.body?.data?.tokens?.accessToken;
const bookBody = (who, time, date = ist(2)) => ({
  serviceType: 'INJECTION', mode: 'SCHEDULED', scheduledDate: date, scheduledTime: time,
  serviceLocation: { type: 'HOME', address: { street: 'Ashok Marg', city: 'Jaipur', pincode: '302001', coordinates: HOME } },
  patientDetails: { name: who, age: 60, gender: 'Female' }
});

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
  const PharmacyVendor = require('../models/pharmacyVendor');
  const Medicine = require('../models/medicine');
  const VendorInventory = require('../models/vendorInventory');
  const PharmacyOrder = require('../models/pharmacyOrder');
  const SettlementEntry = require('../models/settlementEntry');
  const WithdrawalRequest = require('../models/withdrawalRequest');
  for (const M of [Patient, User, NurseBooking, PharmacyVendor, VendorInventory, PharmacyOrder, WithdrawalRequest]) await M.createIndexes();

  const nCust = Math.round(BOTS * 0.6);
  const nAtk = Math.round(BOTS * 0.2);
  const nNurse = Math.round(BOTS * 0.1);
  const nPartner = BOTS - nCust - nAtk - nNurse;

  console.log(`Setting up ${BOTS} bots: ${nCust} customers, ${nAtk} attackers, ${nNurse} nurses, ${nPartner} withdrawing partners…`);
  await ServiceCatalog.findOneAndUpdate({ name: 'INJECTION_IM' }, { $setOnInsert: {
    name: 'INJECTION_IM', slug: `inj-${RUN}`, category: 'NURSING', displayName: 'IM Injection',
    pricing: { basePrice: 299, currency: 'INR' }, availability: { isActive: true, availableCities: ['Jaipur'] }, requirements: { prescriptionRequired: false }
  } }, { upsert: true });
  const phone = (i) => `9${String(7e8 + i).padStart(9, '0')}`;
  // One hash shared by every bot: hashing 60k passwords up front would test the
  // setup, not the API (sign-in still runs the full bcrypt compare per request).
  const hashed = await require('../utils/passwordHash').hashPassword(PASSWORD);
  const customers = await Patient.insertMany(Array.from({ length: nCust }, (_, i) => ({
    name: `Customer ${i}`, email: `c${i}.${RUN}@nabz.test`, phone: phone(i), password: hashed
  })));
  const verified = { idVerified: true, policeVerified: true, councilVerified: true };
  const nurses = await User.insertMany(Array.from({ length: nNurse + nPartner }, (_, i) => ({
    name: `Nurse ${i}`, email: `n${i}.${RUN}@nabz.test`, phone: phone(5000 + i), password: hashed, role: 'nurse', isVerified: true,
    careProfile: { gender: i % 2 ? 'MALE' : 'FEMALE', verification: verified },
    payout: { method: 'UPI', upiId: `n${i}@okicici`, updatedAt: new Date(Date.now() - 3 * 86400000) }
  })));
  const partners = nurses.slice(nNurse);
  // Partners have earnings to withdraw.
  await SettlementEntry.insertMany(partners.map((p, i) => ({
    source: { kind: 'CARE_BOOKING', id: new mongoose.Types.ObjectId(), ref: `swarm-${i}` }, party: { kind: 'PROVIDER', id: p._id },
    type: 'PROVIDER_PAYOUT', amount: 500, occurredAt: new Date()
  })));
  const store = await PharmacyVendor.create({ name: `Swarm Store ${RUN}`, slug: `ss-${RUN}`, location: { type: 'Point', coordinates: [HOME.lng, HOME.lat + 0.01] }, serviceRadiusKm: 5, status: 'APPROVED', isActive: true, isOpen: true, deliveryFee: 20 });
  const med = await Medicine.create({ name: `Scarce Syrup ${RUN}`, slug: `scarce-${RUN}`, form: 'SYRUP' });
  await VendorInventory.create({ vendor: store._id, medicine: med._id, mrp: 90, sellingPrice: 80, stockQty: SCARCE_STOCK, stockUpdatedAt: new Date() });

  // ── Phase 1: everyone signs in at once (some customers tap twice) ──
  console.log('Phase 1: sign-in rush…');
  const t1 = Date.now();
  // Progress line for long runs (100k bots take over an hour on one laptop).
  const progress = setInterval(() => console.log(`… ${stats.requests} requests done, ${Math.round(process.memoryUsage().rss / 1048576)} MB`), 60000);
  progress.unref();
  const custTokens = await Promise.all(customers.map(async (c, i) => {
    const tries = await Promise.all(Array.from({ length: i % 5 === 0 ? 2 : 1 }, () => call('POST', '/patients/login', { body: { email: c.email, password: PASSWORD } })));
    tries.forEach((r) => { if (r.status !== 200) violate('every valid sign-in succeeds', `${c.email}: ${r.status}`); });
    return tokenOf(tries[0]);
  }));
  const nurseTokens = await Promise.all(nurses.map(async (n) => tokenOf(await call('POST', '/auth/login', { body: { email: n.email, password: PASSWORD, portal: 'staff' } }))));
  const signInSeconds = (Date.now() - t1) / 1000;
  const gotTokens = custTokens.filter(Boolean).length + nurseTokens.filter(Boolean).length;
  console.log(`Sign-ins returned ${gotTokens} tokens for ${customers.length + nurses.length} accounts`);
  if (gotTokens < customers.length + nurses.length) {
    const sample = await call('POST', '/patients/login', { body: { email: customers[0].email, password: PASSWORD } });
    console.log('Sample sign-in response:', sample.status, JSON.stringify(sample.body).replace(/eyJ[\w.-]+/g, '<jwt>').slice(0, 300));
  }

  // ── Phase 2: the swarm ──
  console.log('Phase 2: swarm…');
  const t2 = Date.now();
  const bookingIdsByCustomer = new Map();
  const allBookingIds = [];
  const customerBots = customers.map(async (c, i) => {
    const tok = custTokens[i];
    if (!tok) return;
    // Double-tap Book (same person, same time) and one booking for another family member.
    const same = bookBody('Kamla Devi', `${String(8 + (i % 10)).padStart(2, '0')}:00`);
    const rs = await Promise.all([call('POST', '/bookings', { token: tok, body: same }), call('POST', '/bookings', { token: tok, body: same }),
      call('POST', '/bookings', { token: tok, body: { ...same, patientDetails: { name: 'Ramesh Lal', age: 65, gender: 'Male' } } })]);
    const ids = rs.map((r) => r.body.booking?._id || r.body.data?.booking?._id).filter(Boolean);
    bookingIdsByCustomer.set(String(c._id), ids);
    allBookingIds.push(...ids);
    // Race for the scarce medicine.
    await call('POST', '/pharmacy/orders', { token: tok, body: {
      vendorId: String(store._id), items: [{ medicineId: String(med._id), quantity: 1 + (i % 2) }],
      deliveryAddress: { line1: '1 Swarm Road', city: 'Jaipur', pincode: '302001', contactPhone: phone(i) },
      deliveryLocation: { coordinates: [HOME.lng, HOME.lat] }, paymentMode: 'COD'
    } });
    // Snoop: try someone else's visit.
    const other = customers[(i + 1) % customers.length];
    const theirs = bookingIdsByCustomer.get(String(other._id)) || [];
    for (const id of theirs.slice(0, 1)) {
      const peek = await call('GET', `/bookings/${id}`, { token: tok });
      if (peek.status < 400) violate('a customer cannot read another customer’s visit', `${c.email} read ${id}`);
      const cancel = await call('PUT', `/bookings/${id}/cancel`, { token: tok, body: { reason: 'not mine' } });
      if (cancel.status < 400) violate('a customer cannot cancel another customer’s visit', `${c.email} cancelled ${id}`);
    }
  });

  const payloads = [
    { email: { $gt: '' }, password: { $gt: '' } }, { email: 'a@b.c', password: 'x'.repeat(5000) }, '{"broken": ',
    { $where: 'sleep(1000)' }, { name: '<img src=x onerror=alert(1)>' }, { items: [{ medicineId: { $ne: null }, quantity: 1 }] },
    { scheduledDate: '9999-99-99', scheduledTime: '99:99' }, { 'serviceLocation.address.coordinates': { lat: 'x' } }, [], 42, null
  ];
  const attackerBots = Array.from({ length: nAtk }, async (_, i) => {
    const p = payloads[i % payloads.length];
    const raw = typeof p === 'string' ? p : JSON.stringify(p);
    const victim = custTokens[rand(custTokens.length)];
    const forged = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ id: String(customers[0]._id), identityType: 'patient' })).toString('base64url')}.`;
    const hits = await Promise.all([
      call('POST', '/patients/login', { raw }),
      call('POST', '/auth/login', { raw }),
      call('POST', '/bookings', { token: victim, raw }),
      call('POST', '/pharmacy/orders', { token: victim, raw }),
      call('GET', '/bookings/patient/me', { token: forged }),
      call('GET', '/admin/ops/users', { token: victim }),
      call('GET', `/bookings/${'0'.repeat(24)}`, { token: victim }),
      call('GET', '/care/providers?lat[$gt]=0&lng=abc')
    ]);
    if (hits[4].status < 400) violate('an unsigned (alg none) token is rejected', `${hits[4].status}`);
    if (hits[5].status < 400) violate('a customer cannot open the admin user list', `${hits[5].status}`);
    if (hits[0].status === 200 || hits[1].status === 200) violate('injection-shaped sign-in never succeeds', raw.slice(0, 60));
  });

  const nurseBots = nurses.slice(0, nNurse).map(async (n, i) => {
    const tok = nurseTokens[i];
    if (!tok) return;
    await call('PUT', '/care/staff/availability', { token: tok, body: { online: true, lat: HOME.lat + (i % 10) * 0.001, lng: HOME.lng } });
    // Try to take / finish visits that aren't theirs.
    const target = allBookingIds[rand(Math.max(1, allBookingIds.length))];
    if (target) {
      const done = await call('PUT', `/bookings/${target}/complete`, { token: tok, body: { cashCollected: 1 } });
      if (done.status < 400) violate('a nurse cannot complete a visit that isn’t theirs', `${n.email} ${target}`);
      const take = await call('POST', `/bookings/${target}/offer/accept`, { token: tok });
      if (take.status < 400) {
        const b = await NurseBooking.findById(target).select('dispatch serviceProvider').lean();
        if (b && String(b.serviceProvider) !== String(n._id)) violate('accepting an offer only works for the offered nurse', target);
      }
    }
  });

  const partnerBots = partners.map(async (p, i) => {
    const tok = nurseTokens[nNurse + i];
    if (!tok) return;
    await Promise.all([1, 2, 3].map(() => call('POST', '/partners/me/withdrawals', { token: tok })));
  });

  await Promise.all([...customerBots, ...attackerBots, ...nurseBots, ...partnerBots]);
  const swarmSeconds = (Date.now() - t2) / 1000;
  clearInterval(progress);

  // ── Invariants ──
  console.log('Checking invariants…');
  const custIds = customers.map((c) => c._id);
  const dupes = await NurseBooking.aggregate([
    { $match: { patient: { $in: custIds }, status: { $ne: 'CANCELLED' } } },
    { $group: { _id: { p: '$patient', d: '$scheduledDate', t: '$scheduledTime', who: '$patientDetails.name' }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } }
  ]);
  if (dupes.length) violate('one live visit per customer, person and time', `${dupes.length} duplicates`);
  const inv = await VendorInventory.findOne({ vendor: store._id, medicine: med._id }).lean();
  const orders = await PharmacyOrder.find({ vendor: store._id, status: { $nin: ['CANCELLED', 'REJECTED'] } }).lean();
  const sold = orders.reduce((s, o) => s + o.items.reduce((a, it) => a + (String(it.medicine) === String(med._id) ? it.quantity : 0), 0), 0);
  if (inv.stockQty < 0) violate('stock never goes negative', inv.stockQty);
  if (sold > SCARCE_STOCK) violate('never sell more than the stock', { sold, stock: SCARCE_STOCK });
  if (sold + inv.stockQty !== SCARCE_STOCK) violate('units sold + units left = starting stock', { sold, left: inv.stockQty });
  const open = await WithdrawalRequest.aggregate([{ $match: { user: { $in: partners.map((p) => p._id) }, status: 'REQUESTED' } }, { $group: { _id: '$user', n: { $sum: 1 }, amount: { $max: '$amount' } } }]);
  open.forEach((o) => { if (o.n > 1) violate('one open withdrawal per partner', o); if (o.amount > 500) violate('withdrawal never above the balance', o); });
  if (stats.fiveHundreds.length) violate('no request fails with a server error', stats.fiveHundreds.slice(0, 5).join(' | '));

  const lat = stats.latencies.sort((a, b) => a - b);
  const pct = (p) => lat[Math.min(lat.length - 1, Math.floor((p / 100) * lat.length))];
  console.log(JSON.stringify({
    bots: BOTS,
    requests: stats.requests,
    signInRushSeconds: +signInSeconds.toFixed(1),
    swarmSeconds: +swarmSeconds.toFixed(1),
    statuses: stats.byStatus,
    latencyMs: { p50: pct(50), p95: pct(95), p99: pct(99), max: lat[lat.length - 1] },
    liveVisits: await NurseBooking.countDocuments({ patient: { $in: custIds }, status: { $ne: 'CANCELLED' } }),
    scarceMedicine: { startingStock: SCARCE_STOCK, sold, left: inv.stockQty, orders: orders.length },
    openWithdrawals: open.length,
    firstRefusalPerEndpoint: stats.firstRefusal,
    violations
  }, null, 1));

  // Clean up.
  await Promise.all([
    NurseBooking.deleteMany({ patient: { $in: custIds } }), PharmacyOrder.deleteMany({ vendor: store._id }),
    WithdrawalRequest.deleteMany({ user: { $in: nurses.map((n) => n._id) } }), SettlementEntry.deleteMany({ 'party.id': { $in: nurses.map((n) => n._id) } }),
    VendorInventory.deleteMany({ vendor: store._id }), Medicine.deleteOne({ _id: med._id }), PharmacyVendor.deleteOne({ _id: store._id }),
    Patient.deleteMany({ _id: { $in: custIds } }), User.deleteMany({ _id: { $in: nurses.map((n) => n._id) } })
  ]);
  server.close();
  await mongoose.disconnect();
  process.exit(violations.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
