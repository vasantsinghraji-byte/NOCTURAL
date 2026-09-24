/**
 * Forgot / reset password against the real app + real MongoDB.
 *   - unknown and known emails get the same answer; only the known one gets mail
 *   - the emailed link resets the password once, signs out old sessions
 *   - reused / wrong / weak inputs are refused; staff accounts work the same way
 * Skips when MONGODB_URI is unreachable.
 */

process.env.ENCRYPTION_KEY = 'a'.repeat(64);

const request = require('supertest');
const mongoose = require('mongoose');
const Patient = require('../../models/patient');
const User = require('../../models/user');
const PasswordResetToken = require('../../models/passwordResetToken');
const mailer = require('../../services/mailer');

const RUN = `pr${Date.now().toString(36)}`;
const OLD = 'Old-Pass-2026!';
const NEW = 'New-Pass-2026#';
const MOBILE = { 'X-Nocturnal-Mobile': 'expo' };

describe('Forgot / reset password (real MongoDB)', () => {
  let app;
  let db = false;
  let patient;
  let nurse;
  const outbox = [];
  const tokenFrom = (mail) => decodeURIComponent(/token=([A-Za-z0-9_%-]+)/.exec(mail.text)[1]);

  beforeAll(async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000, autoIndex: false });
      db = true;
    } catch (error) {
      console.warn(`Skipping password reset flow: MongoDB unavailable (${error.message})`);
      return;
    }
    await PasswordResetToken.createIndexes();
    app = require('../../app');
    mailer.setTestSender(async (mail) => { outbox.push(mail); });
    patient = await Patient.create({ name: 'Riya Jain', email: `riya.${RUN}@nabz.test`, password: OLD, phone: '9876506001' });
    nurse = await User.create({ name: 'Kiran Nurse', email: `kiran.${RUN}@nabz.test`, password: OLD, phone: '9876506002', role: 'nurse', isVerified: true });
  });

  afterAll(async () => {
    if (!db) return;
    mailer.setTestSender(null);
    await Promise.all([
      Patient.deleteOne({ _id: patient._id }),
      User.deleteOne({ _id: nurse._id }),
      PasswordResetToken.deleteMany({ account: { $in: [patient._id, nurse._id] } })
    ]);
    await mongoose.disconnect();
  });

  const skip = () => !db;
  const forgot = (email) => request(app).post('/api/v1/auth/password/forgot').send({ email });

  it('answers the same for unknown and known emails; mails only the known one', async () => {
    if (skip()) return;
    const unknown = await forgot(`nobody.${RUN}@nabz.test`);
    const known = await forgot(patient.email);
    expect(unknown.status).toBe(200);
    expect(known.status).toBe(200);
    expect(unknown.body.message).toBe(known.body.message);
    expect(outbox).toHaveLength(1);
    expect(outbox[0].to).toBe(patient.email);
    expect(outbox[0].text).toMatch(/\/reset-password\?token=/);
    const stored = await PasswordResetToken.findOne({ account: patient._id }).lean();
    expect(stored.tokenHash).not.toContain(tokenFrom(outbox[0])); // only the hash is stored
  });

  it('resets once, signs out old sessions, and the new password works', async () => {
    if (skip()) return;
    const oldLogin = await request(app).post('/api/v1/patients/login').set(MOBILE).send({ email: patient.email, password: OLD });
    const oldToken = oldLogin.body.tokens.accessToken;
    expect((await request(app).get('/api/v1/patients/me').set('Authorization', `Bearer ${oldToken}`)).status).toBe(200);

    const token = tokenFrom(outbox[0]);
    expect((await request(app).post('/api/v1/auth/password/check').send({ token })).body.valid).toBe(true);
    expect((await request(app).post('/api/v1/auth/password/reset').send({ token, password: 'weak', confirmPassword: 'weak' })).status).toBe(400);
    expect((await request(app).post('/api/v1/auth/password/reset').send({ token, password: NEW, confirmPassword: 'Other-2026#x' })).status).toBe(400);

    const ok = await request(app).post('/api/v1/auth/password/reset').send({ token, password: NEW, confirmPassword: NEW });
    expect(ok.status).toBe(200);
    expect(ok.body.accountType).toBe('patient');

    expect((await request(app).post('/api/v1/auth/password/reset').send({ token, password: NEW, confirmPassword: NEW })).status).toBe(400);
    expect((await request(app).get('/api/v1/patients/me').set('Authorization', `Bearer ${oldToken}`)).status).toBe(401);
    expect((await request(app).post('/api/v1/patients/login').set(MOBILE).send({ email: patient.email, password: OLD })).status).toBe(401);
    expect((await request(app).post('/api/v1/patients/login').set(MOBILE).send({ email: patient.email, password: NEW })).status).toBe(200);
  });

  it('works for staff accounts too', async () => {
    if (skip()) return;
    outbox.length = 0;
    await forgot(nurse.email);
    const ok = await request(app).post('/api/v1/auth/password/reset').send({ token: tokenFrom(outbox[0]), password: NEW, confirmPassword: NEW });
    expect(ok.body).toMatchObject({ accountType: 'user', role: 'nurse' });
    const login = await request(app).post('/api/v1/auth/login').set(MOBILE).send({ email: nurse.email, password: NEW, portal: 'staff' });
    expect(login.status).toBe(200);
  });

  it('refuses unknown tokens and limits links per hour', async () => {
    if (skip()) return;
    expect((await request(app).post('/api/v1/auth/password/check').send({ token: 'x'.repeat(43) })).body.valid).toBe(false);
    outbox.length = 0;
    for (let i = 0; i < 5; i += 1) await forgot(patient.email);
    expect(outbox.length).toBeLessThanOrEqual(3);
  });
});
