/**
 * Pharmacy prepaid checkout (Razorpay) — DB-free unit tests.
 *
 * PharmacyOrder and the Razorpay SDK are mocked; these lock the security and
 * money-safety rules: signature + server-side amount checks, compare-and-set
 * state changes, reconcile-before-expire, and never-throwing refunds.
 */

const crypto = require('crypto');

jest.mock('../../../models/pharmacyOrder', () => ({
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
  find: jest.fn(),
  updateOne: jest.fn()
}));
jest.mock('../../../services/pharmacyService', () => ({ restockOrder: jest.fn() }));
jest.mock('../../../services/pharmacyNotificationService', () => ({ notifyVendorNewOrder: jest.fn() }));
jest.mock('../../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), logSecurity: jest.fn()
}));
jest.mock('../../../utils/monitoring', () => ({ triggerAlert: jest.fn(), trackError: jest.fn() }));

const mockRazorpay = {
  orders: { create: jest.fn(), fetch: jest.fn(), fetchPayments: jest.fn() },
  payments: { fetch: jest.fn(), capture: jest.fn(), refund: jest.fn() }
};
jest.mock('../../../utils/razorpayGateway', () => {
  const actual = jest.requireActual('../../../utils/razorpayGateway');
  return { ...actual, getClient: jest.fn(), isEnabled: jest.fn(), getPublicKeyId: jest.fn() };
});

const PharmacyOrder = require('../../../models/pharmacyOrder');
const { restockOrder } = require('../../../services/pharmacyService');
const logger = require('../../../utils/logger');
const gateway = require('../../../utils/razorpayGateway');
const svc = require('../../../services/pharmacyPaymentService');

const SECRET = 'test_secret_for_hmac';
const ORDER_ID = '64b7f0c2a1b2c3d4e5f60718';
const PATIENT_ID = '64b7f0c2a1b2c3d4e5f60719';

const sign = (orderId, paymentId) => crypto
  .createHmac('sha256', SECRET).update(`${orderId}|${paymentId}`).digest('hex');

const makeOrder = (overrides = {}) => ({
  _id: ORDER_ID,
  patient: PATIENT_ID,
  orderNumber: 'MRTEST1234',
  status: 'PLACED',
  paymentMode: 'PREPAID',
  paymentStatus: 'PENDING',
  paymentExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
  amounts: { total: 245.5 },
  razorpay: {},
  ...overrides
});

beforeEach(() => {
  // jest.config sets resetMocks, which wipes factory implementations — re-arm.
  gateway.getClient.mockReturnValue(mockRazorpay);
  gateway.isEnabled.mockReturnValue(true);
  gateway.getPublicKeyId.mockReturnValue('rzp_test_key');
  process.env.RAZORPAY_KEY_SECRET = SECRET;
});

describe('razorpayGateway.verifyPaymentSignature', () => {
  it('accepts the correct HMAC and rejects tampering', () => {
    const good = sign('order_1', 'pay_1');
    expect(gateway.verifyPaymentSignature('order_1', 'pay_1', good)).toBe(true);
    expect(gateway.verifyPaymentSignature('order_1', 'pay_2', good)).toBe(false);
    expect(gateway.verifyPaymentSignature('order_1', 'pay_1', good.slice(0, -2))).toBe(false);
    expect(gateway.verifyPaymentSignature('order_1', 'pay_1', undefined)).toBe(false);
  });

  it('converts rupees to integer paise without float drift', () => {
    expect(gateway.toPaise(245.5)).toBe(24550);
    expect(gateway.toPaise(0.1 + 0.2)).toBe(30);
  });
});

describe('vendor visibility', () => {
  it('treats unpaid PREPAID orders as awaiting payment, never COD', () => {
    expect(svc.isAwaitingPayment(makeOrder())).toBe(true);
    expect(svc.isAwaitingPayment(makeOrder({ paymentStatus: 'FAILED' }))).toBe(true);
    expect(svc.isAwaitingPayment(makeOrder({ paymentStatus: 'PAID' }))).toBe(false);
    expect(svc.isAwaitingPayment(makeOrder({ paymentMode: 'COD' }))).toBe(false);
    expect(svc.EXCLUDE_AWAITING_PAYMENT.$nor[0]).toEqual({
      paymentMode: 'PREPAID', paymentStatus: { $in: ['PENDING', 'FAILED'] }
    });
  });
});

describe('createGatewayOrder', () => {
  it('rejects COD orders and other patients', async () => {
    PharmacyOrder.findById.mockResolvedValue(makeOrder({ paymentMode: 'COD' }));
    await expect(svc.createGatewayOrder(ORDER_ID, PATIENT_ID)).rejects.toMatchObject({ statusCode: 409 });

    PharmacyOrder.findById.mockResolvedValue(makeOrder({ patient: 'someone-else' }));
    await expect(svc.createGatewayOrder(ORDER_ID, PATIENT_ID)).rejects.toMatchObject({ statusCode: 403 });
    expect(mockRazorpay.orders.create).not.toHaveBeenCalled();
  });

  it('rejects an expired payment window', async () => {
    PharmacyOrder.findById.mockResolvedValue(makeOrder({ paymentExpiresAt: new Date(Date.now() - 1000) }));
    await expect(svc.createGatewayOrder(ORDER_ID, PATIENT_ID)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('creates a paise-denominated gateway order with a compare-and-set attach', async () => {
    const order = makeOrder();
    PharmacyOrder.findById.mockResolvedValue(order);
    mockRazorpay.orders.create.mockResolvedValue({ id: 'order_new', amount: 24550, currency: 'INR' });
    PharmacyOrder.findOneAndUpdate.mockResolvedValue({ ...order, razorpay: { orderId: 'order_new' } });

    const out = await svc.createGatewayOrder(ORDER_ID, PATIENT_ID);

    expect(mockRazorpay.orders.create).toHaveBeenCalledWith(expect.objectContaining({
      amount: 24550, currency: 'INR', receipt: 'MRTEST1234'
    }));
    expect(PharmacyOrder.findOneAndUpdate.mock.calls[0][0]).toMatchObject({ 'razorpay.orderId': null });
    expect(out).toMatchObject({ razorpayKeyId: 'rzp_test_key', gatewayOrder: { id: 'order_new', amount: 24550 } });
  });

  it('reuses an open gateway order instead of creating another', async () => {
    PharmacyOrder.findById.mockResolvedValue(makeOrder({ razorpay: { orderId: 'order_old' } }));
    mockRazorpay.orders.fetch.mockResolvedValue({ id: 'order_old', status: 'created', amount: 24550, currency: 'INR' });

    const out = await svc.createGatewayOrder(ORDER_ID, PATIENT_ID);
    expect(out.gatewayOrder.id).toBe('order_old');
    expect(mockRazorpay.orders.create).not.toHaveBeenCalled();
  });

  it('never re-charges when the gateway order was already paid', async () => {
    const order = makeOrder({ razorpay: { orderId: 'order_old' } });
    PharmacyOrder.findById.mockResolvedValue(order);
    mockRazorpay.orders.fetch.mockResolvedValue({ id: 'order_old', status: 'paid', amount: 24550, currency: 'INR' });
    mockRazorpay.orders.fetchPayments.mockResolvedValue({
      items: [{ id: 'pay_1', order_id: 'order_old', amount: 24550, currency: 'INR', status: 'captured' }]
    });
    PharmacyOrder.findOneAndUpdate.mockResolvedValue({ ...order, paymentStatus: 'PAID' });

    await expect(svc.createGatewayOrder(ORDER_ID, PATIENT_ID)).rejects.toMatchObject({ statusCode: 409 });
    expect(mockRazorpay.orders.create).not.toHaveBeenCalled();
    expect(PharmacyOrder.findOneAndUpdate.mock.calls[0][1].$set.paymentStatus).toBe('PAID');
  });
});

describe('verifyPayment', () => {
  const body = (paymentId = 'pay_1', orderId = 'order_1') => ({
    razorpayOrderId: orderId, razorpayPaymentId: paymentId, razorpaySignature: sign(orderId, paymentId)
  });

  it('rejects a gateway order id that is not attached to this order', async () => {
    PharmacyOrder.findById.mockResolvedValue(makeOrder({ razorpay: { orderId: 'order_1' } }));
    await expect(svc.verifyPayment(ORDER_ID, PATIENT_ID, body('pay_1', 'order_other')))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(mockRazorpay.payments.fetch).not.toHaveBeenCalled();
  });

  it('rejects a forged signature before calling the gateway', async () => {
    PharmacyOrder.findById.mockResolvedValue(makeOrder({ razorpay: { orderId: 'order_1' } }));
    await expect(svc.verifyPayment(ORDER_ID, PATIENT_ID, { ...body(), razorpaySignature: 'a'.repeat(64) }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(mockRazorpay.payments.fetch).not.toHaveBeenCalled();
    expect(PharmacyOrder.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects an underpayment even with a valid signature', async () => {
    PharmacyOrder.findById.mockResolvedValue(makeOrder({ razorpay: { orderId: 'order_1' } }));
    mockRazorpay.payments.fetch.mockResolvedValue({
      id: 'pay_1', order_id: 'order_1', amount: 100, currency: 'INR', status: 'captured'
    });
    await expect(svc.verifyPayment(ORDER_ID, PATIENT_ID, body())).rejects.toMatchObject({ statusCode: 400 });
    expect(logger.logSecurity).toHaveBeenCalledWith('pharmacy_payment_mismatch', expect.objectContaining({ mismatched: ['amount'] }));
    expect(PharmacyOrder.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('marks a matching captured payment PAID via compare-and-set', async () => {
    const order = makeOrder({ razorpay: { orderId: 'order_1' } });
    PharmacyOrder.findById.mockResolvedValue(order);
    mockRazorpay.payments.fetch.mockResolvedValue({
      id: 'pay_1', order_id: 'order_1', amount: 24550, currency: 'INR', status: 'captured'
    });
    PharmacyOrder.findOneAndUpdate.mockResolvedValue({ ...order, paymentStatus: 'PAID' });

    const result = await svc.verifyPayment(ORDER_ID, PATIENT_ID, body());
    const [filter, update] = PharmacyOrder.findOneAndUpdate.mock.calls[0];
    expect(filter.paymentStatus).toEqual({ $in: ['PENDING', 'FAILED'] });
    expect(update.$set).toMatchObject({ paymentStatus: 'PAID', 'razorpay.paymentId': 'pay_1' });
    expect(result.paymentStatus).toBe('PAID');
    expect(mockRazorpay.payments.capture).not.toHaveBeenCalled();
  });

  it('captures an authorized payment before marking it PAID', async () => {
    const order = makeOrder({ razorpay: { orderId: 'order_1' } });
    PharmacyOrder.findById.mockResolvedValue(order);
    mockRazorpay.payments.fetch.mockResolvedValue({
      id: 'pay_1', order_id: 'order_1', amount: 24550, currency: 'INR', status: 'authorized'
    });
    mockRazorpay.payments.capture.mockResolvedValue({ id: 'pay_1', status: 'captured' });
    PharmacyOrder.findOneAndUpdate.mockResolvedValue({ ...order, paymentStatus: 'PAID' });

    await svc.verifyPayment(ORDER_ID, PATIENT_ID, body());
    expect(mockRazorpay.payments.capture).toHaveBeenCalledWith('pay_1', 24550, 'INR');
  });

  it('refunds a payment that lands after the order was cancelled', async () => {
    const order = makeOrder({ razorpay: { orderId: 'order_1' } });
    PharmacyOrder.findById.mockResolvedValue(order);
    mockRazorpay.payments.fetch.mockResolvedValue({
      id: 'pay_1', order_id: 'order_1', amount: 24550, currency: 'INR', status: 'captured'
    });
    const paidButCancelled = { ...order, status: 'CANCELLED', paymentStatus: 'PAID', razorpay: { orderId: 'order_1', paymentId: 'pay_1' } };
    PharmacyOrder.findOneAndUpdate
      .mockResolvedValueOnce(paidButCancelled) // mark PAID
      .mockResolvedValueOnce({ ...paidButCancelled, paymentStatus: 'REFUND_PENDING' }) // refund lock
      .mockResolvedValueOnce({ ...paidButCancelled, paymentStatus: 'REFUNDED' }); // refund done
    mockRazorpay.payments.refund.mockResolvedValue({ id: 'rfnd_1' });

    const result = await svc.verifyPayment(ORDER_ID, PATIENT_ID, body());
    expect(mockRazorpay.payments.refund).toHaveBeenCalledWith('pay_1', expect.objectContaining({ amount: 24550 }));
    expect(result.paymentStatus).toBe('REFUNDED');
  });
});

describe('refundOrderPayment', () => {
  it('is a no-op for COD / unpaid orders', async () => {
    await svc.refundOrderPayment(makeOrder({ paymentMode: 'COD', paymentStatus: 'PAID' }));
    await svc.refundOrderPayment(makeOrder());
    expect(PharmacyOrder.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('skips the gateway when another caller already holds the refund lock', async () => {
    PharmacyOrder.findOneAndUpdate.mockResolvedValue(null);
    PharmacyOrder.findById.mockResolvedValue(makeOrder({ paymentStatus: 'REFUND_PENDING' }));
    await svc.refundOrderPayment(makeOrder({ paymentStatus: 'PAID', razorpay: { paymentId: 'pay_1' } }));
    expect(mockRazorpay.payments.refund).not.toHaveBeenCalled();
  });

  it('leaves REFUND_PENDING and does not throw when the gateway fails', async () => {
    const locked = makeOrder({ paymentStatus: 'REFUND_PENDING', razorpay: { paymentId: 'pay_1' } });
    PharmacyOrder.findOneAndUpdate.mockResolvedValue(locked);
    PharmacyOrder.updateOne.mockResolvedValue({});
    mockRazorpay.payments.refund.mockRejectedValue(new Error('gateway down'));

    const result = await svc.refundOrderPayment(makeOrder({ paymentStatus: 'PAID', razorpay: { paymentId: 'pay_1' } }));
    expect(result.paymentStatus).toBe('REFUND_PENDING');
    expect(PharmacyOrder.updateOne.mock.calls[0][1].$set['razorpay.refundError']).toBe('gateway down');
  });
});

describe('expireUnpaidOrders', () => {
  const findReturning = (orders) => PharmacyOrder.find.mockReturnValue({ limit: jest.fn().mockResolvedValue(orders) });

  it('cancels and restocks orders that were never paid', async () => {
    const order = makeOrder({ paymentExpiresAt: new Date(Date.now() - 1000) });
    findReturning([order]);
    PharmacyOrder.findOneAndUpdate.mockResolvedValue({ ...order, status: 'CANCELLED' });

    const out = await svc.expireUnpaidOrders();
    expect(out).toEqual({ expired: 1, reconciled: 0 });
    expect(PharmacyOrder.findOneAndUpdate.mock.calls[0][1].$set).toMatchObject({ status: 'CANCELLED', cancelledBy: 'SYSTEM' });
    expect(restockOrder).toHaveBeenCalledTimes(1);
  });

  it('applies a payment found on the gateway instead of cancelling', async () => {
    const order = makeOrder({ razorpay: { orderId: 'order_1' } });
    findReturning([order]);
    mockRazorpay.orders.fetch.mockResolvedValue({ id: 'order_1', status: 'paid' });
    mockRazorpay.orders.fetchPayments.mockResolvedValue({
      items: [{ id: 'pay_1', order_id: 'order_1', amount: 24550, currency: 'INR', status: 'captured' }]
    });
    PharmacyOrder.findOneAndUpdate.mockResolvedValue({ ...order, paymentStatus: 'PAID' });

    const out = await svc.expireUnpaidOrders();
    expect(out).toEqual({ expired: 0, reconciled: 1 });
    expect(restockOrder).not.toHaveBeenCalled();
  });

  it('skips (does not cancel) when the gateway cannot be reached', async () => {
    findReturning([makeOrder({ razorpay: { orderId: 'order_1' } })]);
    mockRazorpay.orders.fetch.mockRejectedValue(new Error('ETIMEDOUT'));

    const out = await svc.expireUnpaidOrders();
    expect(out).toEqual({ expired: 0, reconciled: 0 });
    expect(PharmacyOrder.findOneAndUpdate).not.toHaveBeenCalled();
    expect(restockOrder).not.toHaveBeenCalled();
  });
});
