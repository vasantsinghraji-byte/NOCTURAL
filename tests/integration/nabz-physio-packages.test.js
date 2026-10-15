/**
 * Physio choice, packages kept with one professional, saved preferences and
 * the monthly commission tiers.
 */
const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../../models/user');
const Patient = require('../../models/patient');
const NurseBooking = require('../../models/nurseBooking');
const ServiceCatalog = require('../../models/serviceCatalog');

const PASSWORD = 'Strong@12345';
const RUN = Date.now();
const MOBILE = { 'X-Nocturnal-Mobile': 'expo' };
const VERIFIED = { idVerified: true, policeVerified: true, councilVerified: true };
const HOME = { lat: 26.9110, lng: 75.8010 };

describe('Physio choice, packages, preferences and tiers (real MongoDB)', () => {
  let app;
  let db = false;
  let physioA;
  let physioB;
  let patient;
  let token;
  let service;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const daysAhead = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const packageBody = (extra = {}) => ({
    serviceType: 'PHYSIO_PACKAGE_10',
    startDate: daysAhead(2),
    time: '18:00',
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    scheduledTimezoneOffsetMinutes: 330,
    serviceLocation: { type: 'HOME', address: { street: '12 Ashok Marg', city: 'Jaipur', pincode: '302001', coordinates: HOME } },
    patientDetails: { name: 'Kamla Devi', age: 68, gender: 'Female' },
    ...extra
  });

  beforeAll(async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000, autoIndex: false });
      db = true;
    } catch (error) {
      console.warn(`Skipping physio package tests: MongoDB unavailable (${error.message})`);
      return;
    }
    app = require('../../app');
    await ServiceCatalog.deleteMany({ name: 'PHYSIO_PACKAGE_10' });
    service = await ServiceCatalog.create({
      name: 'PHYSIO_PACKAGE_10', slug: `physio-pkg-${RUN}`, category: 'PACKAGE', displayName: 'Physio 10 sessions',
      pricing: { basePrice: 6999, currency: 'INR', packageDetails: { sessions: 10, duration: 21, pricePerSession: 699, totalPrice: 6999 } },
      availability: { isActive: true, availableCities: ['Jaipur'] }, requirements: { prescriptionRequired: false }
    });
    [physioA, physioB] = await User.create([
      {
        name: 'Priya Sharma', email: `pa.${RUN}@nabz.test`, password: PASSWORD, phone: '9876506001', role: 'physiotherapist', isVerified: true, rating: 4.8,
        careProfile: { gender: 'FEMALE', qualification: 'BPT', verification: VERIFIED }
      },
      {
        name: 'Neha Gupta', email: `pb.${RUN}@nabz.test`, password: PASSWORD, phone: '9876506002', role: 'physiotherapist', isVerified: true, rating: 4.5,
        careProfile: { gender: 'FEMALE', qualification: 'MPT', verification: VERIFIED }
      }
    ]);
    patient = await Patient.create({ name: 'Son In Delhi', email: `son.${RUN}@nabz.test`, password: PASSWORD, phone: `8${String(RUN).slice(-9)}` });
    token = (await request(app).post('/api/v1/patients/login').set(MOBILE).send({ email: patient.email, password: PASSWORD })).body.tokens.accessToken;
  });

  afterAll(async () => {
    if (!db) return;
    await NurseBooking.deleteMany({ patient: patient._id });
    await User.deleteMany({ _id: { $in: [physioA._id, physioB._id] } });
    await Patient.deleteOne({ _id: patient._id });
    await ServiceCatalog.deleteOne({ _id: service._id });
    await mongoose.disconnect();
  });

  it('lists verified physios with public details only', async () => {
    if (!db) return;
    const res = await request(app).get('/api/v1/care/providers').query({ serviceType: 'PHYSIO_PACKAGE_10' });
    expect(res.status).toBe(200);
    const priya = res.body.providers.find((p) => String(p._id) === String(physioA._id));
    expect(priya).toMatchObject({ name: 'Priya S.', gender: 'FEMALE', qualification: 'BPT', rating: 4.8 });
    expect(JSON.stringify(res.body)).not.toMatch(/9876506001|@nabz\.test/);
  });

  it('books a 10-session package with the chosen physio on every session, and lets the customer change physio', async () => {
    if (!db) return;
    const res = await request(app).post('/api/v1/bookings/package').set(auth())
      .send(packageBody({ requestedProvider: String(physioA._id), allowSubstitute: false }));
    expect(res.status).toBe(201);
    expect(res.body.sessions).toHaveLength(10);
    const sessions = await NurseBooking.find({ 'series.id': res.body.seriesId }).sort({ 'series.index': 1 }).lean();
    expect(sessions.map((s) => s.series.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    sessions.forEach((s) => {
      expect(String(s.dispatch.requestedProvider)).toBe(String(physioA._id));
      expect(s.dispatch.allowSubstitute).toBe(false);
      expect(s.pricing.basePrice).toBeCloseTo(699.9, 1); // package price split per session
    });

    // The chosen physio gets the offer even while offline (scheduled visit), with time to answer.
    const dispatch = require('../../services/dispatchService');
    await NurseBooking.updateOne({ _id: sessions[0]._id }, { $set: { 'dispatch.status': 'SEARCHING' } });
    const offered = await dispatch.offerNext(sessions[0]._id);
    expect(offered).toMatchObject({ status: 'OFFERED' });
    expect(String(offered.staffId)).toBe(String(physioA._id));
    const after = await NurseBooking.findById(sessions[0]._id).lean();
    expect(after.dispatch.offerExpiresAt.getTime() - Date.now()).toBeGreaterThan(10 * 60 * 1000);

    // Customer switches physio for the rest: sessions move, the old physio is excluded.
    const change = await request(app).put(`/api/v1/bookings/series/${res.body.seriesId}/provider`).set(auth()).send({ providerId: String(physioB._id) });
    expect(change.status).toBe(200);
    expect(change.body.moved).toBe(10);
    const moved = await NurseBooking.find({ 'series.id': res.body.seriesId }).lean();
    moved.forEach((s) => {
      expect(String(s.dispatch.requestedProvider)).toBe(String(physioB._id));
      expect(s.dispatch.declined.map(String)).toContain(String(physioA._id));
    });
  });

  it('keeps whoever takes the first session for the rest of the package', async () => {
    if (!db) return;
    // The first session must be within the normal 30-day booking horizon.
    const tooFar = await request(app).post('/api/v1/bookings/package').set(auth()).send(packageBody({ startDate: daysAhead(40), weekdays: [1, 3, 5] }));
    expect(tooFar.status).toBe(400);

    // A different time from the first package: the same person can't have two sessions at once.
    const ok = await request(app).post('/api/v1/bookings/package').set(auth()).send(packageBody({ weekdays: [1, 3, 5], time: '07:00' }));
    expect(ok.status).toBe(201);
    const first = await NurseBooking.findOne({ 'series.id': ok.body.seriesId, 'series.index': 1 }).lean();
    expect(first.dispatch.requestedProvider).toBeUndefined();
    const locked = await require('../../services/dispatchService').lockSeriesProvider(first, physioB._id);
    expect(locked).toBe(9);
    const rest = await NurseBooking.find({ 'series.id': ok.body.seriesId, 'series.index': { $gt: 1 } }).lean();
    rest.forEach((s) => expect(String(s.dispatch.requestedProvider)).toBe(String(physioB._id)));
  });

  it('saves and returns booking preferences', async () => {
    if (!db) return;
    const put = await request(app).put('/api/v1/patients/me/care-preferences').set(auth())
      .send({ preferredGender: 'FEMALE', preferredProvider: String(physioA._id), allowSubstitute: false, street: '12 Ashok Marg', city: 'Jaipur', pincode: '302001' });
    expect(put.status).toBe(200);
    const get = await request(app).get('/api/v1/patients/me/care-preferences').set(auth());
    expect(get.body.preferences).toMatchObject({ preferredGender: 'FEMALE', allowSubstitute: false, pincode: '302001' });
    expect(get.body.preferences.preferredProvider).toMatchObject({ name: 'Priya Sharma' });
  });

  it('charges 20% / 15% / 12% by jobs this month, and a referral credit only when lower', async () => {
    if (!db) return;
    const commission = require('../../services/commissionService');
    expect([1, 10, 11, 30, 31, 80].map((n) => commission.tierRate(n))).toEqual([0.2, 0.2, 0.15, 0.15, 0.12, 0.12]);

    // Physio B already did 10 visits this month: the 11th is at 15%.
    const now = new Date();
    await NurseBooking.collection.insertMany(Array.from({ length: 10 }, () => ({
      serviceProvider: physioB._id, patient: patient._id, status: 'COMPLETED', statusTimestamps: { completedAt: now }, pricing: { basePrice: 500 }
    })));
    const eleventh = await NurseBooking.collection.insertOne({ serviceProvider: physioB._id, patient: patient._id, status: 'COMPLETED', statusTimestamps: { completedAt: now }, pricing: { basePrice: 1000 } });
    expect(await commission.decideCareCommission(physioB._id, eleventh.insertedId)).toBe(0.15);
    expect(await commission.decideCareCommission(physioB._id, eleventh.insertedId)).toBe(0.15); // decided once

    // With a referral credit the next job is 5% and uses the credit.
    await User.updateOne({ _id: physioB._id }, { $set: { 'referral.credits': 1 } });
    const twelfth = await NurseBooking.collection.insertOne({ serviceProvider: physioB._id, patient: patient._id, status: 'COMPLETED', statusTimestamps: { completedAt: now }, pricing: { basePrice: 1000 } });
    expect(await commission.decideCareCommission(physioB._id, twelfth.insertedId)).toBe(0.05);
    expect((await User.findById(physioB._id).lean()).referral.credits).toBe(0);

    const status = await commission.tierStatus(physioB._id);
    expect(status).toMatchObject({ jobsThisMonth: 12, currentRatePercent: 15, nextRatePercent: 12, jobsToNextTier: 18 });
  });
});
