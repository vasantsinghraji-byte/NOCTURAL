/**
 * Tester feedback (Nov 2026): real app + real MongoDB.
 *   - Customers sign in with their mobile number + password (no SMS needed).
 *   - No choosing professionals by gender: an old app's preference is ignored.
 *   - Prescription "Upload later": book without it, the visit can't start
 *     until it's uploaded, then only the patient / their professional see it.
 *   - Same-day visits can be booked (30-minute lead time).
 * Skips when MONGODB_URI is unreachable.
 */

process.env.ENCRYPTION_KEY = 'a'.repeat(64);

const request = require('supertest');
const mongoose = require('mongoose');
const Patient = require('../../models/patient');
const User = require('../../models/user');
const NurseBooking = require('../../models/nurseBooking');
const ServiceCatalog = require('../../models/serviceCatalog');
const PharmacyVendor = require('../../models/pharmacyVendor');
const SettlementEntry = require('../../models/settlementEntry');

const RUN = `tf${Date.now().toString(36)}`;
const HOME = { lat: 26.9110, lng: 75.8010 }; // C-Scheme, Jaipur
const MOBILE = { 'X-Nocturnal-Mobile': 'expo' };
const PASSWORD = 'Strong@12345';
const PHONE = `8${String(Date.now()).slice(-9)}`;

describe('Nabz tester feedback fixes (real MongoDB)', () => {
  let app;
  let db = false;
  let patient;
  let other;
  let nurse;
  let service;
  const tokens = {};
  const auth = (t) => ({ Authorization: `Bearer ${t}` });
  // India date + time an hour from now (same-day booking).
  const inAnHour = () => {
    const ist = new Date(Date.now() + 330 * 60000 + 60 * 60000);
    return { date: ist.toISOString().slice(0, 10), time: ist.toISOString().slice(11, 16) };
  };
  const visit = (extra = {}) => {
    const { date, time } = inAnHour();
    return {
      serviceType: 'CATHETER_CARE', mode: 'SCHEDULED', scheduledDate: date, scheduledTime: time,
      scheduledTimezone: 'Asia/Kolkata', scheduledTimezoneOffsetMinutes: 330,
      serviceLocation: { type: 'HOME', address: { street: 'Ashok Marg', city: 'Jaipur', pincode: '302001', coordinates: HOME } },
      patientDetails: { name: `Kamla ${Math.random().toString(36).slice(2, 7)}`, age: 70, gender: 'Female' },
      ...extra
    };
  };

  beforeAll(async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000, autoIndex: false });
      db = true;
    } catch (error) {
      console.warn(`Skipping tester feedback flow: MongoDB unavailable (${error.message})`);
      return;
    }
    for (const Model of [User, Patient, NurseBooking, ServiceCatalog]) await Model.createIndexes();
    app = require('../../app');

    await ServiceCatalog.deleteMany({ name: 'CATHETER_CARE' });
    service = await ServiceCatalog.create({
      name: 'CATHETER_CARE', slug: `catheter-${RUN}`, category: 'NURSING', displayName: 'Catheter Care',
      pricing: { basePrice: 499, currency: 'INR' }, availability: { isActive: true, availableCities: ['Jaipur'] },
      requirements: { prescriptionRequired: true }
    });
    [patient, other] = await Patient.create([
      { name: 'Meera Sharma', email: `meera.${RUN}@nabz.test`, phone: PHONE, password: PASSWORD, isVerified: true },
      { name: 'Other Customer', email: `other.${RUN}@nabz.test`, phone: `7${PHONE.slice(1)}`, password: PASSWORD, isVerified: true }
    ]);
    nurse = await User.create({
      name: 'Asha Verma', email: `asha.${RUN}@nabz.test`, password: PASSWORD, phone: `6${PHONE.slice(1)}`, role: 'nurse', isVerified: true,
      careProfile: { qualification: 'B.Sc Nursing', gender: 'MALE', verification: { idVerified: true, policeVerified: true, councilVerified: true } }
    });
    tokens.nurse = (await request(app).post('/api/v1/auth/login').set(MOBILE).send({ email: nurse.email, password: PASSWORD, portal: 'staff' })).body.tokens.accessToken;
    tokens.other = (await request(app).post('/api/v1/patients/login').set(MOBILE).send({ email: other.email, password: PASSWORD })).body.tokens.accessToken;
  });

  afterAll(async () => {
    if (!db) return;
    await new Promise((r) => setTimeout(r, 300));
    await Promise.all([
      NurseBooking.deleteMany({ patient: { $in: [patient._id, other._id] } }),
      Patient.deleteMany({ _id: { $in: [patient._id, other._id] } }),
      User.deleteOne({ _id: nurse._id }),
      ServiceCatalog.deleteOne({ _id: service._id })
    ]);
    await mongoose.disconnect();
  });

  const skip = () => !db;

  it('signs a customer in with their mobile number and password', async () => {
    if (skip()) return;
    for (const typed of [PHONE, `+91 ${PHONE.slice(0, 5)} ${PHONE.slice(5)}`]) {
      const res = await request(app).post('/api/v1/patients/login').set(MOBILE).send({ email: typed, password: PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.tokens.accessToken).toEqual(expect.any(String));
      tokens.patient = res.body.tokens.accessToken;
    }
    // Wrong password and an unknown number get the same answer (no account enumeration).
    const wrong = await request(app).post('/api/v1/patients/login').send({ email: PHONE, password: 'Nope@12345' });
    const unknown = await request(app).post('/api/v1/patients/login').send({ email: '9000000001', password: 'Nope@12345' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(unknown.body.message).toBe(wrong.body.message);
    // Neither an email nor a mobile number: a clear field message.
    const junk = await request(app).post('/api/v1/patients/login').send({ email: '12345', password: PASSWORD });
    expect(junk.status).toBe(400);
    expect(JSON.stringify(junk.body)).toMatch(/valid email or 10-digit mobile number/);
  });

  it('refuses a booking that needs a prescription unless it is attached or "Upload later" is chosen', async () => {
    if (skip()) return;
    const none = await request(app).post('/api/v1/bookings').set(auth(tokens.patient)).send(visit());
    expect(none.status).toBe(400);
    expect(none.body.message).toMatch(/Upload later/);
    // Someone else's upload key is refused.
    const foreign = await request(app).post('/api/v1/bookings').set(auth(tokens.patient)).send(visit({ prescriptionKey: `prescriptions/${other._id}/rx.jpg` }));
    expect(foreign.status).toBe(400);
  });

  let bookingId;

  it('books same-day with "Upload later", ignoring an old app\'s gender preference', async () => {
    if (skip()) return;
    const res = await request(app).post('/api/v1/bookings').set(auth(tokens.patient)).send(visit({ prescriptionLater: true, preferredGender: 'FEMALE' }));
    expect(res.status).toBe(201);
    bookingId = res.body.booking._id;
    const saved = await NurseBooking.findById(bookingId).lean();
    expect(saved.prescription).toMatchObject({ status: 'PENDING' });
    expect(saved.dispatch.preferredGender).toBe('ANY');
    expect(saved.scheduledDate.toISOString().slice(0, 10)).toBe(inAnHour().date);
  });

  it('the visit can\'t start until the prescription is uploaded; then only the right people can see it', async () => {
    if (skip()) return;
    // Hand the visit to the nurse and get them to the door.
    await NurseBooking.updateOne({ _id: bookingId }, { $set: { serviceProvider: nurse._id, status: 'EN_ROUTE' } });
    const code = (await NurseBooking.findById(bookingId).select('+visitOtp.code').lean()).visitOtp.code;

    const blocked = await request(app).put(`/api/v1/bookings/${bookingId}/start`).set(auth(tokens.nurse)).send({ visitCode: code });
    expect(blocked.status).toBe(400);
    expect(blocked.body.message).toMatch(/prescription/i);
    expect((await request(app).get(`/api/v1/bookings/${bookingId}/prescription`).set(auth(tokens.nurse))).status).toBe(404);

    // Only the booking's own customer can attach it, and only their own upload.
    expect((await request(app).put(`/api/v1/bookings/${bookingId}/prescription`).set(auth(tokens.other)).send({ prescriptionKey: `prescriptions/${other._id}/rx.jpg` })).status).toBe(404);
    expect((await request(app).put(`/api/v1/bookings/${bookingId}/prescription`).set(auth(tokens.patient)).send({ prescriptionKey: `prescriptions/${other._id}/rx.jpg` })).status).toBe(400);
    expect((await request(app).put(`/api/v1/bookings/${bookingId}/prescription`).set(auth(tokens.nurse)).send({ prescriptionKey: `prescriptions/${patient._id}/rx.jpg` })).status).toBe(403);
    const attach = await request(app).put(`/api/v1/bookings/${bookingId}/prescription`).set(auth(tokens.patient)).send({ prescriptionKey: `prescriptions/${patient._id}/rx.jpg` });
    expect(attach.status).toBe(200);
    expect(attach.body.booking.prescription).toMatchObject({ status: 'ATTACHED' });

    // Another customer can't see it (403); the nurse can now get past the check (file isn't on disk in tests).
    expect((await request(app).get(`/api/v1/bookings/${bookingId}/prescription`).set(auth(tokens.other))).status).toBe(403);
    expect((await request(app).get(`/api/v1/bookings/${bookingId}/prescription`).set(auth(tokens.nurse))).status).not.toBe(403);

    const start = await request(app).put(`/api/v1/bookings/${bookingId}/start`).set(auth(tokens.nurse)).send({ visitCode: code });
    expect(start.status).toBe(200);
    expect(start.body.booking.status).toBe('IN_PROGRESS');
  });

  it('a store login linked to a deleted store is re-linked to the store it owns at sign-in', async () => {
    if (skip()) return;
    const owner = await User.create({
      name: 'Store Manager', email: `store.${RUN}@nabz.test`, password: PASSWORD, phone: `9${PHONE.slice(1)}`, role: 'pharmacy_vendor', isVerified: true,
      pharmacyVendor: new mongoose.Types.ObjectId() // the store it pointed at was deleted (e.g. re-seeded)
    });
    const store = await PharmacyVendor.create({
      name: `Store ${RUN}`, slug: `store-${RUN}`, location: { type: 'Point', coordinates: [HOME.lng, HOME.lat] },
      status: 'APPROVED', isActive: true, isOpen: true, owner: owner._id
    });
    try {
      const login = await request(app).post('/api/v1/auth/login').set(MOBILE).send({ email: owner.email, password: PASSWORD, portal: 'pharmacy' });
      expect(login.status).toBe(200);
      const profile = await request(app).get('/api/v1/pharmacy/vendor/profile').set(auth(login.body.tokens.accessToken));
      expect(profile.status).toBe(200);
      expect(String((await User.findById(owner._id).lean()).pharmacyVendor)).toBe(String(store._id));
    } finally {
      await Promise.all([User.deleteOne({ _id: owner._id }), PharmacyVendor.deleteOne({ _id: store._id })]);
    }
  });

  it('the nurse dashboard and Account show the same payout (earned minus cash collected)', async () => {
    if (skip()) return;
    const at = new Date();
    const source = { kind: 'CARE_BOOKING', id: new mongoose.Types.ObjectId(), ref: 'TEST' };
    await SettlementEntry.create([
      { source, party: { kind: 'PROVIDER', id: nurse._id }, type: 'PROVIDER_PAYOUT', amount: 500, occurredAt: at },
      { source, party: { kind: 'PROVIDER', id: nurse._id }, type: 'CASH_COLLECTED', amount: 500, occurredAt: at }
    ]);
    try {
      const dash = await request(app).get('/api/v1/care/staff/dashboard').set(auth(tokens.nurse));
      const acct = await request(app).get('/api/v1/partners/me/payouts').set(auth(tokens.nurse));
      expect(dash.status).toBe(200);
      expect(dash.body.dashboard.payout).toMatchObject({ available: 0, earned: 500, cashHeld: 500 });
      expect(dash.body.dashboard.payout.available).toBe(acct.body.payouts.available);
    } finally {
      await SettlementEntry.deleteMany({ 'source.id': source.id });
    }
  });

  it('saved preferences drop gender, and the public professional list hides it', async () => {
    if (skip()) return;
    await request(app).put('/api/v1/patients/me/care-preferences').set(auth(tokens.patient)).send({ preferredGender: 'MALE', pincode: '302001' });
    const prefs = await request(app).get('/api/v1/patients/me/care-preferences').set(auth(tokens.patient));
    expect(prefs.body.preferences.preferredGender).toBe('ANY');
    const list = await request(app).get('/api/v1/care/providers').query({ serviceType: 'CATHETER_CARE' });
    expect(list.status).toBe(200);
    list.body.providers.forEach((p) => expect(p).not.toHaveProperty('gender'));
  });
});
