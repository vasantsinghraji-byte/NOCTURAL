/**
 * Refunds never get lost and are never paid twice (real MongoDB, fake Razorpay):
 *   - a full medicine refund that failed is retried by the minute tick and paid once;
 *   - if Razorpay paid but the answer was lost, the retry finds that refund;
 *   - orders already stuck before this existed are picked up too;
 *   - retries back off, stop at the limit, and stay in the admin queue;
 *   - admins can retry or record a bank transfer, one at a time;
 *   - two admins on the same care plan / lab refund pay it once;
 *   - a refund Razorpay itself marked failed doesn't count as paid.
 */
jest.mock('../../utils/razorpayGateway', () => {
  const actual = jest.requireActual('../../utils/razorpayGateway');
  return { ...actual, getClient: jest.fn(), isEnabled: jest.fn(() => true) };
});

const mongoose = require('mongoose');
const Patient = require('../../models/patient');
const PharmacyOrder = require('../../models/pharmacyOrder');
const PharmacyVendor = require('../../models/pharmacyVendor');
const CarePlan = require('../../models/carePlan');
const LabOrder = require('../../models/labOrder');
const gateway = require('../../utils/razorpayGateway');
const payments = require('../../services/pharmacyPaymentService');
const careAdmin = require('../../services/careAdminService');

const RUN = Date.now();
const oid = () => new mongoose.Types.ObjectId();
const MIN = 60 * 1000;

/** Razorpay stand-in: remembers every refund it really paid. */
function fakeRazorpay() {
  const paid = [];
  const f = {
    mode: 'ok', // ok | down (nothing happens) | lost (paid, then the reply is lost)
    listDown: false,
    paid,
    payments: {
      refund: jest.fn(async (paymentId, { amount, notes }) => {
        await new Promise((r) => setTimeout(r, 25)); // long enough for two callers to overlap
        if (f.mode === 'down') throw new Error('Gateway down');
        const r = { id: `rfnd_${paid.length + 1}`, payment_id: paymentId, amount, notes, status: 'processed' };
        paid.push(r);
        if (f.mode === 'lost') throw new Error('socket hang up');
        return r;
      }),
      fetchMultipleRefund: jest.fn(async (paymentId) => {
        if (f.listDown) throw new Error('Gateway down');
        return { items: paid.filter((r) => r.payment_id === paymentId) };
      })
    }
  };
  return f;
}

describe('Refund recovery (real MongoDB)', () => {
  let db = false;
  let rzp;
  let vendor;
  let patient;
  let n = 0;
  const admin = oid();

  const makeOrder = (over = {}) => {
    n += 1;
    return PharmacyOrder.create({
      orderNumber: `RR-${RUN}-${n}`, patient: patient._id, vendor: vendor._id,
      items: [{ medicine: oid(), name: 'Paracetamol', quantity: 2, unitPrice: 50, mrp: 60, lineTotal: 100 }],
      amounts: { itemsSubtotal: 100, deliveryFee: 25, total: 125, originalTotal: 125 },
      deliveryAddress: { line1: 'Tonk Road', city: 'Jaipur', pincode: '302015' },
      paymentMode: 'PREPAID', paymentStatus: 'PAID', status: 'CANCELLED',
      razorpay: { paymentId: `pay_${RUN}_${n}` },
      ...over
    });
  };
  const fresh = (o) => PharmacyOrder.findById(o._id);
  const later = (ms) => new Date(Date.now() + ms);

  beforeAll(async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000, autoIndex: false });
      db = true;
    } catch (error) {
      console.warn(`Skipping refund recovery tests: MongoDB unavailable (${error.message})`);
      return;
    }
    vendor = await PharmacyVendor.create({
      name: `Refund Store ${RUN}`, slug: `refund-store-${RUN}`, location: { type: 'Point', coordinates: [75.78, 26.91] }, status: 'APPROVED'
    });
    patient = await Patient.create({ name: 'Meena Sharma', email: `rr.${RUN}@nabz.test`, password: 'Strong@12345', phone: `96${String(RUN).slice(-8)}` });
  }, 60000);

  beforeEach(() => {
    rzp = fakeRazorpay();
    gateway.getClient.mockImplementation(() => rzp);
    gateway.isEnabled.mockImplementation(() => true);
  });

  afterEach(async () => {
    if (!db) return;
    await Promise.all([
      PharmacyOrder.deleteMany({ vendor: vendor._id }),
      CarePlan.collection.deleteMany({ patient: patient._id }),
      LabOrder.collection.deleteMany({ patient: patient._id })
    ]);
  });

  afterAll(async () => {
    if (!db) return;
    await Promise.all([PharmacyVendor.deleteOne({ _id: vendor._id }), Patient.deleteOne({ _id: patient._id })]);
    await mongoose.disconnect();
  });

  it('a refund that failed is retried by the tick and paid exactly once', async () => {
    if (!db) return;
    const order = await makeOrder();
    rzp.mode = 'down';
    await payments.refundOrderPayment(order, 'Order cancelled');
    expect((await fresh(order)).paymentStatus).toBe('REFUND_PENDING');
    rzp.mode = 'ok';
    // Not straight away: the failed attempt backs off first.
    await payments.retryFullRefunds({ now: new Date() });
    expect(rzp.paid).toHaveLength(0);
    await payments.retryFullRefunds({ now: later(5 * MIN) });
    await payments.retryFullRefunds({ now: later(60 * MIN) });
    const done = await fresh(order);
    expect(rzp.paid).toHaveLength(1);
    expect(rzp.paid[0].amount).toBe(12500);
    expect(done.paymentStatus).toBe('REFUNDED');
    expect(done.razorpay.refundId).toBe('rfnd_1');
    expect(done.razorpay.refundError).toBeUndefined();
  });

  it('Razorpay paid but the reply was lost: the retry records it instead of paying again', async () => {
    if (!db) return;
    const order = await makeOrder();
    rzp.mode = 'lost';
    await payments.refundOrderPayment(order, 'Order cancelled');
    expect(rzp.paid).toHaveLength(1);
    rzp.mode = 'ok';
    await payments.retryFullRefunds({ now: later(5 * MIN) });
    expect(rzp.paid).toHaveLength(1);
    expect((await fresh(order)).paymentStatus).toBe('REFUNDED');
  });

  it('if Razorpay can’t be asked about earlier attempts, nothing is paid', async () => {
    if (!db) return;
    const order = await makeOrder();
    rzp.mode = 'lost';
    await payments.refundOrderPayment(order, 'Order cancelled');
    rzp.mode = 'ok';
    rzp.listDown = true;
    await payments.retryFullRefunds({ now: later(5 * MIN) });
    expect(rzp.paid).toHaveLength(1);
    expect((await fresh(order)).paymentStatus).toBe('REFUND_PENDING');
  });

  it('an order stuck before retries existed is picked up', async () => {
    if (!db) return;
    const order = await makeOrder({ paymentStatus: 'REFUND_PENDING' });
    await payments.retryFullRefunds({ now: new Date() });
    expect(rzp.paid).toHaveLength(1);
    expect((await fresh(order)).paymentStatus).toBe('REFUNDED');
  });

  it('an earlier partial refund on the same payment is not mistaken for the full one', async () => {
    if (!db) return;
    const order = await makeOrder({ paymentStatus: 'REFUND_PENDING' });
    rzp.paid.push({ id: 'rfnd_part', payment_id: order.razorpay.paymentId, amount: 1500, status: 'processed', notes: { pharmacyOrderId: String(order._id), refundEntryId: String(oid()) } });
    await payments.retryFullRefunds({ now: new Date() });
    expect(rzp.paid.filter((r) => r.amount === 12500)).toHaveLength(1);
  });

  it('a refund Razorpay marked failed does not count as paid (full and partial)', async () => {
    if (!db) return;
    const full = await makeOrder({ paymentStatus: 'REFUND_PENDING' });
    rzp.paid.push({ id: 'rfnd_bad', payment_id: full.razorpay.paymentId, amount: 12500, status: 'failed', notes: { pharmacyOrderId: String(full._id) } });
    await payments.retryFullRefunds({ now: new Date() });
    expect((await fresh(full)).razorpay.refundId).not.toBe('rfnd_bad');

    const part = await makeOrder({ status: 'ACCEPTED', refunds: [{ amount: 15, reason: 'Item unavailable', status: 'FAILED', attempts: 1 }] });
    rzp.paid.push({ id: 'rfnd_bad2', payment_id: part.razorpay.paymentId, amount: 1500, status: 'failed', notes: { refundEntryId: String(part.refunds[0]._id) } });
    await payments.retryPartialRefunds({ now: new Date() });
    const p = await fresh(part);
    expect(p.refunds[0].status).toBe('DONE');
    expect(p.refunds[0].refundId).not.toBe('rfnd_bad2');
  });

  it('two workers at the same moment pay once', async () => {
    if (!db) return;
    const order = await makeOrder({ paymentStatus: 'REFUND_PENDING' });
    const now = new Date();
    await Promise.all([1, 2, 3].map(() => payments.retryFullRefunds({ now })));
    expect(rzp.paid).toHaveLength(1);
    expect((await fresh(order)).paymentStatus).toBe('REFUNDED');
  });

  it('retries stop at the limit, and the order stays in the admin queue with the reason', async () => {
    if (!db) return;
    const order = await makeOrder({ paymentStatus: 'REFUND_PENDING' });
    rzp.mode = 'down';
    for (let i = 1; i <= 30; i += 1) await payments.retryFullRefunds({ now: later(i * 24 * 60 * MIN) });
    const calls = rzp.payments.refund.mock.calls.length;
    expect(calls).toBeGreaterThanOrEqual(8);
    expect(calls).toBeLessThanOrEqual(12);
    const row = (await careAdmin.refundQueue()).find((r) => String(r.id) === String(order._id));
    expect(row).toMatchObject({ type: 'PHARMACY', customer: 'Meena S.', amount: 125, error: 'Gateway down', stopped: true });
    expect(JSON.stringify(row)).not.toContain(patient.phone);
  });

  it('an admin retry works after the limit and pays once even if two admins press it', async () => {
    if (!db) return;
    const order = await makeOrder({ paymentStatus: 'REFUND_PENDING', razorpay: { paymentId: `pay_lim_${RUN}`, refundAttempts: 12 } });
    const out = await Promise.allSettled([1, 2].map(() => careAdmin.processRefund(admin, { type: 'PHARMACY', id: order._id })));
    expect(out.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(rzp.paid).toHaveLength(1);
    expect((await fresh(order)).paymentStatus).toBe('REFUNDED');
  });

  it('a bank transfer is recorded with who did it, and stops the retries', async () => {
    if (!db) return;
    const order = await makeOrder({ paymentStatus: 'REFUND_PENDING' });
    await careAdmin.processRefund(admin, { type: 'PHARMACY', id: order._id, reference: 'UTR12345' });
    await payments.retryFullRefunds({ now: later(60 * MIN) });
    expect(rzp.paid).toHaveLength(0);
    const o = await fresh(order);
    expect(o.paymentStatus).toBe('REFUNDED');
    expect(o.razorpay).toMatchObject({ refundId: 'UTR12345', refundMethod: 'BANK' });
    expect(String(o.razorpay.refundedBy)).toBe(String(admin));
  });

  it('a bank transfer is refused when Razorpay already paid, or can’t be asked', async () => {
    if (!db) return;
    const order = await makeOrder();
    rzp.mode = 'lost';
    await payments.refundOrderPayment(order, 'Order cancelled');
    rzp.listDown = true;
    await PharmacyOrder.updateOne({ _id: order._id }, { $unset: { 'razorpay.refundLockedUntil': 1 } });
    await expect(careAdmin.processRefund(admin, { type: 'PHARMACY', id: order._id, reference: 'UTR1' })).rejects.toThrow(/Razorpay/);
    expect((await fresh(order)).paymentStatus).toBe('REFUND_PENDING');
    rzp.listDown = false;
    await expect(careAdmin.processRefund(admin, { type: 'PHARMACY', id: order._id, reference: 'UTR1' })).rejects.toThrow(/already/);
    expect((await fresh(order)).razorpay.refundId).toBe('rfnd_1'); // the real one is kept
  });

  it('a stuck partial refund shows in the queue and can be settled by an admin', async () => {
    if (!db) return;
    const order = await makeOrder({ status: 'DELIVERED', refunds: [{ amount: 15, reason: 'Item unavailable', status: 'FAILED', attempts: 8, error: 'Gateway down' }] });
    const row = (await careAdmin.refundQueue()).find((r) => String(r.id) === String(order._id));
    expect(row).toMatchObject({ type: 'PHARMACY', amount: 15, stopped: true });
    expect(String(row.entryId)).toBe(String(order.refunds[0]._id));
    await careAdmin.processRefund(admin, { type: 'PHARMACY', id: order._id, entryId: row.entryId });
    const o = await fresh(order);
    expect(o.refunds[0].status).toBe('DONE');
    expect(o.amounts.refunded).toBe(15);
    expect(o.paymentStatus).toBe('PAID'); // only the item was refunded
  });

  it('an admin pressing refund while the automatic retry is sending it: paid once (full and one item)', async () => {
    if (!db) return;
    const pause = (ms) => new Promise((r) => setTimeout(r, ms));
    const full = await makeOrder({ paymentStatus: 'REFUND_PENDING', razorpay: { paymentId: `pay_mid_${RUN}`, refundAttempts: 2, refundError: 'Gateway down' } });
    const sending = payments.retryFullRefunds({ now: new Date() });
    await pause(12);
    await Promise.allSettled([careAdmin.processRefund(admin, { type: 'PHARMACY', id: full._id }), sending]);
    expect(rzp.paid).toHaveLength(1);

    const part = await makeOrder({ status: 'DELIVERED', refunds: [{ amount: 15, reason: 'Item unavailable', status: 'FAILED', attempts: 2, error: 'Gateway down' }] });
    const sending2 = payments.retryPartialRefunds({ now: new Date() });
    await pause(12);
    await Promise.allSettled([careAdmin.processRefund(admin, { type: 'PHARMACY', id: part._id, entryId: part.refunds[0]._id }), sending2]);
    expect(rzp.paid.filter((r) => r.payment_id === part.razorpay.paymentId)).toHaveLength(1);
    expect((await fresh(part)).amounts.refunded).toBe(15);
  });

  it('two admins on one care-plan refund pay it once', async () => {
    if (!db) return;
    const _id = oid();
    await CarePlan.collection.insertOne({
      _id, patient: patient._id, status: 'CANCELLED', payment: { paymentId: `pay_plan_${RUN}`, status: 'PAID', amount: 5000 },
      refund: { amount: 1200, status: 'PENDING', requestedAt: new Date() }
    });
    const out = await Promise.allSettled([1, 2].map(() => careAdmin.processRefund(admin, { type: 'PLAN', id: _id })));
    expect(out.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(rzp.paid).toHaveLength(1);
    expect((await CarePlan.collection.findOne({ _id })).refund.status).toBe('PROCESSED');
  });

  it('a lab refund whose reply was lost is found on the next try, not paid again', async () => {
    if (!db) return;
    const _id = oid();
    await LabOrder.collection.insertOne({ _id, patient: patient._id, status: 'CANCELLED', payment: { paymentId: `pay_lab_${RUN}`, status: 'REFUND_PENDING', amount: 400 } });
    rzp.mode = 'lost';
    await expect(careAdmin.processRefund(admin, { type: 'LAB', id: _id })).rejects.toThrow();
    rzp.mode = 'ok';
    const out = await careAdmin.processRefund(admin, { type: 'LAB', id: _id });
    expect(out.refundId).toBe('rfnd_1');
    expect(rzp.paid).toHaveLength(1);
    expect((await LabOrder.collection.findOne({ _id })).payment.status).toBe('REFUNDED');
  });
});
