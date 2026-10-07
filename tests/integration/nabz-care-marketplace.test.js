/**
 * Care marketplace end to end (real MongoDB replica set): shops and rate cards,
 * search and compare, quotes with travel fees, plans of N sessions, slot races,
 * price changes, reschedule / release / leave / suspension, prepaid refunds.
 * See docs/product/PROVIDER_MARKETPLACE_PLAN.md.
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
const SettlementEntry = require('../../models/settlementEntry');

const PASSWORD = 'Strong@12345';
const RUN = Date.now();
const MOBILE = { 'X-Nocturnal-Mobile': 'expo' };
const VERIFIED = { idVerified: true, policeVerified: true, councilVerified: true };
// Jaipur: the clinic, a home 4.8 km away, and a home 40 km away.
const CLINIC = { lat: 26.9124, lng: 75.7873 };
const NEAR = { lat: 26.9124, lng: 75.8355 };
const FAR = { lat: 27.27, lng: 75.7873 };
const ALL_WEEK = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((day) => ({ day, open: '07:00', close: '21:00' }));
const ist = (days) => new Date(Date.now() + 330 * 60000 + days * 86400000).toISOString().slice(0, 10);

describe('Care marketplace (real MongoDB)', () => {
  let app;
  let db = false;
  let service;
  let physioA;
  let physioB;
  let physioC;
  const patients = [];
  const tokens = {};
  let storeA;
  let storeB;

  const login = async (path, email, extra = {}) => {
    const res = await request(app).post(`/api/v1${path}`).set(MOBILE).send({ email, password: PASSWORD, ...extra });
    return res.body.tokens && res.body.tokens.accessToken;
  };
  const as = (who) => ({ Authorization: `Bearer ${tokens[who]}` });
  const api = (method, path, who, body) => {
    const r = request(app)[method](`/api/v1/marketplace${path}`).set(MOBILE);
    if (who) r.set(as(who));
    return body !== undefined ? r.send(body) : r;
  };
  const homeAddress = (point = NEAR) => ({ street: '12 Ashok Marg', city: 'Jaipur', pincode: '302001', coordinates: point });
  const quoteBody = (extra = {}) => ({
    storeId: String(storeA._id),
    serviceId: String(service._id),
    mode: 'HOME',
    sessions: 1,
    paymentMode: 'PER_SESSION',
    schedule: { startDate: ist(2), time: '10:00' },
    address: homeAddress(),
    patientDetails: { name: 'Kamla Devi', age: 68, gender: 'Female', relation: 'Mother' },
    ...extra
  });
  const quoteAndBook = async (who, extra) => {
    const q = await api('post', '/quotes', who, quoteBody(extra));
    expect(q.status).toBe(201);
    const b = await api('post', '/plans', who, { quoteId: q.body.quote._id });
    return { quote: q, booked: b };
  };

  beforeAll(async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000, autoIndex: false });
      db = true;
    } catch (error) {
      console.warn(`Skipping marketplace tests: MongoDB unavailable (${error.message})`);
      return;
    }
    app = require('../../app');
    for (const M of [CareStore, RateCardItem, CarePlan, CareQuote, SlotReservation, NurseBooking]) await M.createIndexes();

    service = await ServiceCatalog.create({
      name: `KNEE_MKT_${RUN}`, slug: `knee-mkt-${RUN}`, category: 'PHYSIOTHERAPY', displayName: 'Knee pain therapy',
      pricing: { basePrice: 600 }, availability: { isActive: true },
      marketplace: { kind: 'PHYSIO', priceFloor: 300, priceCeiling: 2500, homeAllowed: true, clinicAllowed: true, defaultDurationMinutes: 45, bookingServiceType: 'KNEE_PAIN_THERAPY' }
    });
    const pro = (n, phone, extra = {}) => ({
      name: `Physio ${n}`, email: `mk${n}.${RUN}@nabz.test`, password: PASSWORD, phone, role: 'physiotherapist', isVerified: true,
      careProfile: { gender: 'FEMALE', qualification: 'BPT', verification: VERIFIED }, ...extra
    });
    [physioA, physioB, physioC] = await User.create([
      pro('a', '9876511001'),
      pro('b', '9876511002'),
      pro('c', '9876511003', { careProfile: { gender: 'MALE', verification: { idVerified: true } } })
    ]);
    for (let i = 0; i < 4; i += 1) {
      patients.push(await Patient.create({ name: `Buyer ${i}`, email: `buyer${i}.${RUN}@nabz.test`, password: PASSWORD, phone: `7${String(RUN + i).slice(-9)}` }));
    }
    for (const [key, who] of [['a', physioA], ['b', physioB], ['c', physioC]]) tokens[key] = await login('/auth/login', who.email, { portal: 'staff' });
    for (const [i, p] of patients.entries()) tokens[`p${i}`] = await login('/patients/login', p.email);
  }, 60000);

  afterAll(async () => {
    if (!db) return;
    const storeIds = (await CareStore.find({ owner: { $in: [physioA._id, physioB._id, physioC._id] } }).select('_id').lean()).map((s) => s._id);
    await Promise.all([
      NurseBooking.deleteMany({ patient: { $in: patients.map((p) => p._id) } }),
      CarePlan.deleteMany({ store: { $in: storeIds } }),
      CareQuote.deleteMany({ store: { $in: storeIds } }),
      SlotReservation.deleteMany({ store: { $in: storeIds } }),
      RateCardItem.deleteMany({ store: { $in: storeIds } }),
      CareStore.deleteMany({ _id: { $in: storeIds } }),
      SettlementEntry.deleteMany({ 'party.id': { $in: [physioA._id, physioB._id] } }),
      ServiceCatalog.deleteOne({ _id: service._id }),
      User.deleteMany({ _id: { $in: [physioA._id, physioB._id, physioC._id] } }),
      Patient.deleteMany({ _id: { $in: patients.map((p) => p._id) } })
    ]);
    await mongoose.disconnect();
  });

  describe('shop setup and rate card', () => {
    it('a verified physio opens a shop and goes live; an unverified one waits for review', async () => {
      if (!db) return;
      const res = await api('put', '/partner/store', 'a', {
        name: 'Dr A Physio', format: 'SOLO', registration: { number: `RPC-${RUN}`, body: 'Rajasthan Physiotherapy Council' },
        location: CLINIC, address: { line1: 'C-Scheme', city: 'Jaipur', pincode: '302001' }, languages: ['Hindi', 'English'], gender: 'FEMALE',
        clinic: { enabled: true, hours: ALL_WEEK },
        home: { enabled: true, radiusKm: 8, ratePerKm: 12, bufferMinutes: 30, hours: ALL_WEEK },
        // Mass assignment: none of these may stick.
        status: 'APPROVED', rating: { avg: 5, count: 999 }, isPaused: false, strikes: []
      });
      expect(res.status).toBe(200);
      expect(res.body.store).toMatchObject({ status: 'APPROVED', rating: { avg: 0, count: 0 } });
      storeA = res.body.store;

      const c = await api('put', '/partner/store', 'c', {
        name: 'Dr C', format: 'SOLO', location: CLINIC, clinic: { enabled: true, hours: ALL_WEEK }, status: 'APPROVED'
      });
      expect(c.body.store.status).toBe('PENDING');
    });

    it('keeps travel rates, radius and registration numbers inside the rules', async () => {
      if (!db) return;
      const base = { name: 'Dr B Clinic', format: 'CLINIC', location: { lat: 26.85, lng: 75.80 }, clinic: { enabled: true, capacity: 2, hours: ALL_WEEK } };
      expect((await api('put', '/partner/store', 'b', { ...base, home: { enabled: true, radiusKm: 5, ratePerKm: 20, hours: ALL_WEEK } })).status).toBe(400);
      expect((await api('put', '/partner/store', 'b', { ...base, home: { enabled: true, radiusKm: 60, ratePerKm: 12, hours: ALL_WEEK } })).status).toBe(400);
      const dup = await api('put', '/partner/store', 'b', { ...base, registration: { number: `rpc-${RUN}` } });
      expect(dup.status).toBe(409);
      const ok = await api('put', '/partner/store', 'b', { ...base, home: { enabled: false } });
      expect(ok.status).toBe(200);
      storeB = ok.body.store;
    });

    it('rate card prices stay inside the catalog band; home price defaults to the clinic price', async () => {
      if (!db) return;
      const path = `/partner/store/rate-card/${service._id}`;
      expect((await api('put', path, 'a', { clinic: { enabled: true, price: 150 } })).status).toBe(400);
      expect((await api('put', path, 'a', { clinic: { enabled: true, price: 9000 } })).status).toBe(400);
      expect((await api('put', path, 'a', { clinic: { enabled: true, price: 600 }, sessionDiscounts: [{ minSessions: 5, percent: 50 }] })).status).toBe(400);
      const res = await api('put', path, 'a', {
        clinic: { enabled: true, price: 500 }, home: { enabled: true }, durationMinutes: 45,
        sessionDiscounts: [{ minSessions: 10, percent: 10 }, { minSessions: 5, percent: 5 }]
      });
      expect(res.status).toBe(200);
      expect(res.body.item).toMatchObject({ clinic: { price: 500 }, home: { price: 500 }, version: 1 });
      expect(res.body.item.sessionDiscounts.map((t) => t.minSessions)).toEqual([5, 10]);
      // Same prices again: version unchanged. New home price: version + 1.
      expect((await api('put', path, 'a', { clinic: { enabled: true, price: 500 }, home: { enabled: true }, sessionDiscounts: [{ minSessions: 5, percent: 5 }, { minSessions: 10, percent: 10 }] })).body.item.version).toBe(1);
      expect((await api('put', path, 'a', { clinic: { enabled: true, price: 500 }, home: { enabled: true, price: 600 }, sessionDiscounts: [{ minSessions: 5, percent: 5 }, { minSessions: 10, percent: 10 }] })).body.item.version).toBe(2);
      expect((await api('put', `/partner/store/rate-card/${service._id}`, 'b', { clinic: { enabled: true, price: 400 } })).status).toBe(200);
      expect((await api('put', `/partner/store/rate-card/${service._id}`, 'c', { clinic: { enabled: true, price: 350 } })).status).toBe(200);
    });

    it('a customer can’t use partner endpoints', async () => {
      if (!db) return;
      expect([401, 403]).toContain((await api('get', '/partner/store', 'p0')).status);
    });
  });

  describe('browse and compare', () => {
    it('lists the service with "from ₹" across live shops only', async () => {
      if (!db) return;
      const res = await api('get', '/services?kind=PHYSIO');
      const row = res.body.services.find((s) => String(s._id) === String(service._id));
      expect(row).toMatchObject({ providers: 2, fromPrice: 400 }); // A and B; C is still under review
    });

    it('home search shows only shops whose area covers the address, with the travel fee', async () => {
      if (!db) return;
      const near = await api('get', `/stores?serviceId=${service._id}&mode=HOME&lat=${NEAR.lat}&lng=${NEAR.lng}`);
      expect(near.status).toBe(200);
      expect(near.body.stores.map((s) => String(s._id))).toEqual([String(storeA._id)]);
      expect(near.body.stores[0]).toMatchObject({ price: 600, homeCovered: true, travel: { ratePerKm: 12 } });
      expect(near.body.stores[0].travel.fee).toBeGreaterThanOrEqual(30);
      const far = await api('get', `/stores?serviceId=${service._id}&mode=HOME&lat=${FAR.lat}&lng=${FAR.lng}`);
      expect(far.body.stores).toHaveLength(0);
    });

    it('clinic search sorts by price and never shows contact details', async () => {
      if (!db) return;
      const res = await api('get', `/stores?serviceId=${service._id}&mode=CLINIC&lat=${CLINIC.lat}&lng=${CLINIC.lng}&sort=price`);
      expect(res.body.stores.map((s) => s.price)).toEqual([400, 500]);
      const text = JSON.stringify(res.body);
      expect(text).not.toMatch(/9876511|@nabz\.test|registration"|strikes|owner/);
    });

    it('a shop page shows its menu and the travel fee to the customer', async () => {
      if (!db) return;
      const res = await api('get', `/stores/${storeA._id}?lat=${NEAR.lat}&lng=${NEAR.lng}`);
      expect(res.status).toBe(200);
      expect(res.body.store.rateCard[0]).toMatchObject({ clinic: { price: 500 }, home: { price: 600 }, durationMinutes: 45 });
      expect(res.body.store.homeCovered).toBe(true);
      expect((await api('get', `/stores/${(await CareStore.findOne({ owner: physioC._id }))._id}`)).status).toBe(404);
    });

    it('free times skip the shop’s booked slots', async () => {
      if (!db) return;
      const res = await api('get', `/stores/${storeA._id}/slots?serviceId=${service._id}&mode=CLINIC&from=${ist(2)}&days=1`);
      expect(res.body.days[0].times).toContain('10:00');
    });
  });

  describe('quotes and plans', () => {
    it('quotes 10 prepaid home sessions with the discount and travel per session', async () => {
      if (!db) return;
      const res = await api('post', '/quotes', 'p0', quoteBody({ sessions: 10, paymentMode: 'PREPAID', schedule: { startDate: ist(2), time: '08:00', weekdays: [0, 1, 2, 3, 4, 5, 6] } }));
      expect(res.status).toBe(201);
      const q = res.body.quote;
      expect(q.amounts).toMatchObject({ listPricePerSession: 600, discountPercent: 10, servicePerSession: 540, serviceSubtotal: 6000, discount: 600 });
      expect(q.travel.perSession).toBeGreaterThan(0);
      expect(q.amounts.travelTotal).toBeCloseTo(q.travel.perSession * 10, 2);
      expect(q.schedule.dates).toHaveLength(10);
      expect(q.lines.map((l) => l.code)).toEqual(['SERVICE', 'DISCOUNT', 'TRAVEL', 'PLATFORM_FEE', 'GST']);
    });

    it('refuses addresses outside the home area, modes not offered, too many sessions and closed times', async () => {
      if (!db) return;
      const far = await api('post', '/quotes', 'p0', quoteBody({ address: homeAddress(FAR) }));
      expect(far.status).toBe(400);
      expect(far.body.code).toBe('OUT_OF_RANGE');
      const homeAtB = await api('post', '/quotes', 'p0', quoteBody({ storeId: String(storeB._id) }));
      expect(homeAtB.body.code).toBe('MODE_UNAVAILABLE');
      expect((await api('post', '/quotes', 'p0', quoteBody({ sessions: 31 }))).status).toBe(400);
      const night = await api('post', '/quotes', 'p0', quoteBody({ schedule: { startDate: ist(2), time: '22:00' } }));
      expect(night.body.code).toBe('SCHEDULE_UNAVAILABLE');
    });

    it('books a plan: sessions confirmed with the chosen physio at the quoted price; a double tap books once', async () => {
      if (!db) return;
      const q = await api('post', '/quotes', 'p0', quoteBody({ sessions: 3, schedule: { startDate: ist(3), time: '11:00', weekdays: [0, 1, 2, 3, 4, 5, 6] } }));
      const [first, second] = await Promise.all([
        api('post', '/plans', 'p0', { quoteId: q.body.quote._id }),
        api('post', '/plans', 'p0', { quoteId: q.body.quote._id })
      ]);
      const ok = [first, second].filter((r) => r.status === 201);
      expect(ok.length).toBeGreaterThanOrEqual(1);
      [first, second].filter((r) => r.status !== 201).forEach((r) => expect(r.body.code).toBe('QUOTE_IN_USE'));
      const plan = ok[0].body.plan;
      expect(await CarePlan.countDocuments({ quote: q.body.quote._id })).toBe(1);
      expect(plan).toMatchObject({ status: 'ACTIVE', sessionsTotal: 3, paymentMode: 'PER_SESSION' });
      expect(plan.sessions).toHaveLength(3);
      const sessions = await NurseBooking.find({ 'marketplace.plan': plan._id }).lean();
      sessions.forEach((s) => {
        expect(s).toMatchObject({ status: 'CONFIRMED', serviceType: 'KNEE_PAIN_THERAPY', serviceProvider: physioA._id });
        expect(s.pricing.totalAmount).toBe(q.body.quote.amounts.perSessionPayable);
        expect(s.pricing.travelFee).toBe(q.body.quote.travel.perSession);
        expect(s.marketplace.slotKeys.length).toBe(5); // 45 min + 30 min buffer
        expect(s.patientDetails.name).toBe('Kamla Devi');
      });
      // Booking the same quote again later returns the same plan.
      const again = await api('post', '/plans', 'p0', { quoteId: q.body.quote._id });
      expect(String(again.body.plan._id)).toBe(String(plan._id));
    });

    it('a booked time is gone for everyone else (solo physio: home and clinic share one calendar)', async () => {
      if (!db) return;
      const clash = await api('post', '/quotes', 'p1', quoteBody({ mode: 'CLINIC', address: undefined, schedule: { startDate: ist(3), time: '11:30' } }));
      expect(clash.status).toBe(409);
      expect(clash.body.code).toBe('SLOT_TAKEN');
      const slots = await api('get', `/stores/${storeA._id}/slots?serviceId=${service._id}&mode=CLINIC&from=${ist(3)}&days=1`);
      expect(slots.body.days[0].times).not.toContain('11:00');
      expect(slots.body.days[0].times).toContain('13:00');
    });

    it('two customers racing for the last slot: exactly one gets it', async () => {
      if (!db) return;
      const body = quoteBody({ mode: 'CLINIC', address: undefined, schedule: { startDate: ist(4), time: '15:00' } });
      const [q1, q2] = await Promise.all([api('post', '/quotes', 'p1', body), api('post', '/quotes', 'p2', body)]);
      expect(q1.status).toBe(201);
      expect(q2.status).toBe(201);
      const results = await Promise.all([
        api('post', '/plans', 'p1', { quoteId: q1.body.quote._id }),
        api('post', '/plans', 'p2', { quoteId: q2.body.quote._id })
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(results.find((r) => r.status === 409).body.code).toBe('SLOT_TAKEN');
      const date = ist(4);
      const row = await SlotReservation.findOne({ key: `${storeA._id}|PRACTITIONER|${date}|15:00` }).lean();
      expect(row.count).toBe(1);
    });

    it('a clinic with 2 beds takes exactly 2 patients at the same time', async () => {
      if (!db) return;
      const body = { storeId: String(storeB._id), serviceId: String(service._id), mode: 'CLINIC', sessions: 1, schedule: { startDate: ist(5), time: '09:00' } };
      const quotes = await Promise.all(['p0', 'p1', 'p2'].map((p) => api('post', '/quotes', p, { ...body, patientDetails: { name: `Patient ${p}` } })));
      quotes.forEach((q) => expect(q.status).toBe(201));
      const booked = await Promise.all(quotes.map((q, i) => api('post', '/plans', `p${i}`, { quoteId: q.body.quote._id })));
      expect(booked.filter((r) => r.status === 201)).toHaveLength(2);
    });

    it('a price change after the quote asks the customer to confirm the new price', async () => {
      if (!db) return;
      const q = await api('post', '/quotes', 'p3', quoteBody({ mode: 'CLINIC', address: undefined, schedule: { startDate: ist(6), time: '16:00' } }));
      expect((await api('put', `/partner/store/rate-card/${service._id}`, 'a', {
        clinic: { enabled: true, price: 550 }, home: { enabled: true, price: 600 }, sessionDiscounts: [{ minSessions: 5, percent: 5 }, { minSessions: 10, percent: 10 }]
      })).status).toBe(200);
      const res = await api('post', '/plans', 'p3', { quoteId: q.body.quote._id });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PRICE_CHANGED');
      expect(res.body.details.quote.amounts.listPricePerSession).toBe(550);
      const ok = await api('post', '/plans', 'p3', { quoteId: res.body.details.quote._id });
      expect(ok.status).toBe(201);
      expect(ok.body.plan.price.listPricePerSession).toBe(550);
    });

    it('another customer can’t see or change someone else’s plan', async () => {
      if (!db) return;
      const plan = await CarePlan.findOne({ patient: patients[3]._id });
      expect((await api('get', `/plans/${plan._id}`, 'p0')).status).toBe(404);
      expect((await api('post', `/plans/${plan._id}/cancel`, 'p0', {})).status).toBe(404);
      const session = await NurseBooking.findOne({ 'marketplace.plan': plan._id });
      expect((await api('put', `/sessions/${session._id}/schedule`, 'p0', { date: ist(7), time: '12:00' })).status).toBe(404);
    });
  });

  describe('during a plan', () => {
    let plan;
    let sessions;

    beforeAll(async () => {
      if (!db) return;
      const { booked } = await quoteAndBook('p1', { sessions: 4, schedule: { startDate: ist(8), time: '12:00', weekdays: [0, 1, 2, 3, 4, 5, 6] } });
      expect(booked.status).toBe(201);
      plan = booked.body.plan;
      sessions = await NurseBooking.find({ 'marketplace.plan': plan._id }).sort({ 'series.index': 1 });
    });

    it('moving a session frees the old time and holds the new one', async () => {
      if (!db) return;
      const res = await api('put', `/sessions/${sessions[0]._id}/schedule`, 'p1', { date: ist(8), time: '17:00' });
      expect(res.status).toBe(200);
      expect(res.body.session).toMatchObject({ scheduledTime: '17:00', status: 'CONFIRMED' });
      const old = await SlotReservation.findOne({ key: `${storeA._id}|PRACTITIONER|${ist(8)}|12:00` }).lean();
      expect(old.count).toBe(0);
      const newer = await SlotReservation.findOne({ key: `${storeA._id}|PRACTITIONER|${ist(8)}|17:00` }).lean();
      expect(newer.count).toBe(1);
    });

    it('when the physio can’t make it, the session waits for the customer (not dispatch)', async () => {
      if (!db) return;
      const res = await request(app).put(`/api/v1/bookings/${sessions[1]._id}/cancel`).set(MOBILE).set(as('a')).send({ reason: 'Family emergency today' });
      expect(res.status).toBeLessThan(300);
      const s = await NurseBooking.findById(sessions[1]._id).lean();
      expect(s).toMatchObject({ status: 'REQUESTED', dispatch: { status: 'NO_STAFF' } });
      expect(s.serviceProvider).toBeUndefined();
      expect(s.marketplace.slotKeys).toEqual([]);
      const view = await api('get', `/plans/${plan._id}`, 'p1');
      expect(view.body.plan.sessions[1].needsAction).toBe(true);
      // The customer picks a new time: back with the same physio.
      const moved = await api('put', `/sessions/${sessions[1]._id}/schedule`, 'p1', { date: ist(9), time: '18:00' });
      expect(moved.status).toBe(200);
      expect(String((await NurseBooking.findById(sessions[1]._id)).serviceProvider)).toBe(String(physioA._id));
    });

    it('a new address re-prices travel; out of range is refused', async () => {
      if (!db) return;
      const far = await api('put', `/sessions/${sessions[2]._id}/address`, 'p1', { address: homeAddress(FAR) });
      expect(far.body.code).toBe('OUT_OF_RANGE');
      const closer = await api('put', `/sessions/${sessions[2]._id}/address`, 'p1', { address: homeAddress({ lat: 26.9124, lng: 75.7973 }) });
      expect(closer.status).toBe(200);
      const s = await NurseBooking.findById(sessions[2]._id).lean();
      expect(s.pricing.travelFee).toBe(closer.body.travelFee);
      expect(s.pricing.travelFee).toBeLessThan(sessions[2].pricing.travelFee);
      expect(s.pricing.payableAmount).toBeLessThan(sessions[2].pricing.payableAmount);
    });

    it('leave on a booked day releases that session to the customer', async () => {
      if (!db) return;
      const day = sessions[3].scheduledDate.toISOString().slice(0, 10);
      const res = await api('post', '/partner/store/leave', 'a', { from: day, to: day, reason: 'Conference' });
      expect(res.status).toBe(201);
      expect(res.body.released).toBeGreaterThanOrEqual(1);
      expect((await NurseBooking.findById(sessions[3]._id)).status).toBe('REQUESTED');
      const q = await api('post', '/quotes', 'p2', quoteBody({ mode: 'CLINIC', address: undefined, schedule: { startDate: day, time: '13:00' } }));
      expect(q.body.code).toBe('SCHEDULE_UNAVAILABLE');
      await api('delete', `/partner/store/leave/${res.body.leave[res.body.leave.length - 1]._id}`, 'a');
    });

    it('completing a session pays the physio the travel fee in full', async () => {
      if (!db) return;
      await NurseBooking.updateOne({ _id: sessions[2]._id }, { $set: { status: 'IN_PROGRESS' } });
      const bookingService = require('../../services/bookingService');
      await bookingService.completeService(sessions[2]._id, physioA._id, { cashCollected: sessions[2].pricing.payableAmount });
      const s = await NurseBooking.findById(sessions[2]._id).lean();
      const payout = await SettlementEntry.findOne({ 'source.id': s._id, type: 'PROVIDER_PAYOUT' }).lean();
      const commission = await SettlementEntry.findOne({ 'source.id': s._id, type: 'COMMISSION' }).lean();
      expect(payout.amount).toBeCloseTo(s.pricing.basePrice - commission.amount + s.pricing.travelFee, 2);
      expect((await CarePlan.findById(plan._id)).sessionsCompleted).toBe(1);
    });

    it('cancelling the plan cancels what’s left and closes it', async () => {
      if (!db) return;
      const res = await api('post', `/plans/${plan._id}/cancel`, 'p1', { reason: 'Feeling better' });
      expect(res.status).toBe(200);
      expect(res.body.plan.status).toBe('COMPLETED'); // one session was done
      const left = await NurseBooking.countDocuments({ 'marketplace.plan': plan._id, status: { $nin: ['COMPLETED', 'CANCELLED'] } });
      expect(left).toBe(0);
      const held = await SlotReservation.countDocuments({ holders: { $in: sessions.map((x) => String(x._id)) } });
      expect(held).toBe(0);
    });
  });

  describe('prepaid plans', () => {
    const carePlanService = () => require('../../services/carePlanService');

    it('unpaid plans free their slots when the hold runs out', async () => {
      if (!db) return;
      const { booked } = await quoteAndBook('p2', { mode: 'CLINIC', address: undefined, sessions: 2, paymentMode: 'PREPAID', schedule: { startDate: ist(10), time: '09:00', weekdays: [0, 1, 2, 3, 4, 5, 6] } });
      expect(booked.status).toBe(201);
      expect(booked.body.plan).toMatchObject({ status: 'PENDING_PAYMENT', payment: { status: 'PENDING' } });
      // Without Razorpay keys the app is told to pay per session instead.
      const order = await api('post', `/plans/${booked.body.plan._id}/payment/order`, 'p2');
      if (!process.env.RAZORPAY_KEY_ID) expect(order.status).toBe(400);
      await CarePlan.updateOne({ _id: booked.body.plan._id }, { $set: { 'payment.holdUntil': new Date(Date.now() - 1000) } });
      expect((await carePlanService().expireUnpaidPlans()) >= 1).toBe(true);
      expect((await CarePlan.findById(booked.body.plan._id)).status).toBe('CANCELLED');
      const free = await api('post', '/quotes', 'p3', quoteBody({ mode: 'CLINIC', address: undefined, schedule: { startDate: ist(10), time: '09:00' } }));
      expect(free.status).toBe(201);
      // A payment arriving after that is refunded in full.
      await expect(carePlanService().markPlanPaid(booked.body.plan._id, { orderId: 'order_x', paymentId: 'pay_x' })).rejects.toMatchObject({ code: 'PAID_TOO_LATE' });
      expect((await CarePlan.findById(booked.body.plan._id)).refund).toMatchObject({ status: 'PENDING', amount: booked.body.plan.payment.amount });
    });

    it('paid plan: unused sessions are refunded at the list price', async () => {
      if (!db) return;
      const { booked } = await quoteAndBook('p3', { mode: 'CLINIC', address: undefined, sessions: 5, paymentMode: 'PREPAID', schedule: { startDate: ist(11), time: '19:00', weekdays: [0, 1, 2, 3, 4, 5, 6] } });
      expect(booked.status).toBe(201);
      const plan = booked.body.plan;
      expect(plan.price.discountPercent).toBe(5);
      await carePlanService().markPlanPaid(plan._id, { orderId: 'order_ok', paymentId: 'pay_ok' });
      const sessions = await NurseBooking.find({ 'marketplace.plan': plan._id }).sort({ 'series.index': 1 });
      sessions.forEach((s) => expect(s.payment.status).toBe('PAID'));
      // Two sessions done, then the customer stops.
      const bookingService = require('../../services/bookingService');
      for (const s of sessions.slice(0, 2)) {
        await NurseBooking.updateOne({ _id: s._id }, { $set: { status: 'IN_PROGRESS' } });
        await bookingService.completeService(s._id, physioA._id, {});
      }
      const res = await api('post', `/plans/${plan._id}/cancel`, 'p3', {});
      expect(res.status).toBe(200);
      const closed = await CarePlan.findById(plan._id).lean();
      const listSession = require('../../services/pricingService').quoteCarePlan({ listPrice: 550, sessions: 1, mode: 'CLINIC', paymentMode: 'PER_SESSION' }).perSessionPayable;
      expect(closed.status).toBe('COMPLETED');
      expect(closed.refund.status).toBe('PENDING');
      expect(closed.refund.amount).toBeCloseTo(closed.payment.amount - 2 * listSession, 2);
    });
  });

  describe('admin', () => {
    it('suspending a shop releases its sessions and hides it from search', async () => {
      if (!db) return;
      const { booked } = await quoteAndBook('p0', { mode: 'CLINIC', address: undefined, sessions: 1, schedule: { startDate: ist(12), time: '10:00' } });
      expect(booked.status).toBe(201);
      const careStoreService = require('../../services/careStoreService');
      const out = await careStoreService.adminSetStatus(new mongoose.Types.ObjectId(), storeA._id, 'SUSPENDED', 'Test suspension');
      expect(out.released).toBeGreaterThanOrEqual(1);
      const s = await NurseBooking.findOne({ 'marketplace.plan': booked.body.plan._id }).lean();
      expect(s.dispatch.status).toBe('NO_STAFF');
      const search = await api('get', `/stores?serviceId=${service._id}&mode=CLINIC&lat=${CLINIC.lat}&lng=${CLINIC.lng}`);
      expect(search.body.stores.map((x) => String(x._id))).not.toContain(String(storeA._id));
      // Moving it is refused (the shop is gone); cancelling is free.
      expect((await api('put', `/sessions/${s._id}/schedule`, 'p0', { date: ist(13), time: '10:00' })).body.code).toBe('STORE_UNAVAILABLE');
      const cancel = await request(app).put(`/api/v1/bookings/${s._id}/cancel`).set(MOBILE).set(as('p0')).send({ reason: 'Provider suspended' });
      expect(cancel.status).toBeLessThan(300);
      await careStoreService.adminSetStatus(new mongoose.Types.ObjectId(), storeA._id, 'APPROVED');
    });

    it('admin endpoints need an admin', async () => {
      if (!db) return;
      expect((await api('get', '/admin/stores', 'a')).status).toBe(403);
      expect([401, 403]).toContain((await api('put', `/admin/stores/${storeA._id}/status`, 'p0', { status: 'APPROVED' })).status);
    });
  });
});
