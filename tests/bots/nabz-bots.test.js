/**
 * Bot testing: scripted customers, nurses, pharmacies and bad actors hit the
 * real API (real MongoDB replica set, so transactions are real) and check the
 * rules that must hold whatever the order, timing or input:
 *
 *   access  - nobody reads or changes someone else's visits, orders or admin data
 *   races   - double taps and simultaneous requests never double-book, double-sell,
 *             double-pay or double-complete
 *   states  - steps out of order are refused (complete before start, cancel after done...)
 *   time    - past, impossible and far-future times are refused
 *   fuzz    - malformed, oversized and injection-shaped input never causes a 500
 *
 * Every bot records findings instead of stopping at the first failure; the last
 * test lists them all. Run:
 *   MONGODB_URI=mongodb://127.0.0.1:28017/nabz_bots?replicaSet=testset \
 *     npx jest --config jest.config.js tests/bots --runInBand --forceExit --coverage=false
 */

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'b'.repeat(64);

const request = require('supertest');
const mongoose = require('mongoose');
const Patient = require('../../models/patient');
const User = require('../../models/user');
const NurseBooking = require('../../models/nurseBooking');
const ServiceCatalog = require('../../models/serviceCatalog');
const PharmacyVendor = require('../../models/pharmacyVendor');
const Medicine = require('../../models/medicine');
const VendorInventory = require('../../models/vendorInventory');
const PharmacyOrder = require('../../models/pharmacyOrder');
const SettlementEntry = require('../../models/settlementEntry');
const WithdrawalRequest = require('../../models/withdrawalRequest');

const RUN = `bot${Date.now().toString(36)}`;
const HOME = { lat: 26.9110, lng: 75.8010 };
const MOBILE = { 'X-Nocturnal-Mobile': 'expo' };
const PASSWORD = 'Strong@12345';
const findings = [];
const note = (bot, expected, got) => findings.push({ bot, expected, got: typeof got === 'string' ? got : JSON.stringify(got).slice(0, 300) });
const ist = (days = 0) => new Date(Date.now() + 330 * 60000 + days * 86400000).toISOString().slice(0, 10);
const bodyOf = (res) => res.body?.data || res.body || {};

describe('Nabz bots (real API, real MongoDB)', () => {
  let app;
  let db = false;
  const t = {}; // tokens
  const u = {}; // users / docs
  const auth = (tok) => ({ Authorization: `Bearer ${tok}`, ...MOBILE });

  const staffLogin = async (email, portal = 'staff') => (await request(app).post('/api/v1/auth/login').set(MOBILE).send({ email, password: PASSWORD, portal })).body.tokens?.accessToken;
  const patientLogin = async (email) => {
    const res = await request(app).post('/api/v1/patients/login').set(MOBILE).send({ email, password: PASSWORD });
    const b = bodyOf(res);
    return b.tokens?.accessToken || res.body.tokens?.accessToken;
  };
  const bookBody = (extra = {}) => ({
    serviceType: 'INJECTION', mode: 'SCHEDULED', scheduledDate: ist(1), scheduledTime: '11:00',
    scheduledTimezone: 'Asia/Kolkata', scheduledTimezoneOffsetMinutes: 330,
    serviceLocation: { type: 'HOME', address: { street: 'Ashok Marg', city: 'Jaipur', pincode: '302001', coordinates: HOME } },
    patientDetails: { name: 'Kamla Devi', age: 70, gender: 'Female' },
    ...extra
  });
  const book = (tok, extra) => request(app).post('/api/v1/bookings').set(auth(tok)).send(bookBody(extra));
  const bookingOf = (res) => res.body?.booking || bodyOf(res).booking;

  beforeAll(async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
      db = true;
    } catch (error) {
      console.warn(`Skipping bots: MongoDB unavailable (${error.message})`);
      return;
    }
    for (const M of [User, Patient, NurseBooking, ServiceCatalog, PharmacyVendor, Medicine, VendorInventory, PharmacyOrder, SettlementEntry, WithdrawalRequest]) await M.createIndexes();
    app = require('../../app');

    await ServiceCatalog.deleteMany({ name: 'INJECTION_IM' });
    u.service = await ServiceCatalog.create({
      name: 'INJECTION_IM', slug: `inj-${RUN}`, category: 'NURSING', displayName: 'IM Injection',
      pricing: { basePrice: 299, currency: 'INR' }, availability: { isActive: true, availableCities: ['Jaipur'] },
      requirements: { prescriptionRequired: false }
    });
    const verified = { idVerified: true, policeVerified: true, councilVerified: true };
    [u.n1, u.n2, u.n3, u.unverified, u.admin] = await User.create([
      { name: 'Asha Bot', email: `n1.${RUN}@nabz.test`, password: PASSWORD, phone: '9876511001', role: 'nurse', isVerified: true, careProfile: { gender: 'FEMALE', verification: verified } },
      { name: 'Ravi Bot', email: `n2.${RUN}@nabz.test`, password: PASSWORD, phone: '9876511002', role: 'nurse', isVerified: true, careProfile: { gender: 'MALE', verification: verified } },
      { name: 'Neha Bot', email: `n3.${RUN}@nabz.test`, password: PASSWORD, phone: '9876511003', role: 'nurse', isVerified: true, careProfile: { gender: 'FEMALE', verification: verified } },
      { name: 'Unverified Bot', email: `nu.${RUN}@nabz.test`, password: PASSWORD, phone: '9876511004', role: 'nurse', isVerified: true },
      { name: 'Ops Bot', email: `ops.${RUN}@nabz.test`, password: PASSWORD, phone: '9876511005', role: 'platform_admin', isVerified: true }
    ]);
    [u.p1, u.p2] = await Patient.create([
      { name: 'Priya Bot', email: `p1.${RUN}@nabz.test`, password: PASSWORD, phone: '9876511101' },
      { name: 'Rohan Bot', email: `p2.${RUN}@nabz.test`, password: PASSWORD, phone: '9876511102' }
    ]);
    // Two pharmacies, one medicine with a single unit left at store A.
    const northOf = (km) => [HOME.lng, HOME.lat + km / 111.2];
    [u.storeA, u.storeB] = await PharmacyVendor.create([
      { name: `Store A ${RUN}`, slug: `sa-${RUN}`, location: { type: 'Point', coordinates: northOf(1) }, serviceRadiusKm: 5, status: 'APPROVED', isActive: true, isOpen: true, deliveryFee: 20 },
      { name: `Store B ${RUN}`, slug: `sb-${RUN}`, location: { type: 'Point', coordinates: northOf(2) }, serviceRadiusKm: 5, status: 'APPROVED', isActive: true, isOpen: true, deliveryFee: 20 }
    ]);
    u.med = await Medicine.create({ name: `Paracetamol ${RUN}`, slug: `para-${RUN}`, form: 'TABLET' });
    await VendorInventory.create([
      { vendor: u.storeA._id, medicine: u.med._id, mrp: 30, sellingPrice: 25, stockQty: 1, stockUpdatedAt: new Date() },
      { vendor: u.storeB._id, medicine: u.med._id, mrp: 30, sellingPrice: 25, stockQty: 50, stockUpdatedAt: new Date() }
    ]);
    [u.vendorA, u.vendorB] = await User.create([
      { name: 'Vendor A', email: `va.${RUN}@nabz.test`, password: PASSWORD, phone: '9876511201', role: 'pharmacy_vendor', isVerified: true, pharmacyVendor: u.storeA._id },
      { name: 'Vendor B', email: `vb.${RUN}@nabz.test`, password: PASSWORD, phone: '9876511202', role: 'pharmacy_vendor', isVerified: true, pharmacyVendor: u.storeB._id }
    ]);

    t.n1 = await staffLogin(u.n1.email);
    t.n2 = await staffLogin(u.n2.email);
    t.n3 = await staffLogin(u.n3.email);
    t.unverified = await staffLogin(u.unverified.email);
    t.admin = await staffLogin(u.admin.email, 'admin');
    t.vendorA = await staffLogin(u.vendorA.email, 'pharmacy');
    t.vendorB = await staffLogin(u.vendorB.email, 'pharmacy');
    t.p1 = await patientLogin(u.p1.email);
    t.p2 = await patientLogin(u.p2.email);
    for (const [k, v] of Object.entries(t)) if (!v) note('setup', `token for ${k}`, 'no token');
  });

  afterAll(async () => {
    if (!db) return;
    const users = ['n1', 'n2', 'n3', 'unverified', 'admin', 'vendorA', 'vendorB'].map((k) => u[k]?._id).filter(Boolean);
    const patients = [u.p1?._id, u.p2?._id].filter(Boolean);
    await Promise.all([
      NurseBooking.deleteMany({ patient: { $in: patients } }),
      PharmacyOrder.deleteMany({ patient: { $in: patients } }),
      SettlementEntry.deleteMany({ 'party.id': { $in: [...users, u.storeA?._id, u.storeB?._id] } }),
      WithdrawalRequest.deleteMany({ user: { $in: users } }),
      VendorInventory.deleteMany({ medicine: u.med?._id }),
      Medicine.deleteMany({ _id: u.med?._id }),
      PharmacyVendor.deleteMany({ _id: { $in: [u.storeA?._id, u.storeB?._id] } }),
      User.deleteMany({ _id: { $in: users } }),
      Patient.deleteMany({ _id: { $in: patients } }),
      ServiceCatalog.deleteMany({ _id: u.service?._id })
    ]);
    await mongoose.disconnect();
  });

  // ── Access bots ───────────────────────────────────────────────────────────

  it('access bot: nobody touches someone else’s data', async () => {
    if (!db) return;
    const res = await book(t.p1);
    const b = bookingOf(res);
    if (!b) { note('access', 'P1 can book', res.status + ' ' + JSON.stringify(res.body).slice(0, 200)); return; }
    u.b1 = b._id;

    const checks = [
      ['other customer reads booking', request(app).get(`/api/v1/bookings/${b._id}`).set(auth(t.p2))],
      ['other customer cancels booking', request(app).put(`/api/v1/bookings/${b._id}/cancel`).set(auth(t.p2)).send({ reason: 'x' })],
      ['other customer reschedules booking', request(app).put(`/api/v1/bookings/${b._id}/reschedule`).set(auth(t.p2)).send({ scheduledDate: ist(2), scheduledTime: '12:00' })],
      ['other customer reads cancel quote', request(app).get(`/api/v1/bookings/${b._id}/cancel-quote`).set(auth(t.p2))],
      ['unassigned nurse reads booking', request(app).get(`/api/v1/bookings/${b._id}`).set(auth(t.n3))],
      ['unassigned nurse starts visit', request(app).put(`/api/v1/bookings/${b._id}/start`).set(auth(t.n3)).send({ visitCode: '0000' })],
      ['unassigned nurse completes visit', request(app).put(`/api/v1/bookings/${b._id}/complete`).set(auth(t.n3)).send({})],
      ['customer assigns a nurse', request(app).put(`/api/v1/bookings/${b._id}/assign`).set(auth(t.p1)).send({ providerId: String(u.n1._id) })],
      ['nurse changes status directly', request(app).put(`/api/v1/bookings/${b._id}/status`).set(auth(t.n1)).send({ status: 'COMPLETED' })],
      ['customer reads admin users', request(app).get('/api/v1/admin/ops/users').set(auth(t.p1))],
      ['nurse reads admin users', request(app).get('/api/v1/admin/ops/users').set(auth(t.n1))],
      ['nurse reads admin payments', request(app).get('/api/v1/admin/ops/payments').set(auth(t.n1))],
      ['vendor reviews documents', request(app).get('/api/v1/admin/ops/documents').set(auth(t.vendorA))],
      ['customer reads partner account', request(app).get('/api/v1/partners/me/account').set(auth(t.p1))],
      ['customer lists all bookings', request(app).get('/api/v1/bookings').set(auth(t.p1))],
      ['nurse lists all bookings', request(app).get('/api/v1/bookings').set(auth(t.n1))],
      ['anonymous books', request(app).post('/api/v1/bookings').set(MOBILE).send(bookBody())],
      ['garbage token', request(app).get('/api/v1/bookings/patient/me').set({ Authorization: 'Bearer abc.def.ghi' })]
    ];
    for (const [label, pending] of checks) {
      const r = await pending;
      if (r.status < 400) note('access', `${label} is refused`, `${r.status}`);
      if (r.status >= 500) note('access', `${label} fails cleanly (4xx)`, `${r.status}`);
    }
    // Nothing above changed the booking.
    const after = await NurseBooking.findById(b._id).lean();
    if (after.status !== b.status || String(after.scheduledDate) !== String(new Date(b.scheduledDate))) note('access', 'booking unchanged by refused requests', { status: after.status });
  });

  it('access bot: pharmacy orders stay with their customer and store', async () => {
    if (!db) return;
    const res = await request(app).post('/api/v1/pharmacy/orders').set(auth(t.p1)).send({
      vendorId: String(u.storeB._id), items: [{ medicineId: String(u.med._id), quantity: 2 }],
      deliveryAddress: { line1: '1 Test Road', city: 'Jaipur', pincode: '302001', contactPhone: '9876511101' },
      deliveryLocation: { coordinates: [HOME.lng, HOME.lat] }, paymentMode: 'COD'
    });
    const order = bodyOf(res).order || res.body.order;
    if (!order) { note('pharmacy-access', 'P1 can order from store B', `${res.status} ${JSON.stringify(res.body).slice(0, 200)}`); return; }
    u.order1 = order._id;
    for (const [label, pending] of [
      ['other customer reads order', request(app).get(`/api/v1/pharmacy/orders/${order._id}`).set(auth(t.p2))],
      ['other customer cancels order', request(app).post(`/api/v1/pharmacy/orders/${order._id}/cancel`).set(auth(t.p2)).send({ reason: 'x' })],
      ['other store reads order', request(app).get(`/api/v1/pharmacy/vendor/orders/${order._id}`).set(auth(t.vendorA))],
      ['other store accepts order', request(app).patch(`/api/v1/pharmacy/vendor/orders/${order._id}/status`).set(auth(t.vendorA)).send({ status: 'ACCEPTED' })],
      ['nurse reads store orders', request(app).get('/api/v1/pharmacy/vendor/orders').set(auth(t.n1))]
    ]) {
      const r = await pending;
      if (r.status < 400) note('pharmacy-access', `${label} is refused`, `${r.status}`);
      if (r.status >= 500) note('pharmacy-access', `${label} fails cleanly`, `${r.status}`);
    }
  });

  // ── Race bots ─────────────────────────────────────────────────────────────

  it('race bot: double-tapping "Book" creates one visit', async () => {
    if (!db) return;
    const extra = { scheduledDate: ist(3), scheduledTime: '15:00' };
    const rs = await Promise.all([book(t.p2, extra), book(t.p2, extra), book(t.p2, extra)]);
    const created = rs.filter((r) => r.status === 201).length;
    const count = await NurseBooking.countDocuments({ patient: u.p2._id, scheduledTime: '15:00', status: { $ne: 'CANCELLED' } });
    if (count > 1) note('race', 'three simultaneous identical bookings make one visit', `${count} visits created (${created} x 201)`);
    rs.forEach((r) => { if (r.status >= 500) note('race', 'duplicate booking refused cleanly', `${r.status}`); });
  });

  it('race bot: two customers buy the last unit at once', async () => {
    if (!db) return;
    const order = (tok, phone) => request(app).post('/api/v1/pharmacy/orders').set(auth(tok)).send({
      vendorId: String(u.storeA._id), items: [{ medicineId: String(u.med._id), quantity: 1 }],
      deliveryAddress: { line1: '2 Test Road', city: 'Jaipur', pincode: '302001', contactPhone: phone },
      deliveryLocation: { coordinates: [HOME.lng, HOME.lat] }, paymentMode: 'COD'
    });
    const rs = await Promise.all([order(t.p1, '9876511101'), order(t.p2, '9876511102')]);
    const ok = rs.filter((r) => r.status === 201 || r.status === 200).length;
    const stock = (await VendorInventory.findOne({ vendor: u.storeA._id, medicine: u.med._id }).lean()).stockQty;
    if (ok > 1) note('race', 'only one customer gets the last unit', `${ok} orders succeeded`);
    if (stock < 0) note('race', 'stock never goes negative', `stock ${stock}`);
    rs.forEach((r) => { if (r.status >= 500) note('race', 'sold-out order refused cleanly', `${r.status} ${JSON.stringify(r.body).slice(0, 150)}`); });
  });

  it('race bot: an offer accepted twice at once, and by the wrong nurse', async () => {
    if (!db) return;
    // Only n1 online, so the offer goes to n1.
    await request(app).put('/api/v1/care/staff/availability').set(auth(t.n1)).send({ online: true, lat: HOME.lat + 0.01, lng: HOME.lng });
    const res = await book(t.p1, { mode: 'ASAP', scheduledDate: ist(0), scheduledTime: '10:00' });
    const b = bookingOf(res);
    if (!b) { note('race', 'ASAP booking created', `${res.status} ${JSON.stringify(res.body).slice(0, 200)}`); return; }
    u.asap = b._id;
    const offer = (await request(app).get('/api/v1/bookings/offers/me').set(auth(t.n1))).body.offer;
    if (!offer) { note('race', 'nearest online nurse gets the offer', 'no offer'); return; }
    const rs = await Promise.all([
      request(app).post(`/api/v1/bookings/${b._id}/offer/accept`).set(auth(t.n1)),
      request(app).post(`/api/v1/bookings/${b._id}/offer/accept`).set(auth(t.n1)),
      request(app).post(`/api/v1/bookings/${b._id}/offer/accept`).set(auth(t.n2))
    ]);
    const after = await NurseBooking.findById(b._id).lean();
    if (String(after.serviceProvider) !== String(u.n1._id)) note('race', 'the offered nurse gets the visit', { provider: String(after.serviceProvider) });
    if (rs[2].status < 400) note('race', 'a nurse who was not offered cannot accept', `${rs[2].status}`);
    rs.forEach((r) => { if (r.status >= 500) note('race', 'duplicate accept refused cleanly', `${r.status}`); });
  });

  it('race bot: completing the same visit three times at once pays once', async () => {
    if (!db || !u.asap) return;
    const id = u.asap;
    const view = bodyOf(await request(app).get(`/api/v1/bookings/${id}/tracking`).set(auth(t.p1)));
    const code = view.visitCode || view.tracking?.visitCode;
    await request(app).put(`/api/v1/bookings/${id}/en-route`).set(auth(t.n1));
    const start = await request(app).put(`/api/v1/bookings/${id}/start`).set(auth(t.n1)).send({ visitCode: code });
    if (start.status >= 400) { note('race', 'visit starts with the right code', `${start.status} ${JSON.stringify(start.body).slice(0, 150)}`); return; }
    const rs = await Promise.all([1, 2, 3].map(() => request(app).put(`/api/v1/bookings/${id}/complete`).set(auth(t.n1)).send({ cashCollected: 299 })));
    const ok = rs.filter((r) => r.status === 200).length;
    const entries = await SettlementEntry.countDocuments({ 'source.id': id, type: 'PROVIDER_PAYOUT' });
    const cash = await SettlementEntry.countDocuments({ 'source.id': id, type: 'CASH_COLLECTED' });
    if (ok !== 1) note('race', 'exactly one completion succeeds', `${ok} succeeded`);
    if (entries > 1 || cash > 1) note('race', 'one payout and one cash entry per visit', { payout: entries, cash });
    rs.forEach((r) => { if (r.status >= 500) note('race', 'repeat completion refused cleanly', `${r.status}`); });
  });

  it('race bot: two withdrawals at once, and one bigger than the balance', async () => {
    if (!db) return;
    await User.updateOne({ _id: u.n1._id }, { $set: { payout: { method: 'UPI', upiId: 'asha@okicici', updatedAt: new Date(Date.now() - 2 * 86400000) } } });
    const before = (await request(app).get('/api/v1/partners/me/payouts').set(auth(t.n1))).body.payouts;
    const rs = await Promise.all([1, 2, 3].map(() => request(app).post('/api/v1/partners/me/withdrawals').set(auth(t.n1))));
    const open = await WithdrawalRequest.countDocuments({ user: u.n1._id, status: 'REQUESTED' });
    if (open > 1) note('race', 'one open withdrawal at a time', `${open} open`);
    const reqd = await WithdrawalRequest.findOne({ user: u.n1._id, status: 'REQUESTED' }).lean();
    if (reqd && before && reqd.amount > before.available + 0.01) note('race', 'withdrawal never exceeds the balance', { amount: reqd.amount, available: before.available });
    rs.forEach((r) => { if (r.status >= 500) note('race', 'duplicate withdrawal refused cleanly', `${r.status}`); });
  });

  // ── State bots ────────────────────────────────────────────────────────────

  it('state bot: steps out of order are refused', async () => {
    if (!db || !u.asap) return;
    const done = u.asap; // completed above
    for (const [label, pending] of [
      ['cancel a completed visit', request(app).put(`/api/v1/bookings/${done}/cancel`).set(auth(t.p1)).send({ reason: 'late' })],
      ['reschedule a completed visit', request(app).put(`/api/v1/bookings/${done}/reschedule`).set(auth(t.p1)).send({ scheduledDate: ist(2), scheduledTime: '12:00' })],
      ['start a completed visit again', request(app).put(`/api/v1/bookings/${done}/start`).set(auth(t.n1)).send({ visitCode: '0000' })],
      ['go en-route on a completed visit', request(app).put(`/api/v1/bookings/${done}/en-route`).set(auth(t.n1))]
    ]) {
      const r = await pending;
      if (r.status < 400) note('state', `${label} is refused`, `${r.status}`);
      if (r.status >= 500) note('state', `${label} fails cleanly`, `${r.status}`);
    }
    // SOS stays open for 30 minutes after a visit (the nurse may still be leaving).
    const sosAfter = await request(app).post(`/api/v1/bookings/${done}/sos`).set(auth(t.n1)).send({ lat: HOME.lat, lng: HOME.lng });
    if (sosAfter.status >= 400) note('state', 'SOS just after a visit still works', `${sosAfter.status}`);
    const reviewOk = await request(app).post(`/api/v1/bookings/${done}/review`).set(auth(t.p1)).send({ stars: 5, comment: 'Kind and on time' });
    const reviewAgain = await request(app).post(`/api/v1/bookings/${done}/review`).set(auth(t.p1)).send({ stars: 1, comment: 'again' });
    if (reviewOk.status >= 400) note('state', 'customer can review a completed visit', `${reviewOk.status} ${JSON.stringify(reviewOk.body).slice(0, 150)}`);
    if (reviewAgain.status < 400) note('state', 'a second review of the same visit is refused', `${reviewAgain.status}`);
    const reviewByOther = await request(app).post(`/api/v1/bookings/${done}/review`).set(auth(t.p2)).send({ stars: 1, comment: 'not mine' });
    if (reviewByOther.status < 400) note('state', 'another customer cannot review this visit', `${reviewByOther.status}`);

    // A fresh scheduled visit: complete / start before being assigned.
    const b = bookingOf(await book(t.p2, { scheduledDate: ist(4), scheduledTime: '09:00' }));
    if (b) {
      for (const [label, pending] of [
        ['complete before start', request(app).put(`/api/v1/bookings/${b._id}/complete`).set(auth(t.n1)).send({})],
        ['start without being assigned', request(app).put(`/api/v1/bookings/${b._id}/start`).set(auth(t.n1)).send({ visitCode: '1234' })],
        ['review before the visit', request(app).post(`/api/v1/bookings/${b._id}/review`).set(auth(t.p2)).send({ stars: 5, comment: 'early' })]
      ]) {
        const r = await pending;
        if (r.status < 400) note('state', `${label} is refused`, `${r.status}`);
        if (r.status >= 500) note('state', `${label} fails cleanly`, `${r.status}`);
      }
      const c1 = await request(app).put(`/api/v1/bookings/${b._id}/cancel`).set(auth(t.p2)).send({ reason: 'plans changed' });
      const c2 = await request(app).put(`/api/v1/bookings/${b._id}/cancel`).set(auth(t.p2)).send({ reason: 'again' });
      if (c1.status >= 400) note('state', 'customer can cancel an upcoming visit', `${c1.status} ${JSON.stringify(c1.body).slice(0, 150)}`);
      if (c2.status < 400) note('state', 'cancelling twice is refused', `${c2.status}`);
      const rs = await request(app).put(`/api/v1/bookings/${b._id}/reschedule`).set(auth(t.p2)).send({ scheduledDate: ist(5), scheduledTime: '10:00' });
      if (rs.status < 400) note('state', 'a cancelled visit cannot be rescheduled', `${rs.status}`);
      const sos = await request(app).post(`/api/v1/bookings/${b._id}/sos`).set(auth(t.p2)).send({});
      if (sos.status < 400) note('state', 'SOS on a cancelled visit is refused', `${sos.status}`);
      // The cancelled slot is free again.
      const again = await book(t.p2, { scheduledDate: ist(4), scheduledTime: '09:00' });
      if (again.status !== 201) note('state', 'the same slot can be booked again after cancelling', `${again.status} ${JSON.stringify(again.body).slice(0, 150)}`);
    }
  });

  // ── Time bots ─────────────────────────────────────────────────────────────

  it('time bot: impossible times are refused', async () => {
    if (!db) return;
    for (const [label, extra] of [
      ['yesterday', { scheduledDate: ist(-1), scheduledTime: '10:00' }],
      ['today but an hour ago', { scheduledDate: ist(0), scheduledTime: new Date(Date.now() + 270 * 60000).toISOString().slice(11, 16) }],
      ['hour 25', { scheduledDate: ist(1), scheduledTime: '25:00' }],
      ['minute 61', { scheduledDate: ist(1), scheduledTime: '10:61' }],
      ['31 February', { scheduledDate: '2027-02-31', scheduledTime: '10:00' }],
      ['two years ahead', { scheduledDate: ist(730), scheduledTime: '10:00' }],
      ['not a date', { scheduledDate: 'tomorrow', scheduledTime: '10:00' }]
    ]) {
      const r = await book(t.p1, extra);
      if (r.status < 400) note('time', `booking for ${label} is refused`, `${r.status}`);
      if (r.status >= 500) note('time', `booking for ${label} fails cleanly`, `${r.status}`);
    }
  });

  // ── Fuzz bots ─────────────────────────────────────────────────────────────

  it('fuzz bot: bad input never crashes the server', async () => {
    if (!db) return;
    const huge = 'x'.repeat(200000);
    const nasty = [
      {}, [], null, 'text', 12345, { $gt: '' }, { email: { $gt: '' }, password: { $gt: '' } },
      { name: huge }, { name: '<script>alert(1)</script>', age: -5 }, { age: 'NaN', rating: 99 },
      { scheduledDate: { $ne: null } }, { items: 'not-an-array' }, { items: [{ medicineId: { $gt: '' }, quantity: 1e12 }] },
      { lat: 'abc', lng: 999 }, { amount: -100 }, { code: '../../etc/passwd' }
    ];
    const targets = [
      ['POST', '/api/v1/patients/login', null],
      ['POST', '/api/v1/auth/login', null],
      ['POST', '/api/v1/patients/register', null],
      ['POST', '/api/v1/partners/apply', null],
      ['POST', '/api/v1/bookings', 'p1'],
      ['PUT', `/api/v1/bookings/${u.b1 || '000000000000000000000000'}/reschedule`, 'p1'],
      ['PUT', `/api/v1/bookings/${u.b1 || '000000000000000000000000'}/cancel`, 'p2'],
      ['POST', '/api/v1/pharmacy/orders', 'p1'],
      ['POST', '/api/v1/pharmacy/cart/plan', 'p1'],
      ['POST', '/api/v1/patients/me/referral', 'p1'],
      ['PUT', '/api/v1/patients/me/care-preferences', 'p1'],
      ['PUT', '/api/v1/partners/me/payout-details', 'n2'],
      ['PUT', '/api/v1/care/staff/availability', 'n2'],
      ['POST', '/api/v1/admin/ops/campaigns', 'admin'],
      ['PATCH', '/api/v1/admin/ops/users/customers/000000000000000000000000/status', 'admin']
    ];
    for (const [method, path, who] of targets) {
      for (const body of nasty) {
        const req = request(app)[method.toLowerCase()](path).set(who ? auth(t[who]) : MOBILE);
        const r = await req.set('Content-Type', 'application/json').send(JSON.stringify(body));
        if (r.status >= 500) note('fuzz', `${method} ${path} handles ${JSON.stringify(body).slice(0, 60)} without a 500`, `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
        if (path.endsWith('/login') && r.status === 200) note('fuzz', `${path} rejects ${JSON.stringify(body).slice(0, 60)}`, '200 signed in');
      }
    }
    // Broken JSON gets a clear 400, and no 500 ever shows internal error text.
    const broken = await request(app).post('/api/v1/patients/login').set(MOBILE).set('Content-Type', 'application/json').send('{"email": "a@b.c", ');
    if (broken.status !== 400) note('fuzz', 'broken JSON gets 400', `${broken.status}`);
    // Bad ids in the URL.
    for (const id of ['abc', '000000000000000000000000', '../admin', '%24gt', 'null', '1'.repeat(500)]) {
      for (const path of [`/api/v1/bookings/${id}`, `/api/v1/pharmacy/orders/${id}`, `/api/v1/care/track/${id}`, `/api/v1/profile-photo/user/${id}`]) {
        const r = await request(app).get(path).set(auth(t.p1));
        if (r.status >= 500) note('fuzz', `GET ${path} fails cleanly`, `${r.status}`);
      }
    }
    // Query-string junk.
    for (const q of ['lat=abc&lng=def', 'lat=91&lng=181', 'lat[$gt]=0&lng=1', 'radiusKm=-5&lat=26.9&lng=75.8', 'radiusKm=100000&lat=26.9&lng=75.8']) {
      for (const path of ['/api/v1/care/providers', '/api/v1/pharmacy/vendors/nearby', '/api/v1/pharmacy/medicines/search']) {
        const r = await request(app).get(`${path}?${q}`).set(auth(t.p1));
        if (r.status >= 500) note('fuzz', `GET ${path}?${q} fails cleanly`, `${r.status}`);
      }
    }
  });

  it('auth bot: a suspended account is locked out at once', async () => {
    if (!db) return;
    await User.updateOne({ _id: u.n3._id }, { $set: { isActive: false } });
    const r = await request(app).get('/api/v1/partners/me/account').set(auth(t.n3));
    if (r.status < 400) note('auth', 'suspended nurse’s existing token stops working', `${r.status}`);
    await Patient.updateOne({ _id: u.p2._id }, { $set: { isActive: false } });
    const r2 = await request(app).get('/api/v1/bookings/patient/me').set(auth(t.p2));
    if (r2.status < 400) note('auth', 'suspended customer’s existing token stops working', `${r2.status}`);
    const r3 = await request(app).post('/api/v1/patients/login').set(MOBILE).send({ email: u.p2.email, password: PASSWORD });
    if (r3.status < 400) note('auth', 'suspended customer cannot sign in', `${r3.status}`);
    const offer = await request(app).put('/api/v1/care/staff/availability').set(auth(t.unverified)).send({ online: true, lat: HOME.lat, lng: HOME.lng });
    if (offer.status < 400 && offer.body?.availability?.online) note('auth', 'unverified nurse cannot go online', `${offer.status}`);
  });

  it('reports every finding', () => {
    if (findings.length) console.log(`\n${findings.length} bot finding(s):\n${findings.map((f, i) => `${i + 1}. [${f.bot}] expected: ${f.expected}\n   got: ${f.got}`).join('\n')}`);
    expect(findings).toEqual([]);
  });
});
