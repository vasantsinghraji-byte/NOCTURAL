/**
 * "Call me back" (real MongoDB): a customer asks Nabz to phone them; ops works
 * the queue with masked numbers and an audited reveal.
 */
const request = require('supertest');
const mongoose = require('mongoose');
const Patient = require('../../models/patient');
const User = require('../../models/user');
const CallbackRequest = require('../../models/callbackRequest');

const PASSWORD = 'Strong@12345';
const RUN = Date.now();
const MOBILE = { 'X-Nocturnal-Mobile': 'expo' };

describe('Support: call me back (real MongoDB)', () => {
  let app;
  let db = false;
  const tokens = {};
  const patients = [];
  let admin;
  let staff;

  const login = async (path, email, extra = {}) => (await request(app).post(`/api/v1${path}`).set(MOBILE).send({ email, password: PASSWORD, ...extra })).body.tokens?.accessToken;
  const api = (method, path, who, body) => {
    const r = request(app)[method](`/api/v1/support${path}`).set(MOBILE);
    if (who) r.set({ Authorization: `Bearer ${tokens[who]}` });
    return body !== undefined ? r.send(body) : r;
  };

  beforeAll(async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000, autoIndex: false });
      db = true;
    } catch (error) {
      console.warn(`Skipping support tests: MongoDB unavailable (${error.message})`);
      return;
    }
    app = require('../../app');
    await CallbackRequest.createIndexes();
    for (let i = 0; i < 2; i += 1) patients.push(await Patient.create({ name: i === 0 ? 'Kamla Devi' : 'Shanti Devi', email: `cb${i}.${RUN}@nabz.test`, password: PASSWORD, phone: `7${String(RUN + i).slice(-9)}` }));
    [admin, staff] = await User.create([
      { name: `Admin ${RUN}`, email: `cbadmin.${RUN}@nabz.test`, password: PASSWORD, phone: '9876530001', role: 'platform_admin', isVerified: true },
      { name: `Nurse ${RUN}`, email: `cbnurse.${RUN}@nabz.test`, password: PASSWORD, phone: '9876530002', role: 'nurse', isVerified: true }
    ]);
    tokens.c0 = await login('/patients/login', patients[0].email);
    tokens.c1 = await login('/patients/login', patients[1].email);
    tokens.staff = await login('/auth/login', staff.email, { portal: 'staff' });
  }, 60000);

  afterAll(async () => {
    if (!db) return;
    await Promise.all([
      CallbackRequest.deleteMany({ patient: { $in: patients.map((p) => p._id) } }),
      Patient.deleteMany({ _id: { $in: patients.map((p) => p._id) } }),
      User.deleteMany({ _id: { $in: [admin, staff].filter(Boolean).map((u) => u._id) } })
    ]);
    await mongoose.disconnect();
  });

  it('a customer asks for a call once; tapping again returns the same open request', async () => {
    if (!db) return;
    const first = await api('post', '/callback', 'c0', { topic: 'BOOKING', note: 'Need physio for my knee', language: 'hi' });
    expect(first.status).toBe(201);
    expect(first.body.request).toMatchObject({ topic: 'BOOKING', status: 'OPEN' });
    expect(first.body.request.phone).toBeUndefined(); // never echoed back
    const again = await api('post', '/callback', 'c0', { topic: 'OTHER' });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ existing: true, request: { _id: first.body.request._id } });
    expect((await api('get', '/callback', 'c0')).body.request._id).toBe(first.body.request._id);
  });

  it('two taps at the same moment still make one request', async () => {
    if (!db) return;
    const [a, b] = await Promise.all([api('post', '/callback', 'c1', {}), api('post', '/callback', 'c1', {})]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(await CallbackRequest.countDocuments({ patient: patients[1]._id, status: 'OPEN' })).toBe(1);
  });

  it('only customers can ask, and only admins see the queue', async () => {
    if (!db) return;
    expect((await api('post', '/callback', null, {})).status).toBe(401);
    expect([401, 403]).toContain((await api('post', '/callback', 'staff', {})).status); // a partner token isn't a customer
    expect([401, 403]).toContain((await api('get', '/admin/callbacks', 'c0')).status); // customer token on an admin route
    expect([401, 403]).toContain((await api('post', `/admin/callbacks/${new mongoose.Types.ObjectId()}/reveal`, 'staff')).status);
  });

  it('the admin queue masks names and numbers; a reveal is recorded; closing takes it off the queue', async () => {
    if (!db) return;
    const support = require('../../services/supportService');
    const open = await CallbackRequest.findOne({ patient: patients[0]._id, status: 'OPEN' }).lean();
    const target = (await support.adminList({ status: 'OPEN' })).find((r) => String(r._id) === String(open._id));
    expect(target).toBeTruthy();
    expect(target.customer).toBe('Kamla D.');
    expect(target.phone).toMatch(/^•+\d{4}$/);
    expect(target.phone).not.toContain(patients[0].phone.slice(0, 6));

    const shown = await support.adminReveal(admin._id, target._id);
    expect(shown.phone).toBe(patients[0].phone);
    const stored = await CallbackRequest.findById(target._id).lean();
    expect(stored.reveals).toHaveLength(1);
    expect(String(stored.reveals[0].by)).toBe(String(admin._id));

    await support.adminUpdate(admin._id, target._id, { status: 'CLOSED', outcome: 'Booked 5 sessions' });
    expect((await support.adminList({ status: 'OPEN' })).some((r) => String(r._id) === String(target._id))).toBe(false);
    // Closed: the customer can ask again.
    expect((await api('post', '/callback', 'c0', {})).status).toBe(201);
  });
});
