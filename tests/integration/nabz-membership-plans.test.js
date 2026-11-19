/**
 * Nabz Plus plans run from the admin panel: a team member with the "plans"
 * section (or the main admin) adds and changes plans; customers see and buy only
 * plans on sale; a paid period keeps the length it was sold at.
 * Real app + real MongoDB; skips when MONGODB_URI is unreachable.
 */

process.env.ENCRYPTION_KEY = 'a'.repeat(64);

const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../../models/user');
const Patient = require('../../models/patient');
const Membership = require('../../models/membership');
const MembershipPlan = require('../../models/membershipPlan');
const gateway = require('../../utils/razorpayGateway');
const { setRevenueOverrides } = require('../../config/revenue');

const RUN = `mp${Date.now().toString(36)}`;
const CODE = `T_${RUN}`.toUpperCase();
const MOBILE = { 'X-Nocturnal-Mobile': 'expo' };
const PASSWORD = 'Strong@12345';
const phone = (n) => `9${String(Date.now() + n).slice(-9)}`;

describe('Nabz Plus plans from the admin panel (real MongoDB)', () => {
  let app;
  let db = false;
  let seededHere = false;
  let patient;
  const tokens = {};
  const auth = (t) => ({ Authorization: `Bearer ${t}` });
  const staffLogin = async (email) => (await request(app).post('/api/v1/auth/login').set(MOBILE).send({ email, password: PASSWORD, portal: 'admin' })).body.tokens.accessToken;

  beforeAll(async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000, autoIndex: false });
      db = true;
    } catch (error) {
      console.warn(`Skipping membership plan tests: MongoDB unavailable (${error.message})`);
      return;
    }
    await Promise.all([User.createIndexes(), MembershipPlan.createIndexes(), Membership.createIndexes()]);
    seededHere = !(await MembershipPlan.exists({}));
    app = require('../../app');
    // No extra platform_admin here: other suites rely on a single main admin for self-approval.
    const [money, other] = await User.create([
      { name: 'Money Person', email: `money.${RUN}@nabz.test`, password: PASSWORD, phone: phone(2), role: 'ops_admin', isVerified: true, adminAccess: { sections: ['plans'], partnerKinds: [] } },
      { name: 'Rider Checker', email: `riders.${RUN}@nabz.test`, password: PASSWORD, phone: phone(3), role: 'ops_admin', isVerified: true, adminAccess: { sections: ['partners'], partnerKinds: ['DELIVERY'] } }
    ]);
    tokens.money = await staffLogin(money.email);
    tokens.other = await staffLogin(other.email);
    patient = await Patient.create({ name: 'Plus Buyer', email: `buyer.${RUN}@nabz.test`, password: PASSWORD, phone: phone(4) });
    tokens.patient = (await request(app).post('/api/v1/patients/login').set(MOBILE).send({ email: patient.email, password: PASSWORD })).body.tokens.accessToken;
  });

  afterAll(async () => {
    if (!db) return;
    setRevenueOverrides({});
    await Promise.all([
      User.deleteMany({ email: new RegExp(`${RUN}@nabz\\.test$`) }),
      Patient.deleteMany({ email: new RegExp(`${RUN}@nabz\\.test$`) }),
      Membership.deleteMany({ patient: patient && patient._id }),
      MembershipPlan.deleteMany({ code: new RegExp(`^T_${RUN.toUpperCase()}`) }),
      seededHere ? MembershipPlan.deleteMany({ code: 'PLUS_MONTHLY' }) : Promise.resolve()
    ]);
    jest.restoreAllMocks();
    await mongoose.disconnect();
  });

  it('only admins with the plans section can open or change plans', async () => {
    if (!db) return;
    expect((await request(app).get('/api/v1/membership/admin/plans').set(auth(tokens.other))).status).toBe(403);
    expect((await request(app).put(`/api/v1/membership/admin/plans/${CODE}`).set(auth(tokens.other)).send({ name: 'Nope', price: 9, days: 9 })).status).toBe(403);
    expect((await request(app).get('/api/v1/membership/admin/plans').set(auth(tokens.patient))).status).toBe(401);

    const list = await request(app).get('/api/v1/membership/admin/plans').set(auth(tokens.money));
    expect(list.status).toBe(200);
    // The launch plan is copied in so it can be edited.
    expect(list.body.plans.map((p) => p.code)).toContain('PLUS_MONTHLY');
  });

  it('a new plan goes on sale for customers; bad values are refused', async () => {
    if (!db) return;
    const bad = await request(app).put(`/api/v1/membership/admin/plans/${CODE}`).set(auth(tokens.money)).send({ name: 'Quarterly', price: 0, days: 90 });
    expect(bad.status).toBe(400);
    expect((await request(app).put('/api/v1/membership/admin/plans/bad code').set(auth(tokens.money)).send({ name: 'X', price: 10, days: 10 })).status).toBe(400);

    const made = await request(app).put(`/api/v1/membership/admin/plans/${CODE}`).set(auth(tokens.money))
      .send({ name: 'Plus Quarterly', price: 399, days: 90, note: 'Best value', sortOrder: 5 });
    expect(made.status).toBe(200);
    expect(made.body.plan).toMatchObject({ code: CODE, price: 399, days: 90, active: true, note: 'Best value' });

    const pub = await request(app).get('/api/v1/membership/plans');
    expect(pub.body.plans.find((p) => p.code === CODE)).toMatchObject({ name: 'Plus Quarterly', price: 399, days: 90 });
    expect(pub.body.benefits).toMatchObject({ freeDelivery: true, noVisitFee: true });
  });

  it('a paid period keeps the length it was sold at, even if the plan changes before payment lands', async () => {
    if (!db) return;
    const orders = [];
    jest.spyOn(gateway, 'getClient').mockReturnValue({
      orders: { create: jest.fn(async (o) => { orders.push(o); return { id: `order_${RUN}` }; }) },
      payments: {
        fetch: jest.fn(async (id) => ({ id, order_id: `order_${RUN}`, currency: 'INR', amount: orders[0].amount, status: 'captured' }))
      }
    });
    jest.spyOn(gateway, 'verifyPaymentSignature').mockReturnValue(true);

    const checkout = await request(app).post('/api/v1/membership/checkout').set(auth(tokens.patient)).send({ plan: CODE.toLowerCase() });
    expect(checkout.status).toBe(201);
    expect(orders[0].amount).toBe(39900);

    // The admin stretches the plan to 120 days after the customer opened checkout.
    expect((await request(app).put(`/api/v1/membership/admin/plans/${CODE}`).set(auth(tokens.money)).send({ days: 120 })).status).toBe(200);

    const verify = await request(app).post('/api/v1/membership/verify').set(auth(tokens.patient))
      .send({ razorpay_order_id: `order_${RUN}`, razorpay_payment_id: `pay_${RUN}`, razorpay_signature: 'sig' });
    expect(verify.status).toBe(200);
    const m = await Membership.findById(verify.body.membership._id);
    expect(m).toMatchObject({ status: 'ACTIVE', amount: 399, days: 90, plan: CODE });
    expect(Math.round((m.endsAt - m.startsAt) / 86400000)).toBe(90);

    const admin = await request(app).get('/api/v1/membership/admin/plans').set(auth(tokens.money));
    expect(admin.body.plans.find((p) => p.code === CODE).members).toBe(1);
  });

  it('a plan taken off sale disappears for customers and can no longer be bought', async () => {
    if (!db) return;
    expect((await request(app).put(`/api/v1/membership/admin/plans/${CODE}`).set(auth(tokens.money)).send({ active: false })).status).toBe(200);
    const pub = await request(app).get('/api/v1/membership/plans');
    expect(pub.body.plans.map((p) => p.code)).not.toContain(CODE);
    const buy = await request(app).post('/api/v1/membership/checkout').set(auth(tokens.patient)).send({ plan: CODE });
    expect(buy.status).toBe(400);
    expect(buy.body.message).toMatch(/not available/);
  });

  it('a trial length of 0 in settings switches the free trial off', async () => {
    if (!db) return;
    setRevenueOverrides({ 'membership.trialDays': 0 });
    try {
      const status = await request(app).get('/api/v1/membership').set(auth(tokens.patient));
      expect(status.body.trialAvailable).toBe(false);
      expect((await request(app).post('/api/v1/membership/trial').set(auth(tokens.patient))).status).toBe(409);
    } finally {
      setRevenueOverrides({});
    }
  });
});
