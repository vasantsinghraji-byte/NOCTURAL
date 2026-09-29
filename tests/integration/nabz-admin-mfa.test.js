/**
 * Admin two-step login against the real app + real MongoDB.
 *   - password alone → challenge only (no cookie, no tokens)
 *   - enroll with an authenticator code → session + 10 one-time recovery codes
 *   - admin endpoints refuse admin tokens that skipped the second step
 *   - replayed code refused; 5 wrong codes lock the account
 *   - recovery code works exactly once
 *   - sensitive action needs a fresh code (step-up); admin session ends after the max age
 *   - non-admin staff logins are unchanged
 * Skips when MONGODB_URI is unreachable.
 */

process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.ADMIN_MFA_REQUIRED = 'true';

const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../../models/user');
const totp = require('../../utils/totp');
const { generateAccessToken } = require('../../utils/authTokens');

const RUN = `mfa${Date.now().toString(36)}`;
const PASSWORD = 'Admin-Strong-Pass-2026';
const MOBILE = { 'X-Nocturnal-Mobile': 'expo' };

describe('Admin two-step login (real MongoDB)', () => {
  let app;
  let db = false;
  let admin;
  let nurse;
  let secret;
  let recoveryCodes;
  let adminToken;

  const auth = (t) => ({ Authorization: `Bearer ${t}` });
  const password = () => request(app).post('/api/v1/auth/login').set(MOBILE).send({ email: admin.email, password: PASSWORD, portal: 'admin' });
  // A code is single-use per 30 s step. Tests run faster than the clock, so
  // simulate the next step having arrived instead of sleeping.
  const freshCode = async () => {
    await User.updateOne({ _id: admin._id }, { $set: { 'adminMfa.lastUsedStep': totp.currentStep() - 2 } });
    return totp.codeAt(secret, totp.currentStep());
  };

  beforeAll(async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000, autoIndex: false });
      db = true;
    } catch (error) {
      console.warn(`Skipping admin MFA flow: MongoDB unavailable (${error.message})`);
      return;
    }
    await User.createIndexes();
    app = require('../../app');
    [admin, nurse] = await User.create([
      { name: 'Ops Admin', email: `ops.${RUN}@nabz.test`, password: PASSWORD, phone: '9876505001', role: 'platform_admin', isVerified: true },
      { name: 'Nurse Joy', email: `joy.${RUN}@nabz.test`, password: PASSWORD, phone: '9876505002', role: 'nurse', isVerified: true }
    ]);
  });

  afterAll(async () => {
    if (!db) return;
    await User.deleteMany({ _id: { $in: [admin._id, nurse._id] } });
    await mongoose.disconnect();
  });

  const skip = () => !db;

  it('password alone returns a challenge, never a session', async () => {
    if (skip()) return;
    const res = await password();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ mfaRequired: true, enrolled: false });
    expect(res.body.mfaToken).toEqual(expect.any(String));
    expect(res.body.tokens).toBeUndefined();
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('enrolls with an authenticator code and receives recovery codes once', async () => {
    if (skip()) return;
    const { mfaToken } = (await password()).body;
    const start = await request(app).post('/api/v1/auth/admin-mfa/enroll/start').set(MOBILE).send({ mfaToken });
    expect(start.status).toBe(200);
    expect(start.body.otpauthUri).toContain('otpauth://totp/');
    secret = start.body.secret;
    // Reloading the setup page keeps the same key (the admin may already have scanned it).
    const reload = await request(app).post('/api/v1/auth/admin-mfa/enroll/start').set(MOBILE).send({ mfaToken });
    expect(reload.body.secret).toBe(secret);

    const stored = await User.findById(admin._id).select('+adminMfa.pendingSecret').lean();
    expect(stored.adminMfa.pendingSecret).not.toContain(secret); // encrypted at rest

    const wrong = await request(app).post('/api/v1/auth/admin-mfa/enroll/verify').set(MOBILE).send({ mfaToken, code: '000000' });
    expect(wrong.status).toBe(401);

    const ok = await request(app).post('/api/v1/auth/admin-mfa/enroll/verify').set(MOBILE)
      .send({ mfaToken, code: totp.codeAt(secret, totp.currentStep()) });
    expect(ok.status).toBe(200);
    expect(ok.body.recoveryCodes).toHaveLength(10);
    recoveryCodes = ok.body.recoveryCodes;
    adminToken = ok.body.tokens.accessToken;

    const status = await request(app).get('/api/v1/auth/admin-mfa/status').set(auth(adminToken));
    expect(status.body).toMatchObject({ enrolled: true, recoveryCodesLeft: 10 });
  });

  it('admin endpoints refuse an admin token that skipped the second step', async () => {
    if (skip()) return;
    const noMfa = generateAccessToken(admin._id, 'user', 0);
    const res = await request(app).get('/api/v1/partners/admin/applications').set(auth(noMfa));
    expect(res.status).toBe(401);
    expect(res.body.details).toEqual({ mfaRequired: true });
    expect((await request(app).get('/api/v1/partners/admin/applications').set(auth(adminToken))).status).toBe(200);
  });

  it('signs in with a code; the same code cannot be replayed', async () => {
    if (skip()) return;
    const { mfaToken, enrolled } = (await password()).body;
    expect(enrolled).toBe(true);
    const code = await freshCode();
    const ok = await request(app).post('/api/v1/auth/admin-mfa/verify').set(MOBILE).send({ mfaToken, code });
    expect(ok.status).toBe(200);
    expect(ok.body.tokens.accessToken).toEqual(expect.any(String));

    const again = (await password()).body.mfaToken;
    expect((await request(app).post('/api/v1/auth/admin-mfa/verify').set(MOBILE).send({ mfaToken: again, code })).status).toBe(401);
  });

  it('a recovery code works exactly once', async () => {
    if (skip()) return;
    const use = async () => request(app).post('/api/v1/auth/admin-mfa/verify').set(MOBILE)
      .send({ mfaToken: (await password()).body.mfaToken, recoveryCode: recoveryCodes[0].toLowerCase() });
    const first = await use();
    expect(first.status).toBe(200);
    expect(first.body.recoveryCodesLeft).toBe(9);
    expect((await use()).status).toBe(401);
  });

  it('sensitive actions need a fresh code (step-up)', async () => {
    if (skip()) return;
    const oldAuth = Math.floor(Date.now() / 1000) - 20 * 60;
    const stale = generateAccessToken(admin._id, 'user', 0, { mfa: true, authTime: oldAuth });
    const fake = new mongoose.Types.ObjectId();
    const blocked = await request(app).patch(`/api/v1/partners/admin/applications/${fake}`).set(auth(stale)).send({ status: 'APPROVED' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.details).toEqual({ stepUpRequired: true });

    const up = await request(app).post('/api/v1/auth/admin-mfa/step-up').set(MOBILE).set(auth(stale)).send({ code: await freshCode() });
    expect(up.status).toBe(200);
    const fresh = up.body.tokens.accessToken;
    // Passes the step-up gate (404: no such application).
    expect((await request(app).patch(`/api/v1/partners/admin/applications/${fake}`).set(auth(fresh)).send({ status: 'APPROVED' })).status).toBe(404);
  });

  it('admin sessions end after the max age', async () => {
    if (skip()) return;
    const old = generateAccessToken(admin._id, 'user', 0, { mfa: true, authTime: Math.floor(Date.now() / 1000) - 9 * 3600 });
    const res = await request(app).get('/api/v1/partners/admin/applications').set(auth(old));
    expect(res.status).toBe(401);
  });

  it('five wrong codes lock the account for 15 minutes', async () => {
    if (skip()) return;
    for (let i = 0; i < 5; i += 1) {
      const { mfaToken } = (await password()).body;
      await request(app).post('/api/v1/auth/admin-mfa/verify').set(MOBILE).send({ mfaToken, code: '000000' });
    }
    const { mfaToken } = (await password()).body;
    const locked = await request(app).post('/api/v1/auth/admin-mfa/verify').set(MOBILE).send({ mfaToken, code: await freshCode() });
    expect(locked.status).toBe(401);
    expect(locked.body.message).toMatch(/Too many wrong codes/);
  });

  it('shared patient/provider routes also enforce MFA and revoked sessions', async () => {
    if (skip()) return;
    // /webauthn uses protectBoth (patients + providers).
    const noMfa = generateAccessToken(admin._id, 'user', 0);
    expect((await request(app).get('/api/v1/webauthn/credentials').set(auth(noMfa))).status).toBe(401);

    const nurseToken = generateAccessToken(nurse._id, 'user', 0);
    expect((await request(app).get('/api/v1/webauthn/credentials').set(auth(nurseToken))).status).toBe(200);
    // Logout-all bumps sessionVersion: the old token must stop working here too.
    await User.updateOne({ _id: nurse._id }, { $inc: { sessionVersion: 1 } });
    expect((await request(app).get('/api/v1/webauthn/credentials').set(auth(nurseToken))).status).toBe(401);
    await User.updateOne({ _id: nurse._id }, { $set: { sessionVersion: 0 } });
  });

  it('non-admin staff sign in with a password as before', async () => {
    if (skip()) return;
    const res = await request(app).post('/api/v1/auth/login').set(MOBILE).send({ email: nurse.email, password: PASSWORD, portal: 'staff' });
    expect(res.status).toBe(200);
    expect(res.body.mfaRequired).toBeUndefined();
    expect(res.body.tokens.accessToken).toEqual(expect.any(String));
  });
});
