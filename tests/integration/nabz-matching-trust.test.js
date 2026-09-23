/**
 * Matching moment + trust layer + new sign-in: real app + real MongoDB.
 *   - Phone OTP: wrong code refused, new user completes profile, returning user signs in.
 *   - Google sign-in refuses cleanly while not configured.
 *   - "Book now" offers the visit to the nearest online nurse; decline passes it on;
 *     accept confirms it; the patient sees the nurse's trust profile + visit code.
 *   - Visit can't start without the right code; SOS alerts; family link is public but minimal.
 *   - Partner applications, staff dashboard, Home feed.
 * Skips when MONGODB_URI is unreachable.
 */

process.env.ENCRYPTION_KEY = 'a'.repeat(64);

const request = require('supertest');
const mongoose = require('mongoose');
const Patient = require('../../models/patient');
const User = require('../../models/user');
const NurseBooking = require('../../models/nurseBooking');
const ServiceCatalog = require('../../models/serviceCatalog');
const OtpChallenge = require('../../models/otpChallenge');
const PartnerApplication = require('../../models/partnerApplication');
const Notification = require('../../models/notification');
const socialAuthService = require('../../services/socialAuthService');

const RUN = `mt${Date.now().toString(36)}`;
const HOME = { lat: 26.9110, lng: 75.8010 }; // C-Scheme, Jaipur
const MOBILE = { 'X-Nocturnal-Mobile': 'expo' };
const PASSWORD = 'Strong@12345';
const PHONE = `9${String(Date.now()).slice(-9)}`;

describe('Nabz matching, trust layer and sign-in (real MongoDB)', () => {
  let app;
  let db = false;
  let nearNurse;
  let farNurse;
  let admin;
  let service;
  const tokens = {};
  let lastCode = null;

  const auth = (t) => ({ Authorization: `Bearer ${t}` });
  const login = async (email, portal) => (await request(app).post('/api/v1/auth/login').set(MOBILE).send({ email, password: PASSWORD, portal })).body.tokens.accessToken;

  beforeAll(async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000, autoIndex: false });
      db = true;
    } catch (error) {
      console.warn(`Skipping matching/trust flow: MongoDB unavailable (${error.message})`);
      return;
    }
    for (const Model of [User, Patient, NurseBooking, ServiceCatalog, OtpChallenge, PartnerApplication]) {
      await Model.createIndexes();
    }
    app = require('../../app');
    socialAuthService.setSmsSender(async ({ code }) => { lastCode = code; });

    await ServiceCatalog.deleteMany({ name: 'INJECTION_IM' });
    service = await ServiceCatalog.create({
      name: 'INJECTION_IM', slug: `injection-${RUN}`, category: 'NURSING', displayName: 'IM Injection',
      pricing: { basePrice: 299, currency: 'INR' }, availability: { isActive: true, availableCities: ['Jaipur'] },
      requirements: { prescriptionRequired: false }
    });
    [nearNurse, farNurse, admin] = await User.create([
      { name: 'Asha Verma', email: `asha.${RUN}@nabz.test`, password: PASSWORD, phone: '9876504001', role: 'nurse', isVerified: true,
        careProfile: { qualification: 'B.Sc Nursing', gender: 'FEMALE', languages: ['Hindi', 'English'], verification: { idVerified: true, councilVerified: true } } },
      { name: 'Ravi Kumar', email: `ravi.${RUN}@nabz.test`, password: PASSWORD, phone: '9876504002', role: 'nurse', isVerified: true,
        careProfile: { qualification: 'GNM', gender: 'MALE' } },
      { name: 'Ops', email: `ops.${RUN}@nabz.test`, password: PASSWORD, phone: '9876504003', role: 'platform_admin', isVerified: true }
    ]);
    tokens.near = await login(nearNurse.email, 'staff');
    tokens.far = await login(farNurse.email, 'staff');
    tokens.admin = await login(admin.email, 'admin');
    // Both nurses go online; Asha is closer.
    await request(app).put('/api/v1/care/staff/availability').set(auth(tokens.near)).send({ online: true, lat: HOME.lat + 0.01, lng: HOME.lng });
    await request(app).put('/api/v1/care/staff/availability').set(auth(tokens.far)).send({ online: true, lat: HOME.lat + 0.03, lng: HOME.lng });
  });

  afterAll(async () => {
    if (!db) return;
    await new Promise((r) => setTimeout(r, 300));
    const patient = await Patient.findOne({ phone: PHONE });
    await Promise.all([
      User.deleteMany({ _id: { $in: [nearNurse, farNurse, admin].map((u) => u._id) } }),
      patient && Patient.deleteOne({ _id: patient._id }),
      patient && NurseBooking.deleteMany({ patient: patient._id }),
      OtpChallenge.deleteMany({ phone: PHONE }),
      PartnerApplication.deleteMany({ phone: '9876504999' }),
      Notification.deleteMany({ user: { $in: [nearNurse._id, farNurse._id, admin._id] } }),
      service && ServiceCatalog.deleteOne({ _id: service._id })
    ]);
    await mongoose.disconnect();
  });

  const skip = () => !db;

  it('signs a new customer up with a phone OTP, then signs them back in', async () => {
    if (skip()) return;
    expect((await request(app).post('/api/v1/auth/social/phone/start').set(MOBILE).send({ phone: PHONE })).status).toBe(200);
    expect(lastCode).toMatch(/^\d{6}$/);
    expect((await OtpChallenge.findOne({ phone: PHONE }).lean()).codeHash).not.toContain(lastCode); // stored hashed

    const wrong = await request(app).post('/api/v1/auth/social/phone/verify').set(MOBILE).send({ phone: PHONE, code: lastCode === '000000' ? '111111' : '000000' });
    expect(wrong.status).toBe(401);

    const verify = await request(app).post('/api/v1/auth/social/phone/verify').set(MOBILE).send({ phone: PHONE, code: lastCode });
    expect(verify.body).toMatchObject({ needsProfile: true, profile: { phone: PHONE } });

    const done = await request(app).post('/api/v1/auth/social/complete').set(MOBILE)
      .send({ signupToken: verify.body.signupToken, name: 'Meera Sharma', email: `meera.${RUN}@nabz.test` });
    expect(done.status).toBe(200);
    expect(done.body.tokens.accessToken).toEqual(expect.any(String));
    tokens.patient = done.body.tokens.accessToken;

    // Returning user: a fresh code signs straight in (cooldown bypassed by aging the last challenge).
    // (native driver: Mongoose treats createdAt as immutable)
    await OtpChallenge.collection.updateMany({ phone: PHONE }, { $set: { createdAt: new Date(Date.now() - 60 * 1000) } });
    expect((await request(app).post('/api/v1/auth/social/phone/start').set(MOBILE).send({ phone: PHONE })).status).toBe(200);
    const again = await request(app).post('/api/v1/auth/social/phone/verify').set(MOBILE).send({ phone: PHONE, code: lastCode });
    expect(again.body.tokens.accessToken).toEqual(expect.any(String));
    expect(again.body.patient.phoneVerified).toBe(true);
  });

  it('Google sign-in is refused cleanly until it is configured', async () => {
    if (skip()) return;
    const res = await request(app).post('/api/v1/auth/social/google').set(MOBILE).send({ idToken: 'x'.repeat(40) });
    expect(res.status).toBe(503);
  });

  let bookingId;

  it('Book now: offers the nearest nurse; decline passes it on; accept confirms', async () => {
    if (skip()) return;
    const today = new Date().toISOString().slice(0, 10);
    const res = await request(app).post('/api/v1/bookings').set(auth(tokens.patient)).send({
      serviceType: 'INJECTION', mode: 'ASAP', scheduledDate: today, scheduledTime: '10:00',
      scheduledTimezone: 'Asia/Kolkata', scheduledTimezoneOffsetMinutes: 330,
      serviceLocation: { type: 'HOME', address: { street: 'Ashok Marg', city: 'Jaipur', pincode: '302001', coordinates: HOME } },
      patientDetails: { name: 'Meera Sharma', age: 34, gender: 'Female' }
    });
    expect(res.status).toBe(201);
    bookingId = res.body.booking._id;

    const offerNear = await request(app).get('/api/v1/bookings/offers/me').set(auth(tokens.near));
    expect(offerNear.body.offer).toMatchObject({ bookingId, earnings: 239.2 });
    expect((await request(app).get('/api/v1/bookings/offers/me').set(auth(tokens.far))).body.offer).toBeNull();

    // Asha declines → Ravi gets it.
    expect((await request(app).post(`/api/v1/bookings/${bookingId}/offer/decline`).set(auth(tokens.near))).status).toBe(200);
    expect((await request(app).get('/api/v1/bookings/offers/me').set(auth(tokens.far))).body.offer.bookingId).toBe(bookingId);
    // Asha can't grab it back.
    expect((await request(app).post(`/api/v1/bookings/${bookingId}/offer/accept`).set(auth(tokens.near))).status).toBe(409);

    const accept = await request(app).post(`/api/v1/bookings/${bookingId}/offer/accept`).set(auth(tokens.far));
    expect(accept.status).toBe(200);
    expect(accept.body.booking.status).toBe('CONFIRMED');
  });

  it('patient sees the nurse profile + visit code; the nurse never sees the code', async () => {
    if (skip()) return;
    const track = await request(app).get(`/api/v1/bookings/${bookingId}/tracking`).set(auth(tokens.patient));
    expect(track.status).toBe(200);
    expect(track.body.tracking.dispatch.status).toBe('MATCHED');
    expect(track.body.tracking.staff).toMatchObject({ name: 'Ravi Kumar', qualification: 'GNM' });
    expect(track.body.tracking.visitCode).toMatch(/^\d{4}$/);
    tokens.code = track.body.tracking.visitCode;
    tokens.share = track.body.tracking.shareToken;

    const nurseView = await request(app).get(`/api/v1/bookings/${bookingId}/tracking`).set(auth(tokens.far));
    expect(nurseView.body.tracking.visitCode).toBeUndefined();
    const detail = await request(app).get(`/api/v1/bookings/${bookingId}`).set(auth(tokens.far));
    expect(JSON.stringify(detail.body)).not.toContain(tokens.code === '0000' ? 'never' : `"code":"${tokens.code}"`);
  });

  it('the visit can only start with the patient\'s code', async () => {
    if (skip()) return;
    await request(app).put(`/api/v1/bookings/${bookingId}/en-route`).set(auth(tokens.far));
    const wrongCode = tokens.code === '0000' ? '1111' : '0000';
    expect((await request(app).put(`/api/v1/bookings/${bookingId}/start`).set(auth(tokens.far)).send({ visitCode: wrongCode })).status).toBe(400);
    expect((await request(app).put(`/api/v1/bookings/${bookingId}/start`).set(auth(tokens.far)).send({})).status).toBe(400);
    const ok = await request(app).put(`/api/v1/bookings/${bookingId}/start`).set(auth(tokens.far)).send({ visitCode: tokens.code });
    expect(ok.status).toBe(200);
    expect(ok.body.booking.status).toBe('IN_PROGRESS');
  });

  it('SOS alerts ops; the family link shows only minimal details', async () => {
    if (skip()) return;
    const sos = await request(app).post(`/api/v1/bookings/${bookingId}/sos`).set(auth(tokens.patient)).send({ note: 'Feeling faint' });
    expect(sos.status).toBe(200);
    expect(sos.body.emergencyNumbers.ambulance).toBe('108');
    expect(await Notification.countDocuments({ user: admin._id, type: 'CARE_SOS' })).toBe(1);

    const shared = await request(app).get(`/api/v1/care/track/${tokens.share}`);
    expect(shared.status).toBe(200);
    expect(shared.body.tracking.staff).toEqual({ firstName: 'Ravi', qualification: 'GNM' });
    expect(JSON.stringify(shared.body)).not.toMatch(/9876504002|@nabz\.test/);
    expect((await request(app).get('/api/v1/care/track/not-a-token')).status).toBe(404);
  });

  it('partner applications go to an admin review queue', async () => {
    if (skip()) return;
    const body = { kind: 'MEDICAL_STAFF', name: 'Pooja Singh', phone: '9876504999', qualification: 'B.Sc Nursing', registrationNumber: 'RNC-12345' };
    const apply = await request(app).post('/api/v1/partners/apply').send(body);
    expect(apply.status).toBe(201);
    expect((await request(app).post('/api/v1/partners/apply').send(body)).status).toBe(409);
    const queue = await request(app).get('/api/v1/partners/admin/applications').set(auth(tokens.admin));
    const mine = queue.body.applications.find((a) => a.phone === '9876504999');
    expect(mine.status).toBe('PENDING');
    const approve = await request(app).patch(`/api/v1/partners/admin/applications/${mine._id}`).set(auth(tokens.admin)).send({ status: 'APPROVED' });
    expect(approve.body.application.status).toBe('APPROVED');
    expect((await request(app).get('/api/v1/partners/admin/applications').set(auth(tokens.near))).status).toBe(403);
  });

  it('staff dashboard and the customer Home feed', async () => {
    if (skip()) return;
    const dash = await request(app).get('/api/v1/care/staff/dashboard').set(auth(tokens.near));
    expect(dash.status).toBe(200);
    expect(dash.body.dashboard).toMatchObject({ name: 'Asha Verma', availability: { online: true }, profile: { qualification: 'B.Sc Nursing' } });
    const home = await request(app).get('/api/v1/care/home');
    expect(home.status).toBe(200);
    expect(home.body.banners.map((b) => b.id)).toContain('plus-trial');
  });
});
