/**
 * Admin team access: the main admin gives a team member chosen admin sections
 * and partner types; the server enforces it on every admin endpoint.
 * Real app + real MongoDB; skips when MONGODB_URI is unreachable.
 */

process.env.ENCRYPTION_KEY = 'a'.repeat(64);

const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../../models/user');
const PartnerApplication = require('../../models/partnerApplication');

const RUN = `at${Date.now().toString(36)}`;
const MOBILE = { 'X-Nocturnal-Mobile': 'expo' };
const PASSWORD = 'Strong@12345';
const phone = (n) => `9${String(Date.now() + n).slice(-9)}`;

describe('Admin team: sections and partner types (real MongoDB)', () => {
  let app;
  let db = false;
  let owner;
  let memberId;
  const apps = {};
  const tokens = {};
  const auth = (t) => ({ Authorization: `Bearer ${t}` });
  const login = async (email) => (await request(app).post('/api/v1/auth/login').set(MOBILE).send({ email, password: PASSWORD, portal: 'admin' })).body;

  beforeAll(async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000, autoIndex: false });
      db = true;
    } catch (error) {
      console.warn(`Skipping admin team tests: MongoDB unavailable (${error.message})`);
      return;
    }
    await User.createIndexes();
    app = require('../../app');
    owner = await User.create({ name: 'Main Admin', email: `owner.${RUN}@nabz.test`, password: PASSWORD, phone: phone(1), role: 'platform_admin', isVerified: true });
    tokens.owner = (await login(owner.email)).tokens.accessToken;
    [apps.rider, apps.nurse] = await PartnerApplication.create([
      { kind: 'DELIVERY', name: `Ravi Rider ${RUN}`, phone: phone(2) },
      { kind: 'MEDICAL_STAFF', name: `Asha Nurse ${RUN}`, phone: phone(3), gender: 'FEMALE' }
    ]);
  });

  afterAll(async () => {
    if (!db) return;
    await Promise.all([
      User.deleteMany({ email: new RegExp(`${RUN}@nabz\\.test$`) }),
      PartnerApplication.deleteMany({ name: new RegExp(RUN) })
    ]);
    await mongoose.disconnect();
  });

  const skip = () => !db;

  it('the main admin adds a member who can only verify delivery partners', async () => {
    if (skip()) return;
    const bad = await request(app).post('/api/v1/onboarding/team').set(auth(tokens.owner))
      .send({ name: 'No Kinds', email: `nokinds.${RUN}@nabz.test`, access: { sections: ['partners'], partnerKinds: [] } });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toMatch(/partner types/);

    const res = await request(app).post('/api/v1/onboarding/team').set(auth(tokens.owner))
      .send({ name: 'Rider Checker', email: `riders.${RUN}@nabz.test`, access: { sections: ['partners', 'documents', 'nonsense'], partnerKinds: ['DELIVERY'] } });
    expect(res.status).toBe(201);
    expect(res.body.reviewer).toMatchObject({ role: 'ops_admin', access: { full: false, sections: ['partners', 'documents'], partnerKinds: ['DELIVERY'] } });
    memberId = res.body.reviewer._id;

    // They set their own password through the invite (simulated here) and sign in at the admin portal.
    const member = await User.findById(memberId);
    member.password = PASSWORD;
    await member.save();
    const signIn = await login(member.email);
    expect(signIn.success).toBe(true);
    tokens.member = signIn.tokens.accessToken;
    const me = await request(app).get('/api/v1/auth/me').set(auth(tokens.member));
    expect(me.body.data?.user?.adminAccess || me.body.user?.adminAccess).toMatchObject({ sections: ['partners', 'documents'], partnerKinds: ['DELIVERY'] });
  });

  it('they see and decide only delivery-partner applications', async () => {
    if (skip()) return;
    const list = await request(app).get('/api/v1/partners/admin/applications').set(auth(tokens.member));
    expect(list.status).toBe(200);
    const names = list.body.applications.map((a) => a.name);
    expect(names).toContain(`Ravi Rider ${RUN}`);
    expect(names).not.toContain(`Asha Nurse ${RUN}`);
    // Asking for nurses directly returns nothing.
    expect((await request(app).get('/api/v1/onboarding/applications').query({ kind: 'MEDICAL_STAFF' }).set(auth(tokens.member))).body.applications).toEqual([]);
    const counts = await request(app).get('/api/v1/onboarding/applications/counts').set(auth(tokens.member));
    expect(Object.keys(counts.body.counts)).toEqual(['DELIVERY']);

    const nurse = await request(app).patch(`/api/v1/partners/admin/applications/${apps.nurse._id}`).set(auth(tokens.member)).send({ status: 'REJECTED', note: 'test' });
    expect(nurse.status).toBe(403);
    const rider = await request(app).patch(`/api/v1/partners/admin/applications/${apps.rider._id}`).set(auth(tokens.member)).send({ status: 'REJECTED', note: 'Incomplete documents' });
    expect(rider.status).toBe(200);
  });

  it('everything outside their sections is refused, including nurse staff checks', async () => {
    if (skip()) return;
    for (const path of ['/api/v1/admin/revenue/summary', '/api/v1/admin/ops/users', '/api/v1/admin/ops/verification', '/api/v1/partners/admin/withdrawals', '/api/v1/marketplace/admin/overview', '/api/v1/pharmacy/admin/vendors', '/api/v1/onboarding/team']) {
      const res = await request(app).get(path).set(auth(tokens.member));
      expect([path, res.status]).toEqual([path, 403]);
    }
  });

  it('the main admin changes their access; it applies on the next request', async () => {
    if (skip()) return;
    const change = await request(app).put(`/api/v1/onboarding/team/${memberId}/access`).set(auth(tokens.owner)).send({ access: { sections: ['payments'] } });
    expect(change.status).toBe(200);
    expect(change.body.reviewer.access.sections).toEqual(['payments']);
    expect((await request(app).get('/api/v1/admin/revenue/summary').set(auth(tokens.member))).status).toBe(200);
    expect((await request(app).get('/api/v1/partners/admin/applications').set(auth(tokens.member))).status).toBe(403);
    // A team member can't manage the team or give themselves more access.
    expect((await request(app).put(`/api/v1/onboarding/team/${memberId}/access`).set(auth(tokens.member)).send({ access: { sections: ['users'] } })).status).toBe(403);
  });

  it('a suspended member is signed out at once', async () => {
    if (skip()) return;
    expect((await request(app).patch(`/api/v1/onboarding/team/${memberId}`).set(auth(tokens.owner)).send({ active: false })).status).toBe(200);
    expect((await request(app).get('/api/v1/admin/revenue/summary').set(auth(tokens.member))).status).toBe(401);
  });

  it('nobody can sign up as an admin team member', async () => {
    if (skip()) return;
    const res = await request(app).post('/api/v1/auth/register').send({ name: 'Sneaky', email: `sneaky.${RUN}@nabz.test`, password: PASSWORD, phone: phone(9), role: 'ops_admin' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await User.exists({ email: `sneaky.${RUN}@nabz.test`, role: 'ops_admin' })).toBeNull();
  });
});
