/**
 * Admin panel operations: masked user database, audited contact reveal and
 * suspend, verification queue, payment log, redacted live logs and campaigns
 * (feed per audience, one-time push claim).
 */
const mongoose = require('mongoose');
const User = require('../../models/user');
const Patient = require('../../models/patient');
const PharmacyOrder = require('../../models/pharmacyOrder');
const WithdrawalRequest = require('../../models/withdrawalRequest');
const Campaign = require('../../models/campaign');
const MobileDevice = require('../../models/mobileDevice');
const SecurityAuditEvent = require('../../models/securityAuditEvent');

const RUN = Date.now();

describe('Admin ops: redaction and live logs (no DB)', () => {
  const { redact, redactString } = require('../../utils/logRedaction');
  const logBuffer = require('../../utils/logBuffer');

  it('removes secrets and masks personal data', () => {
    const out = redact({ password: 'x', authorization: 'Bearer abc', email: 'priya@gmail.com', nested: { phone: '+91 98765 43210', amount: 500 } });
    expect(out).toEqual({ password: '[REDACTED]', authorization: '[REDACTED]', email: 'p***@gmail.com', nested: { phone: '••••••3210', amount: 500 } });
    const line = redactString('login ravi@nabz.in 9876543210 mongodb+srv://u:p@c/db eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.abcdefghijk rzp_live_ABC123');
    expect(line).not.toMatch(/ravi@|9876543210|u:p@|eyJhbGci|ABC123/);
  });

  it('keeps recent lines, filters by level and polls by sequence', () => {
    logBuffer.clearForTests();
    const t = new logBuffer.BufferTransport();
    t.log({ level: 'info', message: 'hello' }, () => {});
    t.log({ level: 'error', message: 'card failed', token: 'secret' }, () => {});
    const all = logBuffer.query({ level: 'info' });
    expect(all.entries.map((e) => e.message)).toEqual(['hello', 'card failed']);
    expect(all.entries[1].meta.token).toBe('[REDACTED]');
    expect(logBuffer.query({ level: 'error' }).entries).toHaveLength(1);
    expect(logBuffer.query({ after: all.latestSeq }).entries).toHaveLength(0);
  });
});

describe('Admin ops (real MongoDB)', () => {
  let db = false;
  let admin;
  let nurse;
  let vendorUser;
  let customer;
  let order;
  const ops = () => require('../../services/adminOpsService');
  const campaigns = () => require('../../services/campaignService');
  const req = { ip: '127.0.0.1', headers: {}, get: () => 'jest' };

  beforeAll(async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000, autoIndex: false });
      db = true;
    } catch (error) {
      console.warn(`Skipping admin ops tests: MongoDB unavailable (${error.message})`);
      return;
    }
    [admin, nurse, vendorUser] = await User.create([
      { name: 'Ops Admin', email: `ops.${RUN}@nabz.test`, password: 'Strong@12345', phone: '9876508001', role: 'platform_admin', isVerified: true },
      { name: `Asha ${RUN}`, email: `asha.${RUN}@nabz.test`, password: 'Strong@12345', phone: '9876508002', role: 'nurse', isVerified: true, careProfile: { qualification: 'GNM', verification: { idVerified: true } } },
      { name: `Store ${RUN}`, email: `store.${RUN}@nabz.test`, password: 'Strong@12345', phone: '9876508003', role: 'pharmacy_vendor', isVerified: true }
    ]);
    customer = await Patient.create({ name: `Ravi ${RUN}`, email: `ravi.${RUN}@nabz.test`, password: 'Strong@12345', phone: '9876508004' });
    order = await PharmacyOrder.collection.insertOne({
      orderNumber: `MRT${RUN}`, patient: customer._id, vendor: new mongoose.Types.ObjectId(), paymentMode: 'PREPAID', paymentStatus: 'PAID',
      amounts: { itemsSubtotal: 400, total: 450, refunded: 50 }, razorpay: { paymentId: 'pay_test1', paidAt: new Date() },
      refunds: [{ amount: 50, status: 'DONE', refundId: 'rfnd_1', createdAt: new Date(), doneAt: new Date() }], createdAt: new Date(), updatedAt: new Date()
    });
    await WithdrawalRequest.create({ user: nurse._id, party: { kind: 'PROVIDER', id: nurse._id }, amount: 700, destination: { method: 'UPI', display: 'asha@okicici' } });
  });

  afterAll(async () => {
    if (!db) return;
    await PharmacyOrder.collection.deleteOne({ _id: order.insertedId });
    await WithdrawalRequest.deleteMany({ user: nurse._id });
    await Campaign.deleteMany({ createdBy: admin._id });
    await MobileDevice.deleteMany({ owner: customer._id });
    await SecurityAuditEvent.deleteMany({ actorId: admin._id });
    await Patient.deleteOne({ _id: customer._id });
    await User.deleteMany({ _id: { $in: [admin._id, nurse._id, vendorUser._id] } });
    await mongoose.disconnect();
  });

  it('lists users with contact details masked and finds them by name or phone', async () => {
    if (!db) return;
    const { users } = await ops().listUsers({ type: 'customers', q: `Ravi ${RUN}` });
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ email: 'r***@nabz.test', phone: '••••••8004', active: true });
    expect(JSON.stringify(users)).not.toContain('9876508004');
    const byPhone = await ops().listUsers({ type: 'partners', q: '98765 08002' });
    expect(byPhone.users.map((u) => u.name)).toEqual([`Asha ${RUN}`]);
    expect((await ops().listUsers({ type: 'partners', q: `Store ${RUN}` })).users[0].role).toBe('pharmacy_vendor');
    expect((await ops().listUsers({ type: 'partners', q: 'Ops Admin' })).users.filter((u) => u._id === String(admin._id))).toHaveLength(0); // admins are not partners
  });

  it('reveals contact details and suspends accounts with an audit trail', async () => {
    if (!db) return;
    const contact = await ops().revealContact('customers', customer._id, admin, req, 'Customer called about a refund');
    expect(contact).toEqual({ email: `ravi.${RUN}@nabz.test`, phone: '9876508004' });
    await ops().setActive('partners', nurse._id, false, admin, req, 'Complaint under review');
    expect((await User.findById(nurse._id).lean())).toMatchObject({ isActive: false, isOnline: false });
    await expect(ops().setActive('partners', admin._id, false, admin, req, 'x')).rejects.toThrow(/not found/i); // admins aren't in the partner list
    const events = await SecurityAuditEvent.find({ actorId: admin._id }).lean();
    expect(events.map((e) => e.event).sort()).toEqual(['admin_contact_revealed', 'admin_user_suspended']);
    await ops().setActive('partners', nurse._id, true, admin, req, 'Cleared');
  });

  it('puts staff with missing checks in the verification queue', async () => {
    if (!db) return;
    const pending = await ops().listVerification({ status: 'pending', q: `Asha ${RUN}` });
    expect(pending).toHaveLength(1);
    expect(pending[0].verification).toMatchObject({ id: true, police: false, council: false });
    expect(await ops().listVerification({ status: 'verified', q: `Asha ${RUN}` })).toHaveLength(0);
  });

  it('shows payments, refunds and withdrawals in the payment log', async () => {
    if (!db) return;
    const log = await ops().paymentLog({});
    const mine = log.entries.filter((e) => e.ref === `MRT${RUN}` || (e.kind === 'WITHDRAWAL' && e.who === `Asha ${RUN}`));
    expect(mine.map((e) => `${e.kind}:${e.amount}`).sort()).toEqual(['PAYMENT:450', 'REFUND:50', 'WITHDRAWAL:700']);
    const refunds = await ops().paymentLog({ kind: 'REFUND' });
    expect(refunds.entries.every((e) => e.kind === 'REFUND')).toBe(true);
    await expect(ops().paymentLog({ from: '2020-01-01', to: '2026-01-01' })).rejects.toThrow(/3 months/);
  });

  it('shows campaigns only to their audience while live, and pushes once', async () => {
    if (!db) return;
    await expect(campaigns().create({ title: 'Bad', body: 'Bad link', audience: 'CUSTOMERS', cta: { path: '//evil.com' } }, admin._id)).rejects.toThrow(/inside Nabz/);
    const now = new Date();
    const live = await campaigns().create({ title: `Flat 20% off ${RUN}`, body: 'On medicines this week', audience: 'CUSTOMERS', push: true, offerCode: 'nabz20', cta: { label: 'Shop', path: '/pharmacy' } }, admin._id, now);
    const later = await campaigns().create({ title: `Later ${RUN}`, body: 'Tomorrow', audience: 'CUSTOMERS', sendAt: new Date(now.getTime() + 86400000) }, admin._id, now);
    const staff = await campaigns().create({ title: `Nurses ${RUN}`, body: 'Bonus this weekend', audience: 'MEDICAL_STAFF' }, admin._id, now);
    expect([live.status, later.status]).toEqual(['LIVE', 'SCHEDULED']);

    const titles = (rows) => rows.map((r) => r.title).filter((t) => t.includes(String(RUN)));
    expect(titles(await campaigns().feed('patient'))).toEqual([`Flat 20% off ${RUN}`]);
    expect((await campaigns().feed('patient')).find((r) => r._id === String(live._id))).toMatchObject({ offerCode: 'NABZ20', cta: { label: 'Shop', path: '/pharmacy' } });
    expect(titles(await campaigns().feed('user', 'nurse'))).toEqual([`Nurses ${RUN}`]);
    expect(titles(await campaigns().feed('user', 'pharmacy_vendor'))).toEqual([]);

    await MobileDevice.create({ owner: customer._id, ownerType: 'patient', token: `tok-${RUN}`, platform: 'android' });
    const sent = [];
    const push = { sendToTokens: async ({ tokens }) => { sent.push(...tokens); return { sentCount: tokens.length, failedCount: 0, disabled: false }; } };
    await campaigns().sendDuePushes(new Date(), { push });
    await campaigns().sendDuePushes(new Date(), { push });
    expect(sent.filter((t) => t === `tok-${RUN}`)).toHaveLength(1); // once, not per tick
    expect((await Campaign.findById(live._id).lean()).push).toMatchObject({ status: 'DONE', sent: expect.any(Number) });

    await campaigns().cancel(staff._id, admin._id);
    expect(titles(await campaigns().feed('user', 'nurse'))).toEqual([]);
    await expect(campaigns().cancel(staff._id, admin._id)).rejects.toThrow(/already cancelled/);
  });
});
