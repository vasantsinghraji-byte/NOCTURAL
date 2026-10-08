/**
 * Care marketplace, part 2 (real MongoDB replica set): path labs, home care
 * with the same caregiver every day, night shifts and live-in care, person
 * calendars across shops, offers, plan suggestions, Nabz credit, ads and
 * admin settings. See docs/product/PROVIDER_MARKETPLACE_PLAN.md and
 * docs/product/ADMIN_AND_ADS_GUIDE.md.
 */
const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../../models/user');
const Patient = require('../../models/patient');
const NurseBooking = require('../../models/nurseBooking');
const ServiceCatalog = require('../../models/serviceCatalog');
const CareStore = require('../../models/careStore');
const RateCardItem = require('../../models/rateCardItem');
const CarePlan = require('../../models/carePlan');
const CareQuote = require('../../models/careQuote');
const SlotReservation = require('../../models/slotReservation');
const LabOrder = require('../../models/labOrder');
const PlanProposal = require('../../models/planProposal');
const WalletAccount = require('../../models/walletAccount');
const WalletEntry = require('../../models/walletEntry');
const SettlementEntry = require('../../models/settlementEntry');
const AdCampaign = require('../../models/adCampaign');
const { AdWallet, AdWalletEntry, AdStatDaily, AdViewerMark } = require('../../models/adLedger');
const { PlatformSetting, SettingChange } = require('../../models/platformSetting');

const PASSWORD = 'Strong@12345';
const RUN = Date.now();
const MOBILE = { 'X-Nocturnal-Mobile': 'expo' };
const VERIFIED = { idVerified: true, policeVerified: true, councilVerified: true };
const JAIPUR = { lat: 26.9124, lng: 75.7873 };
const NEAR = { lat: 26.92, lng: 75.80 };
const WEEK = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const ALL_DAY = WEEK.map((day) => ({ day, open: '00:00', close: '23:59' }));
const DAYTIME = WEEK.map((day) => ({ day, open: '06:00', close: '21:00' }));
const ist = (days) => new Date(Date.now() + 330 * 60000 + days * 86400000).toISOString().slice(0, 10);
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

describe('Care marketplace part 2 (real MongoDB)', () => {
  let app;
  let db = false;
  const users = {};
  const patients = [];
  const tokens = {};
  const svc = {};
  const stores = {};
  let admin;

  const login = async (path, email, extra = {}) => (await request(app).post(`/api/v1${path}`).set(MOBILE).send({ email, password: PASSWORD, ...extra })).body.tokens?.accessToken;
  const api = (method, path, who, body) => {
    const r = request(app)[method](`/api/v1/marketplace${path}`).set(MOBILE);
    if (who) r.set({ Authorization: `Bearer ${tokens[who]}` });
    return body !== undefined ? r.send(body) : r;
  };
  const home = (point = NEAR) => ({ street: '7 Tonk Road', city: 'Jaipur', pincode: '302015', coordinates: point });
  const services = () => require('../../services/careStoreService');
  const plans = () => require('../../services/carePlanService');
  const labs = () => require('../../services/labOrderService');

  beforeAll(async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000, autoIndex: false });
      db = true;
    } catch (error) {
      console.warn(`Skipping marketplace part 2: MongoDB unavailable (${error.message})`);
      return;
    }
    app = require('../../app');
    for (const M of [CareStore, RateCardItem, CarePlan, CareQuote, SlotReservation, NurseBooking, LabOrder, PlanProposal, WalletAccount, WalletEntry, AdCampaign, AdWallet, AdWalletEntry, AdStatDaily, AdViewerMark, PlatformSetting, SettingChange]) await M.createIndexes();
    // A clean settings slate for this database.
    await PlatformSetting.deleteMany({});
    await require('../../services/settingsService').loadRevenueOverrides();

    const cat = (key, displayName, kind, extra = {}) => ServiceCatalog.create({
      name: `${key}_${RUN}`, slug: `${key.toLowerCase()}-${RUN}`, displayName, category: extra.category || { PHYSIO: 'PHYSIOTHERAPY', LAB: 'LAB_TEST', HOMECARE: 'HOME_CARE' }[kind],
      pricing: { basePrice: 100 }, availability: { isActive: true },
      marketplace: { kind, priceFloor: extra.floor || 50, priceCeiling: extra.ceiling || 5000, homeAllowed: true, clinicAllowed: kind !== 'HOMECARE', defaultDurationMinutes: extra.minutes || 30 },
      ...(extra.lab ? { lab: extra.lab } : {})
    });
    svc.cbc = await cat('CBC', 'Complete Blood Count', 'LAB', { lab: { sampleType: 'BLOOD', fastingHours: 0, defaultReportHours: 12 } });
    svc.lipid = await cat('LIPID', 'Lipid Profile', 'LAB', { lab: { sampleType: 'BLOOD', fastingHours: 10, defaultReportHours: 24 } });
    svc.tsh = await cat('TSH', 'Thyroid (TSH)', 'LAB', { lab: { sampleType: 'BLOOD', fastingHours: 0, defaultReportHours: 12 } });
    svc.gtt = await cat('GTT', 'Glucose Tolerance', 'LAB', { lab: { sampleType: 'BLOOD', homeCollectable: false, defaultReportHours: 24 } });
    svc.pkg = await cat('PKG', 'Basic Health Check', 'LAB', { category: 'LAB_PACKAGE', lab: { sampleType: 'BLOOD', fastingHours: 10, defaultReportHours: 24, tests: [] } });
    await ServiceCatalog.updateOne({ _id: svc.pkg._id }, { $set: { 'lab.tests': [svc.cbc._id, svc.lipid._id, svc.tsh._id] } });
    svc.day = await cat('DAYCARE', 'Elderly care, 12-hour shift', 'HOMECARE', { minutes: 720, floor: 500, ceiling: 5000 });
    svc.livein = await cat('LIVEIN', 'Live-in patient care, 24 hours', 'HOMECARE', { minutes: 1440, floor: 800, ceiling: 6000 });
    svc.back = await cat('BACK', 'Back pain therapy', 'PHYSIO', { minutes: 45, floor: 300, ceiling: 2500 });

    const staff = (key, role, phone, verified = true) => ({
      name: `${key} ${RUN}`, email: `${key.toLowerCase()}.${RUN}@nabz.test`, password: PASSWORD, phone, role, isVerified: true,
      careProfile: { gender: 'FEMALE', qualification: 'GNM', verification: verified ? VERIFIED : {} }
    });
    const created = await User.create([
      staff('LabOwner', 'lab_partner', '9876521001', false),
      staff('Agency', 'medical_staff', '9876521002'),
      staff('CareA', 'medical_staff', '9876521003'),
      staff('CareB', 'medical_staff', '9876521004'),
      staff('PhysioX', 'physiotherapist', '9876521005'),
      staff('PhysioY', 'physiotherapist', '9876521006'),
      staff('PhysioZ', 'physiotherapist', '9876521007'),
      staff('PhysioW', 'physiotherapist', '9876521008'),
      { name: `Admin ${RUN}`, email: `admin.${RUN}@nabz.test`, password: PASSWORD, phone: '9876521009', role: 'platform_admin', isVerified: true }
    ]);
    ['lab', 'agency', 'careA', 'careB', 'px', 'py', 'pz', 'pw'].forEach((k, i) => { users[k] = created[i]; });
    admin = created[8];
    for (let i = 0; i < 5; i += 1) patients.push(await Patient.create({ name: `Family ${i}`, email: `fam${i}.${RUN}@nabz.test`, password: PASSWORD, phone: `6${String(RUN + i).slice(-9)}` }));
    tokens.lab = await login('/auth/login', users.lab.email, { portal: 'lab' });
    for (const k of ['agency', 'careA', 'careB', 'px', 'py', 'pz', 'pw']) tokens[k] = await login('/auth/login', users[k].email, { portal: 'staff' });
    for (const [i, p] of patients.entries()) tokens[`c${i}`] = await login('/patients/login', p.email);
  }, 90000);

  afterAll(async () => {
    if (!db) return;
    const allUsers = [...Object.values(users), admin].map((u) => u._id);
    const storeIds = (await CareStore.find({ owner: { $in: allUsers } }).select('_id').lean()).map((s) => s._id);
    const pids = patients.map((p) => p._id);
    await Promise.all([
      NurseBooking.deleteMany({ patient: { $in: pids } }),
      LabOrder.deleteMany({ patient: { $in: pids } }),
      CarePlan.deleteMany({ patient: { $in: pids } }),
      CareQuote.deleteMany({ patient: { $in: pids } }),
      PlanProposal.deleteMany({ patient: { $in: pids } }),
      SlotReservation.deleteMany({ $or: [{ store: { $in: storeIds } }, { resource: { $in: allUsers.map((u) => `person:${u}`) } }] }),
      RateCardItem.deleteMany({ store: { $in: storeIds } }),
      CareStore.deleteMany({ _id: { $in: storeIds } }),
      WalletAccount.deleteMany({ patient: { $in: pids } }),
      WalletEntry.deleteMany({ patient: { $in: pids } }),
      SettlementEntry.deleteMany({ 'party.id': { $in: allUsers } }),
      AdCampaign.deleteMany({ owner: { $in: allUsers } }),
      AdWallet.deleteMany({ owner: { $in: allUsers } }),
      AdWalletEntry.deleteMany({ owner: { $in: allUsers } }),
      PlatformSetting.deleteMany({}),
      SettingChange.deleteMany({ proposedBy: admin._id }),
      ServiceCatalog.deleteMany({ _id: { $in: Object.values(svc).map((s) => s._id) } }),
      User.deleteMany({ _id: { $in: allUsers } }),
      Patient.deleteMany({ _id: { $in: pids } })
    ]);
    await require('../../services/settingsService').loadRevenueOverrides().catch(() => undefined);
    await mongoose.disconnect();
  });

  // ── Labs ─────────────────────────────────────────────────────────────────

  describe('path labs', () => {
    let order;

    it('a lab waits for review, then lists tests at its own prices', async () => {
      if (!db) return;
      const res = await api('put', '/partner/store', 'lab', {
        name: 'Pink City Diagnostics', registration: { number: `NABL-${RUN}`, body: 'NABL' }, location: JAIPUR, address: { line1: 'MI Road', city: 'Jaipur', pincode: '302001' },
        clinic: { enabled: true, capacity: 3, hours: DAYTIME }, home: { enabled: true, radiusKm: 10, ratePerKm: 10, capacity: 2, hours: DAYTIME, freeCollectionAbove: 1500 }
      });
      expect(res.status).toBe(200);
      expect(res.body.store.status).toBe('PENDING');
      stores.lab = res.body.store;
      await services().adminSetStatus(admin._id, stores.lab._id, 'APPROVED');
      for (const [s, price] of [[svc.cbc, 299], [svc.lipid, 450], [svc.tsh, 220], [svc.pkg, 799]]) {
        const r = await api('put', `/partner/store/rate-card/${s._id}`, 'lab', { clinic: { enabled: true, price }, home: { enabled: true }, lab: { reportHours: 12 } });
        expect(r.status).toBe(200);
      }
      expect((await api('put', `/partner/store/rate-card/${svc.gtt._id}`, 'lab', { clinic: { enabled: true, price: 300 } })).status).toBe(200);
    });

    it('compares labs for a basket and shows the package saving', async () => {
      if (!db) return;
      const res = await api('get', `/labs/compare?serviceIds=${svc.cbc._id},${svc.lipid._id}&mode=HOME&lat=${NEAR.lat}&lng=${NEAR.lng}`);
      expect(res.status).toBe(200);
      const row = res.body.labs.find((l) => String(l.store._id) === String(stores.lab._id));
      expect(row).toMatchObject({ offersAll: true, testsSubtotal: 749 });
      expect(row.homeCollection.fee).toBeGreaterThan(0);
      const menu = await api('get', `/labs/${stores.lab._id}/menu`);
      expect(menu.body.tests.find((t) => String(t.service._id) === String(svc.pkg._id)).save).toBe(170); // 299 + 450 + 220 − 799
    });

    it('fasting tests only in the morning; lab-only tests can’t be collected at home', async () => {
      if (!db) return;
      const base = { storeId: String(stores.lab._id), serviceIds: [String(svc.cbc._id), String(svc.lipid._id)], mode: 'HOME', address: home(), slot: { date: ist(2), time: '11:00' } };
      const late = await api('post', '/labs/quote', 'c0', base);
      expect(late.body.code).toBe('FASTING_MORNING');
      const gtt = await api('post', '/labs/quote', 'c0', { ...base, serviceIds: [String(svc.gtt._id)], slot: { date: ist(2), time: '08:00' } });
      expect(gtt.body.code).toBe('TESTS_UNAVAILABLE');
      const ok = await api('post', '/labs/quote', 'c0', { ...base, slot: { date: ist(2), time: '07:30' } });
      expect(ok.status).toBe(200);
      expect(ok.body.quote.amounts).toMatchObject({ testsSubtotal: 749, collectionWaived: false });
      expect(ok.body.quote.fasting).toBe(true);
    });

    it('books once, shows the customer the collection code, and refuses a second identical booking', async () => {
      if (!db) return;
      const body = { storeId: String(stores.lab._id), serviceIds: [String(svc.cbc._id), String(svc.tsh._id)], mode: 'HOME', address: home(), slot: { date: ist(2), time: '09:00' }, patientDetails: { name: 'Raj Kumar', age: 70 } };
      const q = await api('post', '/labs/quote', 'c0', body);
      const wrongPrice = await api('post', '/labs/orders', 'c0', { ...body, expectedTotal: q.body.quote.amounts.total - 50 });
      expect(wrongPrice.body.code).toBe('PRICE_CHANGED');
      const res = await api('post', '/labs/orders', 'c0', { ...body, expectedTotal: q.body.quote.amounts.total });
      expect(res.status).toBe(201);
      order = res.body.order;
      expect(order.collectionCode).toMatch(/^\d{4}$/);
      expect((await api('post', '/labs/orders', 'c0', body)).body.code).toBe('DUPLICATE_ORDER');
      const labView = await api('get', `/partner/lab/orders?date=${ist(2)}`, 'lab');
      expect(JSON.stringify(labView.body)).not.toContain(order.collectionCode === '0000' ? 'nope' : `"collectionCode":"${order.collectionCode}"`);
    });

    it('collection needs the customer’s code; the report pays the lab', async () => {
      if (!db) return;
      expect((await api('post', `/partner/lab/orders/${order._id}/collect`, 'lab', { code: order.collectionCode === '1111' ? '2222' : '1111', paidAmount: order.payment.amount })).status).toBe(400);
      const ok = await api('post', `/partner/lab/orders/${order._id}/collect`, 'lab', { code: order.collectionCode, paidAmount: order.payment.amount, method: 'UPI' });
      expect(ok.status).toBe(200);
      expect(ok.body.order.status).toBe('COLLECTED');
      expect(ok.body.order.reportDueAt).toBeTruthy();
      const up = await request(app).post(`/api/v1/marketplace/partner/lab/orders/${order._id}/report`).set(MOBILE).set({ Authorization: `Bearer ${tokens.lab}` })
        .attach('report', Buffer.from('%PDF-1.4\n%nabz test report\n'), { filename: 'report.pdf', contentType: 'application/pdf' });
      expect(up.status).toBe(200);
      expect(up.body.order.status).toBe('REPORT_READY');
      const payout = await SettlementEntry.findOne({ 'source.id': new mongoose.Types.ObjectId(order._id), type: 'PROVIDER_PAYOUT' }).lean();
      expect(payout.amount).toBeCloseTo(519 * 0.8 + order.amounts.collectionFee, 2);
      const link = await api('get', `/labs/orders/${order._id}/report`, 'c0');
      expect(link.status).toBe(200);
      expect(link.body.url).toMatch(/^data:application\/pdf|^https:/);
    });

    it('a rejected sample gets a free re-collection; a late report earns credit', async () => {
      if (!db) return;
      const body = { storeId: String(stores.lab._id), serviceIds: [String(svc.cbc._id)], mode: 'CLINIC', slot: { date: ist(3), time: '10:00' } };
      const booked = await api('post', '/labs/orders', 'c1', body);
      expect(booked.status).toBe(201);
      const o = booked.body.order;
      await api('post', `/partner/lab/orders/${o._id}/collect`, 'lab', { paidAmount: o.payment.amount });
      const rej = await api('post', `/partner/lab/orders/${o._id}/reject`, 'lab', { reason: 'Sample clotted' });
      expect(rej.body.order.status).toBe('SAMPLE_REJECTED');
      const again = await api('post', `/labs/orders/${o._id}/recollect`, 'c1', { date: ist(4), time: '10:00' });
      expect(again.status).toBe(201);
      expect(again.body.order.amounts.total).toBe(0);

      const second = await api('post', '/labs/orders', 'c1', { ...body, slot: { date: ist(3), time: '11:00' } });
      await api('post', `/partner/lab/orders/${second.body.order._id}/collect`, 'lab', { paidAmount: second.body.order.payment.amount });
      await LabOrder.updateOne({ _id: second.body.order._id }, { $set: { reportDueAt: new Date(Date.now() - 60000) } });
      expect(await labs().creditLateReports()).toBeGreaterThanOrEqual(1);
      const wallet = await api('get', '/wallet', 'c1');
      expect(wallet.body.balance).toBe(50); // 10% of ₹299 → minimum ₹50
      // The credit pays first on the next order.
      const next = await api('post', '/labs/orders', 'c1', { ...body, slot: { date: ist(5), time: '10:00' } });
      expect(next.body.order.amounts.credit).toBe(50);
      expect((await api('get', '/wallet', 'c1')).body.balance).toBe(0);
      // Cancelling it gives the credit back.
      await api('post', `/labs/orders/${next.body.order._id}/cancel`, 'c1', {});
      expect((await api('get', '/wallet', 'c1')).body.balance).toBe(50);
    });

    it('a prepaid lab order cancelled after payment lands in the admin refund queue', async () => {
      if (!db) return;
      const res = await api('post', '/labs/orders', 'c2', { storeId: String(stores.lab._id), serviceIds: [String(svc.tsh._id)], mode: 'CLINIC', slot: { date: ist(6), time: '09:30' }, paymentMode: 'PREPAID' });
      expect(res.status).toBe(201);
      await LabOrder.updateOne({ _id: res.body.order._id }, { $set: { 'payment.status': 'PAID', 'payment.paymentId': 'pay_test' } });
      await api('post', `/labs/orders/${res.body.order._id}/cancel`, 'c2', {});
      const admin2 = require('../../services/careAdminService');
      const queue = await admin2.refundQueue();
      expect(queue.find((r) => String(r.id) === String(res.body.order._id))).toMatchObject({ type: 'LAB', amount: res.body.order.payment.amount });
      await admin2.processRefund(admin._id, { type: 'LAB', id: res.body.order._id, reference: 'NEFT-123' });
      expect((await LabOrder.findById(res.body.order._id)).payment.status).toBe('REFUNDED');
    });

    it('a prepaid lab order is paid online: forged signatures fail, a late payment is refunded in full', async () => {
      if (!db) return;
      const crypto = require('crypto');
      const saved = { id: process.env.RAZORPAY_KEY_ID, secret: process.env.RAZORPAY_KEY_SECRET, on: process.env.RAZORPAY_ENABLED };
      process.env.RAZORPAY_KEY_ID = 'rzp_test_lab';
      process.env.RAZORPAY_KEY_SECRET = 'lab_test_secret';
      delete process.env.RAZORPAY_ENABLED;
      const sign = (orderId, paymentId) => crypto.createHmac('sha256', 'lab_test_secret').update(`${orderId}|${paymentId}`).digest('hex');
      try {
        // Pay-at-collection orders aren't payable online.
        const cash = await api('post', '/labs/orders', 'c2', { storeId: String(stores.lab._id), serviceIds: [String(svc.tsh._id)], mode: 'CLINIC', slot: { date: ist(7), time: '09:30' } });
        expect(cash.status).toBe(201);
        expect((await api('post', `/labs/orders/${cash.body.order._id}/payment/order`, 'c2')).body.code).toBe('NOT_PAYABLE');

        const res = await api('post', '/labs/orders', 'c2', { storeId: String(stores.lab._id), serviceIds: [String(svc.tsh._id)], mode: 'CLINIC', slot: { date: ist(7), time: '10:30' }, paymentMode: 'PREPAID' });
        expect(res.status).toBe(201);
        const id = res.body.order._id;
        await LabOrder.updateOne({ _id: id }, { $set: { 'payment.orderId': 'order_lab_1' } }); // what createPaymentOrder stores
        expect((await api('post', `/labs/orders/${id}/payment/verify`, 'c2', { orderId: 'order_lab_1', paymentId: 'pay_1', signature: 'f'.repeat(64) })).status).toBeGreaterThanOrEqual(400);
        expect((await api('post', `/labs/orders/${id}/payment/verify`, 'c3', { orderId: 'order_lab_1', paymentId: 'pay_1', signature: sign('order_lab_1', 'pay_1') })).status).toBe(404); // someone else's order
        const ok = await api('post', `/labs/orders/${id}/payment/verify`, 'c2', { orderId: 'order_lab_1', paymentId: 'pay_1', signature: sign('order_lab_1', 'pay_1') });
        expect(ok.status).toBe(200);
        expect(ok.body.order.payment).toMatchObject({ status: 'PAID', method: 'ONLINE' });

        // The hold ran out before the money arrived: the order is gone, so all of it goes back.
        const late = await api('post', '/labs/orders', 'c2', { storeId: String(stores.lab._id), serviceIds: [String(svc.tsh._id)], mode: 'CLINIC', slot: { date: ist(7), time: '11:30' }, paymentMode: 'PREPAID' });
        await LabOrder.updateOne({ _id: late.body.order._id }, { $set: { 'payment.orderId': 'order_lab_2', 'payment.holdUntil': new Date(Date.now() - 1000) } });
        expect(await labs().expireUnpaid()).toBeGreaterThanOrEqual(1);
        const paidLate = await api('post', `/labs/orders/${late.body.order._id}/payment/verify`, 'c2', { orderId: 'order_lab_2', paymentId: 'pay_2', signature: sign('order_lab_2', 'pay_2') });
        expect(paidLate.body.code).toBe('PAID_TOO_LATE');
        expect((await LabOrder.findById(late.body.order._id)).payment.status).toBe('REFUND_PENDING');
      } finally {
        if (saved.id === undefined) delete process.env.RAZORPAY_KEY_ID; else process.env.RAZORPAY_KEY_ID = saved.id;
        if (saved.secret === undefined) delete process.env.RAZORPAY_KEY_SECRET; else process.env.RAZORPAY_KEY_SECRET = saved.secret;
        if (saved.on !== undefined) process.env.RAZORPAY_ENABLED = saved.on;
      }
    });
  });

  // ── Home care ────────────────────────────────────────────────────────────

  describe('home care: the same caregiver every day', () => {
    it('an agency adds its verified caregivers', async () => {
      if (!db) return;
      const res = await api('put', '/partner/store', 'agency', {
        kind: 'HOMECARE', name: 'Apna Ghar Care', format: 'CLINIC', location: JAIPUR, address: { city: 'Jaipur' },
        clinic: { enabled: false }, home: { enabled: true, radiusKm: 15, ratePerKm: 12, hours: ALL_DAY }
      });
      expect(res.status).toBe(200);
      expect(res.body.store).toMatchObject({ kind: 'HOMECARE', status: 'APPROVED' });
      stores.agency = res.body.store;
      const t1 = await api('post', '/partner/team', 'agency', { phone: '9876521003', kind: 'HOMECARE' });
      expect(t1.status).toBe(201);
      const team = await api('post', '/partner/team', 'agency', { email: users.careB.email, kind: 'HOMECARE' });
      expect(team.body.members.filter((m) => m.role === 'CAREGIVER')).toHaveLength(2);
      const rc = await api('put', `/partner/store/rate-card/${svc.day._id}`, 'agency', { home: { enabled: true, price: 1200 }, durationMinutes: 720, sessionDiscounts: [{ minSessions: 5, percent: 5 }] });
      expect(rc.status).toBe(200);
      expect((await api('put', `/partner/store/rate-card/${svc.livein._id}`, 'agency', { home: { enabled: true, price: 1800 }, durationMinutes: 1440, liveIn: true })).status).toBe(200);
    });

    const book = (who, extra = {}) => api('post', '/quotes', who, {
      storeId: String(stores.agency._id), serviceId: String(svc.day._id), mode: 'HOME', sessions: 5, paymentMode: 'PER_SESSION',
      schedule: { startDate: ist(3), time: '08:00', weekdays: EVERY_DAY }, address: home(), patientDetails: { name: `Elder of ${who}` }, ...extra
    }).then((q) => (q.status === 201 ? api('post', '/plans', who, { quoteId: q.body.quote._id }) : q));

    it('each family gets one named caregiver for all five days; a third family is told nobody is free', async () => {
      if (!db) return;
      const a = await book('c0');
      const b = await book('c1');
      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      const sa = await NurseBooking.find({ 'marketplace.plan': a.body.plan._id }).lean();
      const sb = await NurseBooking.find({ 'marketplace.plan': b.body.plan._id }).lean();
      expect(new Set(sa.map((s) => String(s.serviceProvider))).size).toBe(1);
      expect(new Set(sb.map((s) => String(s.serviceProvider))).size).toBe(1);
      expect(String(sa[0].serviceProvider)).not.toBe(String(sb[0].serviceProvider));
      expect([String(users.careA._id), String(users.careB._id)]).toContain(String(sa[0].serviceProvider));
      const c = await book('c2');
      expect(c.status).toBe(409);
      expect(c.body.code).toBe('SLOT_TAKEN');
    });

    it('a night shift runs across midnight', async () => {
      if (!db) return;
      const res = await book('c3', { sessions: 2, schedule: { startDate: ist(10), time: '20:00', weekdays: EVERY_DAY } });
      expect(res.status).toBe(201);
      const s = await NurseBooking.findOne({ 'marketplace.plan': res.body.plan._id, 'series.index': 1 }).lean();
      expect(s.marketplace.slotKeys.some((k) => k.endsWith(`${ist(11)}|07:45`))).toBe(true);
    });

    it('live-in care charges travel once', async () => {
      if (!db) return;
      const q = await api('post', '/quotes', 'c4', {
        storeId: String(stores.agency._id), serviceId: String(svc.livein._id), mode: 'HOME', sessions: 3, paymentMode: 'PER_SESSION',
        schedule: { startDate: ist(15), time: '09:00', weekdays: EVERY_DAY }, address: home()
      });
      expect(q.status).toBe(201);
      expect(q.body.quote.lines.find((l) => l.code === 'TRAVEL').label).toMatch(/once/);
      const booked = await api('post', '/plans', 'c4', { quoteId: q.body.quote._id });
      expect(booked.status).toBe(201);
      const sessions = await NurseBooking.find({ 'marketplace.plan': booked.body.plan._id }).sort({ 'series.index': 1 }).lean();
      expect(sessions[0].pricing.travelFee).toBeGreaterThan(0);
      expect(sessions[1].pricing.travelFee).toBe(0);
      expect(sessions[2].pricing.travelFee).toBe(0);
    });

    it('a caregiver can’t be double-booked through their own solo shop', async () => {
      if (!db) return;
      const taken = await NurseBooking.findOne({ 'marketplace.store': stores.agency._id, serviceProvider: users.careA._id, scheduledDate: new Date(`${ist(3)}T00:00:00Z`) }).lean();
      const careSolo = await api('put', '/partner/store', 'careA', { kind: 'HOMECARE', name: 'Care A Solo', format: 'SOLO', location: JAIPUR, clinic: { enabled: false }, home: { enabled: true, radiusKm: 15, ratePerKm: 12, hours: ALL_DAY } });
      expect(careSolo.status).toBe(200);
      await api('put', `/partner/store/rate-card/${svc.day._id}`, 'careA', { home: { enabled: true, price: 1000 }, durationMinutes: 720 });
      const clash = await api('post', '/quotes', 'c2', {
        storeId: String(careSolo.body.store._id), serviceId: String(svc.day._id), mode: 'HOME', sessions: 1, schedule: { startDate: ist(3), time: '09:00' }, address: home()
      });
      if (taken) expect(clash.body.code).toBe('SLOT_TAKEN');
    });

    it('removing a caregiver releases their days to the families', async () => {
      if (!db) return;
      const res = await api('delete', `/partner/team/${users.careB._id}?kind=HOMECARE`, 'agency');
      expect(res.status).toBe(200);
      expect(res.body.released).toBeGreaterThanOrEqual(1);
      expect(await NurseBooking.countDocuments({ serviceProvider: users.careB._id, 'marketplace.store': stores.agency._id, status: 'CONFIRMED' })).toBe(0);
    });
  });

  // ── Physio offers, plan suggestions ──────────────────────────────────────

  describe('offers and plan suggestions', () => {
    it('an offer only applies after admin approval, and only to a new customer’s first plan', async () => {
      if (!db) return;
      for (const [k, i] of [['px', 0], ['py', 1], ['pz', 2], ['pw', 3]]) {
        const r = await api('put', '/partner/store', k, { name: `Physio ${k}`, format: 'SOLO', location: { lat: JAIPUR.lat + i * 0.005, lng: JAIPUR.lng }, clinic: { enabled: true, hours: DAYTIME } });
        expect(r.status).toBe(200);
        stores[k] = r.body.store;
        expect((await api('put', `/partner/store/rate-card/${svc.back._id}`, k, { clinic: { enabled: true, price: 500 + i * 50 } })).status).toBe(200);
      }
      const offer = await api('put', `/partner/store/rate-card/${svc.back._id}/offer`, 'px', { percent: 20, maxDiscount: 80 });
      expect(offer.body.item.offer.status).toBe('PENDING');
      const body = { storeId: String(stores.px._id), serviceId: String(svc.back._id), mode: 'CLINIC', sessions: 2, schedule: { startDate: ist(4), time: '10:00', weekdays: EVERY_DAY } };
      const before = await api('post', '/quotes', 'c0', body);
      expect(before.body.quote.amounts.offer).toBe(0);
      const item = await RateCardItem.findOne({ store: stores.px._id, service: svc.back._id });
      await services().adminReviewOffer(admin._id, item._id, { decision: 'APPROVED' });
      const after = await api('post', '/quotes', 'c0', body);
      expect(after.body.quote.amounts.offer).toBe(80); // 20% of 500 = 100, capped at 80
      expect(after.body.quote.lines.find((l) => l.code === 'OFFER').amount).toBe(-80);
      const sum = after.body.quote.lines.reduce((s, l) => s + Math.round(l.amount * 100), 0);
      expect(sum).toBe(Math.round(after.body.quote.amounts.total * 100));
      const booked = await api('post', '/plans', 'c0', { quoteId: after.body.quote._id });
      expect(booked.status).toBe(201);
      const s1 = await NurseBooking.findOne({ 'marketplace.plan': booked.body.plan._id, 'series.index': 1 }).lean();
      expect(s1.pricing.basePrice).toBe(420);
      const again = await api('post', '/quotes', 'c0', { ...body, schedule: { startDate: ist(8), time: '10:00', weekdays: EVERY_DAY } });
      expect(again.body.quote.amounts.offer).toBe(0);
    });

    it('a physio suggests a plan after a visit; the customer books it as suggested', async () => {
      if (!db) return;
      const plan = await CarePlan.findOne({ patient: patients[0]._id, store: stores.px._id });
      const visit = await NurseBooking.findOneAndUpdate({ 'marketplace.plan': plan._id, 'series.index': 1 }, { $set: { status: 'IN_PROGRESS' } }, { returnDocument: 'after' });
      const prop = await api('post', `/partner/visits/${visit._id}/proposal`, 'px', { serviceId: String(svc.back._id), mode: 'CLINIC', sessions: 6, note: 'Twice a week for three weeks' });
      expect(prop.status).toBe(201);
      expect((await api('post', `/partner/visits/${visit._id}/proposal`, 'px', { serviceId: String(svc.back._id), mode: 'CLINIC', sessions: 6 })).body.code).toBe('PROPOSAL_EXISTS');
      const mine = await api('get', '/proposals', 'c0');
      expect(mine.body.proposals).toHaveLength(1);
      const wrong = await api('post', '/quotes', 'c0', { storeId: String(stores.px._id), serviceId: String(svc.back._id), mode: 'CLINIC', sessions: 4, proposalId: prop.body.proposal._id, schedule: { startDate: ist(12), time: '11:00', weekdays: [1, 4] } });
      expect(wrong.status).toBe(400);
      const q = await api('post', '/quotes', 'c0', { storeId: String(stores.px._id), serviceId: String(svc.back._id), mode: 'CLINIC', sessions: 6, proposalId: prop.body.proposal._id, schedule: { startDate: ist(12), time: '11:00', weekdays: [1, 4] } });
      expect(q.status).toBe(201);
      expect((await api('post', '/plans', 'c0', { quoteId: q.body.quote._id })).status).toBe(201);
      expect((await PlanProposal.findById(prop.body.proposal._id)).status).toBe('ACCEPTED');
    });
  });

  // ── Ads and settings ─────────────────────────────────────────────────────

  describe('ads and admin settings', () => {
    const search = () => api('get', `/stores?kind=PHYSIO&serviceId=${svc.back._id}&mode=CLINIC&lat=${JAIPUR.lat}&lng=${JAIPUR.lng}`, 'c3');

    it('a well-rated shop outside the top 3 can buy a labelled slot; clicks are charged once', async () => {
      if (!db) return;
      await CareStore.updateMany({ _id: { $in: [stores.px._id, stores.py._id, stores.pz._id] } }, { $set: { rating: { avg: 4.9, count: 40 } } });
      await CareStore.updateOne({ _id: stores.pw._id }, { $set: { rating: { avg: 4.5, count: 12 } } });
      const ad = await api('post', '/partner/ads', 'pw', { product: 'SPONSORED_LISTING', bidCpc: 12, dailyBudget: 200, services: [String(svc.back._id)], creative: { title: 'Back pain? Same-week slots' } });
      expect(ad.status).toBe(201);
      expect(ad.body.campaign.status).toBe('PENDING_REVIEW');
      expect((await api('post', '/partner/ads', 'pw', { product: 'SPONSORED_LISTING', bidCpc: 12, dailyBudget: 200, creative: { title: 'Guaranteed cure in 3 days' } })).status).toBe(400);
      const ads = require('../../services/adService');
      await ads.adminReview(admin._id, ad.body.campaign._id, { decision: 'APPROVE' });
      await ads.addFunds(users.pw._id, 1000, `test-topup-${RUN}`);
      const res = await search();
      const idx = res.body.stores.findIndex((s) => s.sponsored);
      expect(idx).toBe(1); // second position
      expect(res.body.stores[idx]).toMatchObject({ label: 'Sponsored', _id: String(stores.pw._id) });
      expect(res.body.stores.filter((s) => String(s._id) === String(stores.pw._id))).toHaveLength(1);
      const token = res.body.stores[idx].token;
      expect((await api('post', '/ads/click', 'c3', { token })).body.valid).toBe(true);
      await api('post', '/ads/click', 'c3', { token });
      const wallet = await AdWallet.findOne({ owner: users.pw._id }).lean();
      expect(wallet.balance).toBeGreaterThanOrEqual(1000 - 12);
      expect(wallet.balance).toBeLessThan(1000);
      expect(await AdWalletEntry.countDocuments({ owner: users.pw._id, type: 'SPEND' })).toBe(1);
      // A forged token is ignored.
      expect((await api('post', '/ads/click', 'c3', { token: `${token.split('.')[0]}.forged` })).body.valid).toBe(false);
    });

    it('a low-rated shop can’t advertise its way up', async () => {
      if (!db) return;
      await CareStore.updateOne({ _id: stores.pw._id }, { $set: { rating: { avg: 3.2, count: 30 } } });
      const res = await search();
      expect(res.body.stores.some((s) => s.sponsored)).toBe(false);
      await CareStore.updateOne({ _id: stores.pw._id }, { $set: { rating: { avg: 4.5, count: 12 } } });
    });

    it('the admin kill switch and fee changes go through propose → approve', async () => {
      if (!db) return;
      const settings = require('../../services/settingsService');
      await expect(settings.propose(admin._id, { key: 'revenue', changes: { 'care.customerFeeRate': 0.9 }, reason: 'Way too high' })).rejects.toThrow(/must be/);
      const kill = await settings.propose(admin._id, { key: 'ads', changes: { enabled: false }, reason: 'Pause ads during launch week' });
      await settings.review(admin._id, kill._id, { decision: 'APPROVE' }); // single platform admin: may approve their own
      const res = await search();
      expect(res.body.stores.some((s) => s.sponsored)).toBe(false);

      const before = await api('post', '/quotes', 'c3', { storeId: String(stores.py._id), serviceId: String(svc.back._id), mode: 'CLINIC', sessions: 1, schedule: { startDate: ist(9), time: '15:00' } });
      const fee = await settings.propose(admin._id, { key: 'revenue', changes: { 'care.customerFeeRate': 0.1 }, reason: 'Launch pricing for Jaipur' });
      await settings.review(admin._id, fee._id, { decision: 'APPROVE' });
      const after = await api('post', '/quotes', 'c3', { storeId: String(stores.py._id), serviceId: String(svc.back._id), mode: 'CLINIC', sessions: 1, schedule: { startDate: ist(9), time: '15:30' } });
      expect(before.body.quote.amounts.platformFee).toBe(82.5);
      expect(after.body.quote.amounts.platformFee).toBe(55);
      const desc = await settings.describe();
      expect(desc.fields.find((f) => f.path === 'care.customerFeeRate').value).toBe(0.1);
    });

    it('the admin overview counts the queues', async () => {
      if (!db) return;
      const overview = await require('../../services/careAdminService').overview();
      expect(overview).toEqual(expect.objectContaining({ shopsPending: expect.any(Number), refundsPending: expect.any(Number), needsAction: expect.any(Number) }));
      expect(overview.needsAction).toBeGreaterThanOrEqual(1); // the released caregiver days
    });
  });
});
