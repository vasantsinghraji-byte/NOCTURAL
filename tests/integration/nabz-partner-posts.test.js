/**
 * Partner posts (real MongoDB, local storage): only partners post, the file
 * type comes from its bytes, customers see visible posts on the partner's
 * profile and shop, hidden posts disappear, and partners delete their own.
 */
const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../../models/user');
const Patient = require('../../models/patient');
const CareStore = require('../../models/careStore');
const PartnerPost = require('../../models/partnerPost');

const RUN = Date.now();
const PASSWORD = 'Strong@12345';
const MOBILE = { 'X-Nocturnal-Mobile': 'expo' };
// 1×1 PNG, and the start of an MP4 (ftyp box), as real files would begin.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.from([0, 0, 2, 0]), Buffer.from('isomiso2'), Buffer.alloc(64)]);

describe('Partner posts (real MongoDB)', () => {
  let app;
  let db = false;
  let nurse;
  let admin;
  let patient;
  let store;
  const tokens = {};

  const login = async (path, email, extra = {}) => (await request(app).post(`/api/v1${path}`).set(MOBILE).send({ email, password: PASSWORD, ...extra })).body.tokens?.accessToken;
  const auth = (t) => ({ ...MOBILE, Authorization: `Bearer ${t}` });
  const post = (token, buf, name, type, caption) => {
    const r = request(app).post('/api/v1/partner-posts').set(auth(token));
    if (caption) r.field('caption', caption);
    return r.attach('media', buf, { filename: name, contentType: type });
  };

  beforeAll(async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000, autoIndex: false });
      db = true;
    } catch (error) {
      console.warn(`Skipping partner post tests: MongoDB unavailable (${error.message})`);
      return;
    }
    await Promise.all([User.createIndexes(), Patient.createIndexes(), PartnerPost.createIndexes()]);
    app = require('../../app');
    [nurse, admin] = await User.create([
      { name: `Nurse ${RUN}`, email: `ppnurse.${RUN}@nabz.test`, password: PASSWORD, phone: '9876540101', role: 'nurse', isVerified: true },
      { name: `Admin ${RUN}`, email: `ppadmin.${RUN}@nabz.test`, password: PASSWORD, phone: '9876540102', role: 'platform_admin', isVerified: true }
    ]);
    patient = await Patient.create({ name: 'Kamla', email: `ppp.${RUN}@nabz.test`, password: PASSWORD, phone: `94${String(RUN).slice(-8)}` });
    const ins = await CareStore.collection.insertOne({ kind: 'PHYSIO', format: 'CLINIC', name: `Posts Clinic ${RUN}`, owner: nurse._id, members: [], location: { type: 'Point', coordinates: [75.78, 26.91] } });
    store = { _id: ins.insertedId };
    tokens.nurse = await login('/auth/login', nurse.email, { portal: 'staff' });
    tokens.patient = await login('/patients/login', patient.email);
  }, 60000);

  afterAll(async () => {
    if (!db) return;
    const svc = require('../../services/partnerPostService');
    for (const p of await PartnerPost.find({ author: nurse._id }).lean()) await svc.remove(nurse._id, p._id);
    await Promise.all([
      CareStore.collection.deleteOne({ _id: store._id }),
      Patient.deleteOne({ _id: patient._id }),
      User.deleteMany({ _id: { $in: [nurse._id, admin._id] } })
    ]);
    await mongoose.disconnect();
  });

  it('a partner posts a photo and a video; customers cannot post; fakes are refused', async () => {
    if (!db) return;
    const photo = await post(tokens.nurse, PNG, 'kit.png', 'image/png', 'My dressing kit');
    expect(photo.status).toBe(201);
    expect(photo.body.post).toMatchObject({ kind: 'IMAGE', caption: 'My dressing kit' });
    const video = await post(tokens.nurse, MP4, 'clinic.mp4', 'video/mp4');
    expect(video.status).toBe(201);
    expect(video.body.post.kind).toBe('VIDEO');
    // A text file named like a photo is refused by its content.
    expect((await post(tokens.nurse, Buffer.from('not an image at all, just text'.repeat(20)), 'evil.png', 'image/png')).status).toBe(400);
    expect([401, 403]).toContain((await post(tokens.patient, PNG, 'me.png', 'image/png')).status);
    // Without S3 the app is told to post the file directly.
    const link = await request(app).post('/api/v1/partner-posts/upload-url').set(auth(tokens.nurse)).send({ mime: 'video/mp4', size: 1000 });
    expect(link.body.upload).toEqual({ mode: 'direct' });
    expect((await request(app).post('/api/v1/partner-posts/upload-url').set(auth(tokens.nurse)).send({ mime: 'application/pdf', size: 1000 })).status).toBe(400);
    expect((await request(app).post('/api/v1/partner-posts/complete').set(auth(tokens.nurse)).send({ key: `partner-posts-pending/${admin._id}/x.png` })).status).toBe(400);
  });

  it('customers (even signed out) see visible posts on the profile and the shop, and can open them', async () => {
    if (!db) return;
    const byAuthor = await request(app).get(`/api/v1/partner-posts/by/${nurse._id}`);
    expect(byAuthor.status).toBe(200);
    expect(byAuthor.body.posts).toHaveLength(2);
    const byStore = await request(app).get(`/api/v1/partner-posts/store/${store._id}`);
    expect(byStore.body.posts).toHaveLength(2);
    const photo = byAuthor.body.posts.find((p) => p.kind === 'IMAGE');
    const file = await request(app).get(photo.mediaUrl);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toMatch(/image\/png/);
  });

  it('a hidden post disappears for customers but stays visible to its author', async () => {
    if (!db) return;
    const mine = (await request(app).get('/api/v1/partner-posts/mine').set(auth(tokens.nurse))).body.posts;
    const target = mine.find((p) => p.kind === 'VIDEO');
    expect([401, 403]).toContain((await request(app).get('/api/v1/partner-posts/admin').set(auth(tokens.nurse))).status);
    await require('../../services/partnerPostService').adminSetHidden(target._id, admin._id, { hidden: true, reason: 'Shows a patient' });
    expect((await request(app).get(`/api/v1/partner-posts/by/${nurse._id}`)).body.posts).toHaveLength(1);
    expect((await request(app).get(target.mediaUrl)).status).toBe(404);
    const again = (await request(app).get('/api/v1/partner-posts/mine').set(auth(tokens.nurse))).body.posts.find((p) => p._id === target._id);
    expect(again).toMatchObject({ status: 'HIDDEN', hiddenReason: 'Shows a patient' });
    expect((await request(app).get(`/api/v1/partner-posts/mine/${target._id}/media`).set(auth(tokens.nurse))).status).toBe(200);
  });

  it('partners delete only their own posts', async () => {
    if (!db) return;
    const mine = (await request(app).get('/api/v1/partner-posts/mine').set(auth(tokens.nurse))).body.posts;
    const other = await User.create({ name: 'Other', email: `ppother.${RUN}@nabz.test`, password: PASSWORD, phone: '9876540103', role: 'nurse', isVerified: true });
    const otherToken = await login('/auth/login', other.email, { portal: 'staff' });
    expect((await request(app).delete(`/api/v1/partner-posts/${mine[0]._id}`).set(auth(otherToken))).status).toBe(404);
    await User.deleteOne({ _id: other._id });
    expect((await request(app).delete(`/api/v1/partner-posts/${mine[0]._id}`).set(auth(tokens.nurse))).status).toBe(200);
    expect((await request(app).get('/api/v1/partner-posts/mine').set(auth(tokens.nurse))).body.posts).toHaveLength(mine.length - 1);
  });
});
