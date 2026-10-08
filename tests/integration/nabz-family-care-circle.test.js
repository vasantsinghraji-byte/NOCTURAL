/**
 * Care Circle and care logs (real MongoDB): a son helps manage his mother's
 * care; the nurse logs the visit; the family sees it, strangers don't.
 */
const request = require('supertest');
const mongoose = require('mongoose');
const Patient = require('../../models/patient');
const User = require('../../models/user');
const NurseBooking = require('../../models/nurseBooking');
const Notification = require('../../models/notification');
const FamilyLink = require('../../models/familyLink');
const CareLog = require('../../models/careLog');

const PASSWORD = 'Strong@12345';
const RUN = Date.now();
const MOBILE = { 'X-Nocturnal-Mobile': 'expo' };
const HOME = { lat: 26.9124, lng: 75.7873 };
const phone = (n) => `8${String(RUN + n).slice(-9)}`;

describe('Care Circle and care logs (real MongoDB)', () => {
  let app;
  let db = false;
  const tokens = {};
  const people = {};
  let nurse;
  let otherNurse;
  let visit;
  let link;

  const login = async (path, email, extra = {}) => (await request(app).post(`/api/v1${path}`).set(MOBILE).send({ email, password: PASSWORD, ...extra })).body.tokens?.accessToken;
  const api = (method, path, who, body) => {
    const r = request(app)[method](`/api/v1/family${path}`).set(MOBILE);
    if (who) r.set({ Authorization: `Bearer ${tokens[who]}` });
    return body !== undefined ? r.send(body) : r;
  };
  const waitFor = async (fn, tries = 20) => { for (let i = 0; i < tries; i += 1) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };

  beforeAll(async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000, autoIndex: false });
      db = true;
    } catch (error) {
      console.warn(`Skipping Care Circle tests: MongoDB unavailable (${error.message})`);
      return;
    }
    app = require('../../app');
    await Promise.all([FamilyLink.createIndexes(), CareLog.createIndexes()]);
    for (const [k, name, i] of [['mother', 'Kamla Devi', 1], ['son', 'Rahul Sharma', 2], ['stranger', 'Anil Kumar', 3]]) {
      people[k] = await Patient.create({ name, email: `${k}.${RUN}@nabz.test`, password: PASSWORD, phone: phone(i) });
      tokens[k] = await login('/patients/login', people[k].email);
    }
    const verified = { careProfile: { verification: { idVerified: true, policeVerified: true, councilVerified: true } } };
    [nurse, otherNurse] = await User.create([
      { name: 'Nurse Asha', email: `asha.${RUN}@nabz.test`, password: PASSWORD, phone: '9876540001', role: 'nurse', isVerified: true, ...verified },
      { name: 'Nurse Bina', email: `bina.${RUN}@nabz.test`, password: PASSWORD, phone: '9876540002', role: 'nurse', isVerified: true, ...verified }
    ]);
    tokens.nurse = await login('/auth/login', nurse.email, { portal: 'staff' });
    tokens.otherNurse = await login('/auth/login', otherNurse.email, { portal: 'staff' });
    visit = await NurseBooking.create({
      patient: people.mother._id, serviceProvider: nurse._id, serviceType: 'ELDERLY_CARE',
      scheduledDate: new Date(), scheduledTime: '10:00', scheduledTimezone: 'Asia/Kolkata', scheduledTimezoneOffsetMinutes: 330,
      serviceLocation: { type: 'HOME', address: { street: 'Ashok Marg', city: 'Jaipur', pincode: '302001', coordinates: HOME } },
      pricing: { basePrice: 600, platformFee: 90, gst: 124.2, totalAmount: 814.2, payableAmount: 814.2 },
      status: 'CONFIRMED'
    });
  }, 90000);

  afterAll(async () => {
    if (!db) return;
    const pids = Object.values(people).map((p) => p._id);
    await Promise.all([
      FamilyLink.deleteMany({ $or: [{ helper: { $in: pids } }, { member: { $in: pids } }] }),
      CareLog.deleteMany({ patient: { $in: pids } }),
      NurseBooking.deleteMany({ patient: { $in: pids } }),
      Notification.deleteMany({ user: { $in: [...pids, nurse && nurse._id].filter(Boolean) } }),
      Patient.deleteMany({ _id: { $in: pids } }),
      User.deleteMany({ _id: { $in: [nurse, otherNurse].filter(Boolean).map((u) => u._id) } })
    ]);
    await mongoose.disconnect();
  });

  it('the son invites his mother by phone; nothing is shared until she accepts', async () => {
    if (!db) return;
    expect((await api('post', '/invite', 'son', { phone: '9000000000' })).body.code).toBe('NO_ACCOUNT');
    expect((await api('post', '/invite', 'son', { phone: people.son.phone })).status).toBe(400); // own number
    const res = await api('post', '/invite', 'son', { phone: `+91 ${people.mother.phone}`, relation: 'Mother' });
    expect(res.status).toBe(201);
    link = res.body.link;
    expect(link).toMatchObject({ role: 'HELPER', status: 'PENDING', relation: 'Mother', person: { name: 'Kamla Devi' } });
    expect((await api('post', '/invite', 'son', { phone: people.mother.phone })).status).toBe(409); // already invited
    expect((await api('get', `/members/${people.mother._id}/care`, 'son')).status).toBe(403); // not accepted yet
    const mine = await api('get', '/', 'mother');
    expect(mine.body.invites).toHaveLength(1);
    expect(mine.body.invites[0].person.name).toBe('Rahul Sharma');
  });

  it('only the invited person can answer; after accepting, the son sees her care', async () => {
    if (!db) return;
    expect((await api('post', `/${link._id}/accept`, 'stranger')).status).toBe(404);
    expect((await api('post', `/${link._id}/accept`, 'son')).status).toBe(404);
    expect((await api('post', `/${link._id}/accept`, 'mother')).body.link.status).toBe('ACTIVE');
    const care = await api('get', `/members/${people.mother._id}/care`, 'son');
    expect(care.status).toBe(200);
    expect(care.body.member.name).toBe('Kamla Devi');
    expect(care.body.visits[0]).toMatchObject({ serviceType: 'ELDERLY_CARE', professional: 'Nurse Asha', status: 'CONFIRMED' });
    expect((await api('get', `/members/${people.mother._id}/care`, 'stranger')).status).toBe(403);
    expect((await api('get', '/', 'mother')).body.helpers[0].person.name).toBe('Rahul Sharma');
  });

  it('a visit update to the mother also reaches her son (once, no loops)', async () => {
    if (!db) return;
    await Notification.create({ user: people.mother._id, recipientModel: 'Patient', type: 'CARE_VISIT_UPDATE', title: 'Your nurse is on the way', message: 'Asha is 10 minutes away.', metadata: { bookingId: String(visit._id) } });
    expect(await waitFor(async () => (await Notification.countDocuments({ user: people.son._id, type: 'CARE_VISIT_UPDATE' })) === 1)).toBe(true);
    const copy = await Notification.findOne({ user: people.son._id, type: 'CARE_VISIT_UPDATE' }).lean();
    expect(copy.title).toBe('Kamla: Your nurse is on the way');
    expect(copy.metadata).toMatchObject({ family: true, memberId: String(people.mother._id) });
    await new Promise((r) => setTimeout(r, 300));
    expect(await Notification.countDocuments({ user: people.son._id, type: 'CARE_VISIT_UPDATE' })).toBe(1);
    expect(await Notification.countDocuments({ user: people.stranger._id })).toBe(0);
  });

  it('only the nurse on the visit writes the care log, and only while it runs', async () => {
    if (!db) return;
    const write = (who, body) => api('post', `/care-log/staff/${visit._id}`, who, body);
    expect((await write('nurse', { kind: 'NOTE', text: 'Arrived' })).status).toBe(400); // not started yet
    await NurseBooking.updateOne({ _id: visit._id }, { $set: { status: 'IN_PROGRESS', 'statusTimestamps.startedAt': new Date() } });
    expect((await write('otherNurse', { kind: 'NOTE', text: 'Hello' })).status).toBe(403);
    expect((await write('nurse', { kind: 'VITALS', vitals: { bpSys: 130 } })).status).toBe(400); // half a BP
    expect((await write('nurse', { kind: 'VITALS', vitals: { bpSys: 130, bpDia: 85, sugar: 142 } })).status).toBe(201);
    expect((await write('nurse', { kind: 'MEDICINE', text: 'Metformin 500 mg after lunch' })).status).toBe(201);
    const res = await write('nurse', { kind: 'MEAL', text: 'Dal, roti, half bowl curd' });
    expect(res.body.log.entries.map((e) => e.kind)).toEqual(['VITALS', 'MEDICINE', 'MEAL']);
  });

  it('the mother and her son read the log; a stranger cannot', async () => {
    if (!db) return;
    for (const who of ['mother', 'son']) {
      const r = await api('get', `/care-log/visit/${visit._id}`, who);
      expect(r.status).toBe(200);
      expect(r.body.log.entries[0].vitals).toMatchObject({ bpSys: 130, bpDia: 85, sugar: 142 });
      expect(r.body.log.professional).toBe('Nurse Asha');
    }
    expect((await api('get', `/care-log/visit/${visit._id}`, 'stranger')).status).toBe(404);
  });

  it('ending the link stops access straight away', async () => {
    if (!db) return;
    expect((await api('delete', `/${link._id}`, 'mother')).body.removed).toBe(true);
    expect((await api('get', `/care-log/visit/${visit._id}`, 'son')).status).toBe(404);
    expect((await api('get', `/members/${people.mother._id}/care`, 'son')).status).toBe(403);
  });
});
