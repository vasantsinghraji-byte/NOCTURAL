/**
 * Partner referral programme: codes, attaching a customer / partner, one
 * reward per referral, one credit per job, and the 5% commission split.
 */
const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../../models/user');
const Patient = require('../../models/patient');
const NurseBooking = require('../../models/nurseBooking');

const PASSWORD = 'Strong@12345';
const RUN = Date.now();
const MOBILE = { 'X-Nocturnal-Mobile': 'expo' };

describe('Partner referral programme (real MongoDB)', () => {
  let app;
  let db = false;
  let nurse;
  let newNurse;
  let patient;
  const referral = () => require('../../services/partnerReferralService');

  beforeAll(async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000, autoIndex: false });
      db = true;
    } catch (error) {
      console.warn(`Skipping referral tests: MongoDB unavailable (${error.message})`);
      return;
    }
    await User.createIndexes();
    app = require('../../app');
    [nurse, newNurse] = await User.create([
      { name: 'Referrer Nurse', email: `ref.${RUN}@nabz.test`, password: PASSWORD, phone: '9876505001', role: 'nurse', isVerified: true },
      { name: 'New Nurse', email: `new.${RUN}@nabz.test`, password: PASSWORD, phone: '9876505002', role: 'nurse', isVerified: true }
    ]);
    patient = await Patient.create({ name: 'Referred Customer', email: `cust.${RUN}@nabz.test`, password: PASSWORD, phone: `9${String(RUN).slice(-9)}` });
  });

  afterAll(async () => {
    if (!db) return;
    await User.deleteMany({ _id: { $in: [nurse._id, newNurse._id] } });
    await Patient.deleteOne({ _id: patient._id });
    await NurseBooking.deleteMany({ serviceProvider: nurse._id });
    await mongoose.disconnect();
  });

  it('gives every partner one stable code, shown on their account', async () => {
    if (!db) return;
    const code = await referral().ensureCode(nurse._id);
    expect(code).toMatch(/^NZ[A-Z0-9]{6}$/);
    expect(await referral().ensureCode(nurse._id)).toBe(code);
    const login = await request(app).post('/api/v1/auth/login').set(MOBILE).send({ email: nurse.email, password: PASSWORD, portal: 'staff' });
    const account = await request(app).get('/api/v1/partners/me/account').set({ Authorization: `Bearer ${login.body.tokens.accessToken}` });
    expect(account.status).toBe(200);
    expect(account.body.account).toMatchObject({ kind: 'STAFF', referral: { code, credits: 0, reducedCommissionPercent: 5 } });
    expect(account.body.account.earnings).toMatchObject({ today: 0, allTime: 0 });
  });

  it('a referred customer rewards the partner once, after a big-enough first order', async () => {
    if (!db) return;
    const code = await referral().ensureCode(nurse._id);
    await expect(referral().attachPatient(patient._id, 'NZNOTREAL')).rejects.toThrow(/isn’t valid/);
    await referral().attachPatient(patient._id, code.toLowerCase());
    await expect(referral().attachPatient(patient._id, code)).rejects.toThrow(/already used/);

    expect(await referral().onPatientCompletion(patient._id, 99)).toBe(false); // below the minimum
    // The referring nurse serving the visit herself earns nothing from it…
    expect(await referral().onPatientCompletion(patient._id, 450, { userId: nurse._id })).toBe(false);
    expect((await User.findById(nurse._id).lean()).referral.credits || 0).toBe(0);
    // …a visit served by someone else still counts.
    expect(await referral().onPatientCompletion(patient._id, 450, { userId: newNurse._id })).toBe(true);
    expect(await referral().onPatientCompletion(patient._id, 450)).toBe(false); // only once
    expect((await User.findById(nurse._id).lean()).referral).toMatchObject({ credits: 2, successful: 1 });
  });

  it('a referred partner rewards their referrer after their first job', async () => {
    if (!db) return;
    await referral().attachPartner(newNurse._id, await referral().ensureCode(nurse._id));
    expect(await referral().onPartnerCompletion(newNurse._id)).toBe(true);
    expect(await referral().onPartnerCompletion(newNurse._id)).toBe(false);
    expect((await User.findById(nurse._id).lean()).referral.credits).toBe(4);
  });

  it('each credit makes one job carry 5% commission, and a job uses at most one', async () => {
    if (!db) return;
    const pricing = require('../../services/pricingService');
    const booking = await NurseBooking.collection.insertOne({ serviceProvider: nurse._id, patient: patient._id, pricing: { basePrice: 1000 } });
    expect(await referral().claimReducedCommission(nurse._id, NurseBooking, booking.insertedId)).toBe(0.05);
    expect(await referral().claimReducedCommission(nurse._id, NurseBooking, booking.insertedId)).toBeNull();
    expect((await User.findById(nurse._id).lean()).referral.credits).toBe(3);
    const doc = await NurseBooking.findById(booking.insertedId).lean();
    expect(pricing.splitCareBooking(doc)).toMatchObject({ commissionRate: 0.05, commission: 50, providerPayout: 950 });
    // Without a credit the normal rate applies.
    expect(pricing.splitCareBooking({ pricing: { basePrice: 1000 } }).commissionRate).toBeGreaterThan(0.05);
  });
});
