/**
 * Partners sign in with the Nabz Partner app, not the customer app or the
 * customer website: real app + real MongoDB.
 *   - Customer sign-up with a partner's email or phone is refused.
 *   - A customer account on a partner's email can't sign in, but only after
 *     the password is right (a wrong password still says "invalid
 *     credentials", so nobody learns who is a partner).
 *   - Phone OTP sign-in for a partner's phone is refused after the code.
 *   - Ordinary customers are unaffected.
 * Skips when MONGODB_URI is unreachable.
 */

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'a'.repeat(64);

const request = require('supertest');
const mongoose = require('mongoose');
const Patient = require('../../models/patient');
const User = require('../../models/user');
const OtpChallenge = require('../../models/otpChallenge');
const socialAuthService = require('../../services/socialAuthService');
const { isPartnerIdentity, PARTNER_ACCOUNT_MESSAGE } = require('../../services/partnerAccountGuard');

const RUN = `pg${Date.now().toString(36)}`;
const MOBILE = { 'X-Nocturnal-Mobile': 'expo' };
const PASSWORD = 'Strong@12345';
const NURSE_EMAIL = `nurse.${RUN}@nabz.test`;
const NURSE_PHONE = `8${String(Date.now()).slice(-9)}`;

describe('Partner identities are refused by the customer app (real MongoDB)', () => {
  let app;
  let db = false;
  let lastCode = null;

  beforeAll(async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000, autoIndex: false });
      db = true;
    } catch (error) {
      console.warn(`Skipping partner identity block: MongoDB unavailable (${error.message})`);
      return;
    }
    for (const Model of [User, Patient, OtpChallenge]) await Model.createIndexes();
    app = require('../../app');
    socialAuthService.setSmsSender(async ({ code }) => { lastCode = code; });
    await User.create({ name: 'Asha Partner', email: NURSE_EMAIL, password: PASSWORD, phone: NURSE_PHONE, role: 'nurse', isVerified: true });
  }, 60000);

  afterAll(async () => {
    if (!db) return;
    await User.deleteMany({ email: NURSE_EMAIL });
    await Patient.deleteMany({ email: { $regex: RUN } });
    await Patient.deleteMany({ phone: NURSE_PHONE });
    await OtpChallenge.deleteMany({ phone: NURSE_PHONE });
    await mongoose.disconnect();
  });

  const skip = () => !db;

  it('recognises a partner by email (any case) or phone (with or without +91)', async () => {
    if (skip()) return;
    expect(await isPartnerIdentity({ email: NURSE_EMAIL.toUpperCase() })).toBe(true);
    expect(await isPartnerIdentity({ phone: `+91 ${NURSE_PHONE}` })).toBe(true);
    expect(await isPartnerIdentity({ email: `someone.${RUN}@nabz.test`, phone: '7000000000' })).toBe(false);
  });

  it('refuses customer sign-up with a partner email', async () => {
    if (skip()) return;
    const res = await request(app).post('/api/v1/patients/register').set(MOBILE)
      .send({ name: 'Asha Partner', email: NURSE_EMAIL, phone: '7111111111', password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(PARTNER_ACCOUNT_MESSAGE);
    expect(await Patient.exists({ email: NURSE_EMAIL })).toBeNull();
  });

  it('refuses customer sign-up with a partner phone', async () => {
    if (skip()) return;
    const res = await request(app).post('/api/v1/patients/register').set(MOBILE)
      .send({ name: 'Asha Partner', email: `other.${RUN}@nabz.test`, phone: NURSE_PHONE, password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(PARTNER_ACCOUNT_MESSAGE);
  });

  it('a customer account on a partner email: wrong password says invalid credentials, right password is sent to the Partner app', async () => {
    if (skip()) return;
    // Made before this rule existed (e.g. through Google sign-in).
    await Patient.create({ name: 'Asha Partner', email: NURSE_EMAIL, phone: '7222222222', password: PASSWORD });

    const wrong = await request(app).post('/api/v1/patients/login').set(MOBILE).send({ email: NURSE_EMAIL, password: 'Wrong@12345' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.message).not.toBe(PARTNER_ACCOUNT_MESSAGE);

    const right = await request(app).post('/api/v1/patients/login').set(MOBILE).send({ email: NURSE_EMAIL, password: PASSWORD });
    expect(right.status).toBe(403);
    expect(right.body.message).toBe(PARTNER_ACCOUNT_MESSAGE);
    expect(right.body.tokens).toBeUndefined();
  });

  it('phone sign-in for a partner phone is refused after the code is checked', async () => {
    if (skip()) return;
    const start = await request(app).post('/api/v1/auth/social/phone/start').set(MOBILE).send({ phone: NURSE_PHONE });
    expect([200, 201]).toContain(start.status);
    const verify = await request(app).post('/api/v1/auth/social/phone/verify').set(MOBILE).send({ phone: NURSE_PHONE, code: lastCode });
    expect(verify.status).toBe(403);
    expect(verify.body.message).toBe(PARTNER_ACCOUNT_MESSAGE);
  });

  it('ordinary customers still sign up and sign in', async () => {
    if (skip()) return;
    const email = `customer.${RUN}@nabz.test`;
    const reg = await request(app).post('/api/v1/patients/register').set(MOBILE)
      .send({ name: 'Kamla Devi', email, phone: '7333333333', password: PASSWORD });
    expect(reg.status).toBe(201);
    const login = await request(app).post('/api/v1/patients/login').set(MOBILE).send({ email, password: PASSWORD });
    expect(login.status).toBe(200);
  });
});
