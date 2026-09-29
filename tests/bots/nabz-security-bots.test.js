/**
 * Security bots: an attacker's checklist run against the real API.
 *   - brute-forcing 4-digit visit / delivery codes with parallel guesses
 *   - mass assignment (sending fields the client must never set)
 *   - account discovery through sign-in and password-reset messages
 *   - password guessing without lockout
 *   - OTP guessing and SMS flooding
 * Each finding is listed at the end.
 */

const NurseBooking = require('../../models/nurseBooking');
const PharmacyOrder = require('../../models/pharmacyOrder');
const Patient = require('../../models/patient');
const User = require('../../models/user');
const { createHarness, HOME, MOBILE, PASSWORD, ist, bodyOf } = require('./harness');

const h = createHarness('sec');
const { u, t } = h;

describe('Security bots (real API, real MongoDB)', () => {
  beforeAll(h.setup);
  afterAll(h.teardown);

  it('brute-force bot: 60 parallel guesses at a visit code are held to 5', async () => {
    if (!h.db) return;
    const b = h.bookingOf(await h.book(t.p1, { scheduledDate: ist(2), scheduledTime: '10:00' }));
    if (!b) { h.note('bruteforce', 'booking for the test', 'failed'); return; }
    await h.req().put(`/api/v1/bookings/${b._id}/assign`).set(h.auth(t.admin)).send({ providerId: String(u.n1._id) });
    await NurseBooking.updateOne({ _id: b._id }, { $set: { status: 'EN_ROUTE' } });
    const real = (await NurseBooking.findById(b._id).select('+visitOtp.code').lean()).visitOtp.code;
    const guesses = Array.from({ length: 60 }, (_, i) => String(i).padStart(4, '0')).filter((g) => g !== real);
    guesses.push(real); // the right code is among the parallel guesses
    const rs = await Promise.all(guesses.map((code) => h.req().put(`/api/v1/bookings/${b._id}/start`).set(h.auth(t.n1)).send({ visitCode: code })));
    const after = await NurseBooking.findById(b._id).select('+visitOtp.code').lean();
    const checked = (after.visitOtp.failedAttempts || 0) + (after.visitOtp.verifiedAt ? 1 : 0);
    if (checked > 6) h.note('bruteforce', 'at most 5 wrong visit-code guesses are ever checked', `${checked} guesses were checked`);
    if (after.status === 'IN_PROGRESS' && rs.findIndex((r) => r.status === 200) >= 0 && checked > 6) h.note('bruteforce', 'parallel guessing cannot start a visit', 'visit started by guessing');
  });

  it('brute-force bot: 60 parallel guesses at a delivery code are held to 5', async () => {
    if (!h.db) return;
    const o = h.orderOf(await h.order(t.p2, u.storeB, 1));
    if (!o) { h.note('bruteforce', 'order for the test', 'failed'); return; }
    await PharmacyOrder.updateOne({ _id: o._id }, { $set: { status: 'OUT_FOR_DELIVERY' } });
    const real = (await PharmacyOrder.findById(o._id).select('+deliveryOtp.code').lean()).deliveryOtp.code;
    const guesses = Array.from({ length: 60 }, (_, i) => String(9999 - i).padStart(4, '0')).filter((g) => g !== real);
    guesses.push(real);
    await Promise.all(guesses.map((code) => h.req().patch(`/api/v1/pharmacy/vendor/orders/${o._id}/status`).set(h.auth(t.vendorB)).send({ status: 'DELIVERED', deliveryCode: code })));
    const after = await PharmacyOrder.findById(o._id).select('+deliveryOtp.code').lean();
    const checked = (after.deliveryOtp.failedAttempts || 0) + (after.deliveryOtp.verifiedAt || after.status === 'DELIVERED' ? 1 : 0);
    if (checked > 6) h.note('bruteforce', 'at most 5 wrong delivery-code guesses are ever checked', `${checked} guesses were checked`);
  });

  it('mass-assignment bot: clients cannot set protected fields', async () => {
    if (!h.db) return;
    await Patient.updateOne({ _id: u.p1._id }, { $set: { pendingDues: 250 } });
    await h.req().put('/api/v1/patients/me').set(h.auth(t.p1)).send({
      name: 'Priya Bot', pendingDues: 0, totalSpent: 999999, isVerified: true, isActive: true, role: 'platform_admin',
      phoneVerified: true, emailVerified: true, referredByPartner: String(u.n1._id), password: 'Hacked@12345'
    });
    const p = await Patient.findById(u.p1._id).select('+password').lean();
    if (p.pendingDues !== 250) h.note('mass-assignment', 'a customer cannot clear their own dues', { pendingDues: p.pendingDues });
    if (p.totalSpent === 999999) h.note('mass-assignment', 'a customer cannot set totalSpent', 'changed');
    if (p.phoneVerified === true) h.note('mass-assignment', 'a customer cannot mark their phone verified', 'changed');
    if (p.role) h.note('mass-assignment', 'a customer cannot give themselves a role', p.role);
    const login = await h.req().post('/api/v1/patients/login').set(MOBILE).send({ email: u.p1.email, password: 'Hacked@12345' });
    if (login.status === 200) h.note('mass-assignment', 'profile update cannot change the password', 'password changed');

    // A nurse marking herself verified / top-rated through her profile.
    await User.updateOne({ _id: u.n2._id }, { $set: { 'careProfile.verification.policeVerified': false } });
    await h.req().put('/api/v1/care/staff/profile').set(h.auth(t.n2)).send({
      careProfile: { verification: { policeVerified: true } }, verification: { police: true }, rating: 5, totalReviews: 999, role: 'platform_admin', isVerified: true
    });
    const n = await User.findById(u.n2._id).lean();
    if (n.careProfile?.verification?.policeVerified) h.note('mass-assignment', 'a nurse cannot verify herself', 'policeVerified set');
    if (n.role !== 'nurse') h.note('mass-assignment', 'a nurse cannot change her role', n.role);
    if (n.totalReviews === 999) h.note('mass-assignment', 'a nurse cannot set her own reviews', 'changed');

    // Booking and order bodies carrying prices, status and payment.
    const b = h.bookingOf(await h.book(t.p1, { scheduledDate: ist(3), scheduledTime: '14:00', pricing: { basePrice: 1, payableAmount: 1, totalAmount: 1 }, status: 'COMPLETED', serviceProvider: String(u.n1._id), payment: { status: 'PAID', method: 'ONLINE' } }));
    if (b) {
      const saved = await NurseBooking.findById(b._id).lean();
      if (saved.pricing.basePrice < 100) h.note('mass-assignment', 'a customer cannot set the visit price', saved.pricing);
      if (saved.status === 'COMPLETED') h.note('mass-assignment', 'a customer cannot create a completed visit', 'COMPLETED');
      if (saved.serviceProvider) h.note('mass-assignment', 'a customer cannot pick the assigned nurse directly', String(saved.serviceProvider));
      if (saved.payment?.status === 'PAID') h.note('mass-assignment', 'a customer cannot mark a visit paid', 'PAID');
    }
    const o = h.orderOf(await h.order(t.p1, u.storeA, 1, { amounts: { total: 1, itemsSubtotal: 1 }, paymentStatus: 'PAID', status: 'DELIVERED' }));
    if (o) {
      const saved = await PharmacyOrder.findById(o._id).lean();
      if (saved.amounts.total < 20) h.note('mass-assignment', 'a customer cannot set the order total', saved.amounts);
      if (saved.paymentStatus === 'PAID') h.note('mass-assignment', 'a customer cannot mark an order paid', 'PAID');
      if (saved.status === 'DELIVERED') h.note('mass-assignment', 'a customer cannot create a delivered order', 'DELIVERED');
    }
  });

  it('discovery bot: sign-in and reset messages don’t reveal who has an account', async () => {
    if (!h.db) return;
    const known = await h.req().post('/api/v1/patients/login').set(MOBILE).send({ email: u.p2.email, password: 'Wrong@12345' });
    const unknown = await h.req().post('/api/v1/patients/login').set(MOBILE).send({ email: `nobody.${h.RUN}@nabz.test`, password: 'Wrong@12345' });
    if (known.status !== unknown.status || known.body.message !== unknown.body.message) h.note('discovery', 'customer sign-in answers the same for unknown and known emails', { known: [known.status, known.body.message], unknown: [unknown.status, unknown.body.message] });
    const sKnown = await h.req().post('/api/v1/auth/login').set(MOBILE).send({ email: u.n2.email, password: 'Wrong@12345', portal: 'staff' });
    const sUnknown = await h.req().post('/api/v1/auth/login').set(MOBILE).send({ email: `nobody2.${h.RUN}@nabz.test`, password: 'Wrong@12345', portal: 'staff' });
    if (sKnown.status !== sUnknown.status || sKnown.body.message !== sUnknown.body.message) h.note('discovery', 'staff sign-in answers the same for unknown and known emails', { known: [sKnown.status, sKnown.body.message], unknown: [sUnknown.status, sUnknown.body.message] });
    const rKnown = await h.req().post('/api/v1/auth/password/forgot').set(MOBILE).send({ email: u.n2.email });
    const rUnknown = await h.req().post('/api/v1/auth/password/forgot').set(MOBILE).send({ email: `nobody3.${h.RUN}@nabz.test` });
    if (rKnown.status !== rUnknown.status || rKnown.body.message !== rUnknown.body.message) h.note('discovery', 'password reset answers the same for unknown and known emails', { known: [rKnown.status, rKnown.body.message], unknown: [rUnknown.status, rUnknown.body.message] });
  });

  it('password-guessing bot: an account locks after repeated wrong passwords', async () => {
    if (!h.db) return;
    const tries = [];
    for (let i = 0; i < 12; i += 1) tries.push(await h.req().post('/api/v1/patients/login').set(MOBILE).send({ email: u.p2.email, password: `Guess${i}@12345` }));
    const right = await h.req().post('/api/v1/patients/login').set(MOBILE).send({ email: u.p2.email, password: PASSWORD });
    const lockedAt = tries.findIndex((r) => r.status === 423 || r.status === 429 || /locked|too many/i.test(r.body.message || ''));
    if (lockedAt === -1 && right.status === 200) h.note('password-guessing', 'the account locks (or slows) after ~10 wrong passwords', '12 wrong guesses then the right one signed in');
    const parallel = await Promise.all(Array.from({ length: 30 }, (_, i) => h.req().post('/api/v1/auth/login').set(MOBILE).send({ email: u.n1.email, password: `Par${i}@12345`, portal: 'staff' })));
    const checked = parallel.filter((r) => r.status === 401).length;
    if (checked > 12) h.note('password-guessing', 'parallel wrong passwords are capped too', `${checked} of 30 parallel guesses were checked`);
  });

  it('otp bot: phone codes can’t be guessed or used to flood SMS', async () => {
    if (!h.db) return;
    const sent = [];
    require('../../services/socialAuthService').setSmsSender(async ({ phone, code }) => { sent.push({ phone, code }); });
    const phone = `97${String(Date.now()).slice(-8)}`;
    const start = await h.req().post('/api/v1/auth/social/phone/start').set(MOBILE).send({ phone });
    if (start.status !== 200) { h.note('otp', 'phone sign-in starts', `${start.status}`); return; }
    const real = sent[sent.length - 1]?.code;
    const guesses = Array.from({ length: 40 }, (_, i) => String(100000 + i)).filter((g) => g !== real);
    guesses.push(real);
    const rs = await Promise.all(guesses.map((code) => h.req().post('/api/v1/auth/social/phone/verify').set(MOBILE).send({ phone, code })));
    const accepted = rs.filter((r) => r.status === 200).length;
    const wrong = rs.filter((r) => r.status === 401).length;
    if (wrong > 6 && accepted > 0) h.note('otp', 'parallel OTP guesses are capped at a few attempts', `${wrong} wrong guesses checked, then accepted`);
    // SMS flood: the same phone, many starts.
    const before = sent.length;
    await Promise.all(Array.from({ length: 10 }, () => h.req().post('/api/v1/auth/social/phone/start').set(MOBILE).send({ phone })));
    if (sent.length - before > 1) h.note('otp', 'one phone can’t be sent a burst of SMS', `${sent.length - before} SMS sent in a burst`);
    // SMS pumping: many different numbers from one client.
    const b2 = sent.length;
    await Promise.all(Array.from({ length: 40 }, (_, i) => h.req().post('/api/v1/auth/social/phone/start').set(MOBILE).send({ phone: `96${String(Date.now() + i).slice(-8)}` })));
    if (sent.length - b2 > 20) h.note('otp', 'one client can’t trigger SMS to dozens of numbers in seconds (SMS cost abuse)', `${sent.length - b2} SMS sent`);
    // Tests share one IP: free its SMS allowance for the suites that run next.
    await require('../../models/requestCounter').deleteMany({ key: /^otp-ip:/ });
  });

  it('reports every finding', () => {
    expect(h.report()).toEqual([]);
  });
});
