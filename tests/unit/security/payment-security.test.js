/**
 * Payment Security Tests
 *
 * Covers Phase 1 fixes:
 * - PAY-001: Amount re-verification after Razorpay signature verification
 * - PAY-002: Idempotency check prevents duplicate orders
 * - PAY-003: Refund processed with atomic locking + rollback
 * - SEC-006: No fallback Razorpay credentials
 */

const crypto = require('crypto');

process.env.RAZORPAY_KEY_ID = 'rzp_test_fake_key_id';
process.env.RAZORPAY_KEY_SECRET = 'fake_razorpay_secret_key_for_tests';

const mockRazorpayInstance = {
  orders: {
    create: jest.fn(),
    fetch: jest.fn()
  },
  payments: {
    fetch: jest.fn(),
    refund: jest.fn()
  }
};

jest.mock('razorpay', () => jest.fn().mockImplementation(() => mockRazorpayInstance));
jest.mock('../../../models/nurseBooking');
jest.mock('../../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  logSecurity: jest.fn()
}));

const loadPaymentHarness = () => {
  let harness;

  jest.isolateModules(() => {
    harness = {
      Razorpay: require('razorpay'),
      Booking: require('../../../models/nurseBooking'),
      logger: require('../../../utils/logger'),
      paymentService: require('../../../services/paymentService')
    };
  });

  return harness;
};

describe('Payment Security Tests', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockRazorpayInstance.orders.create.mockReset();
    mockRazorpayInstance.orders.fetch.mockReset();
    mockRazorpayInstance.payments.fetch.mockReset();
    mockRazorpayInstance.payments.refund.mockReset();
  });

  describe('SEC-006: No Fallback Razorpay Credentials', () => {
    it('should not contain hardcoded test credentials in source', () => {
      const fs = require('fs');
      const source = fs.readFileSync(
        require.resolve('../../../services/paymentService'),
        'utf8'
      );

      expect(source).not.toContain('rzp_test_YOUR_KEY_HERE');
      expect(source).not.toContain('YOUR_KEY_SECRET');
      expect(source).toContain('process.env.RAZORPAY_KEY_ID');
      expect(source).toContain('process.env.RAZORPAY_KEY_SECRET');
    });

    it('should not crash on import if RAZORPAY credentials are missing', () => {
      const originalKeyId = process.env.RAZORPAY_KEY_ID;
      const originalSecret = process.env.RAZORPAY_KEY_SECRET;

      delete process.env.RAZORPAY_KEY_ID;
      delete process.env.RAZORPAY_KEY_SECRET;

      let isolatedPaymentService;
      expect(() => {
        ({ paymentService: isolatedPaymentService } = loadPaymentHarness());
      }).not.toThrow();

      expect(isolatedPaymentService).toBeTruthy();

      process.env.RAZORPAY_KEY_ID = originalKeyId;
      process.env.RAZORPAY_KEY_SECRET = originalSecret;
    });

    it('should reject payment operations when RAZORPAY credentials are missing', async () => {
      const originalKeyId = process.env.RAZORPAY_KEY_ID;
      const originalSecret = process.env.RAZORPAY_KEY_SECRET;

      delete process.env.RAZORPAY_KEY_ID;
      delete process.env.RAZORPAY_KEY_SECRET;

      const { paymentService } = loadPaymentHarness();

      await expect(
        paymentService.createOrder('booking123', 'user123')
      ).rejects.toMatchObject({
        statusCode: 503,
        message: expect.stringContaining('Missing Razorpay credentials')
      });

      process.env.RAZORPAY_KEY_ID = originalKeyId;
      process.env.RAZORPAY_KEY_SECRET = originalSecret;
    });
  });

  describe('PAY-001: Amount Re-verification', () => {
    const buildBooking = (overrides = {}) => ({
      _id: 'booking123',
      patient: 'user123',
      pricing: { payableAmount: 500 },
      payment: {
        orderId: 'order_123',
        status: 'PENDING'
      },
      status: 'REQUESTED',
      save: jest.fn().mockResolvedValue(true),
      ...overrides
    });

    it('should reject payment when Razorpay amount does not match booking amount', async () => {
      const { paymentService, Booking } = loadPaymentHarness();
      const orderId = 'order_123';
      const paymentId = 'pay_123';
      const signature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const booking = buildBooking();
      Booking.findById = jest.fn().mockResolvedValue(booking);
      mockRazorpayInstance.payments.fetch.mockResolvedValue({
        amount: 10000,
        currency: 'INR'
      });

      await expect(
        paymentService.verifyPayment({
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature,
          bookingId: 'booking123'
        }, 'user123')
      ).rejects.toMatchObject({
        message: expect.stringContaining('amount does not match')
      });

      expect(booking.save).toHaveBeenCalled();
    });

    it('should reject payment when currency does not match', async () => {
      const { paymentService, Booking } = loadPaymentHarness();
      const orderId = 'order_123';
      const paymentId = 'pay_123';
      const signature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const booking = buildBooking();
      Booking.findById = jest.fn().mockResolvedValue(booking);
      mockRazorpayInstance.payments.fetch.mockResolvedValue({
        amount: 50000,
        currency: 'USD'
      });

      await expect(
        paymentService.verifyPayment({
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature,
          bookingId: 'booking123'
        }, 'user123')
      ).rejects.toMatchObject({
        message: expect.stringContaining('currency mismatch')
      });
    });

    it('should reject payment with invalid signature', async () => {
      const { paymentService, Booking } = loadPaymentHarness();
      Booking.findById = jest.fn().mockResolvedValue(buildBooking());

      await expect(
        paymentService.verifyPayment({
          razorpay_order_id: 'order_123',
          razorpay_payment_id: 'pay_123',
          razorpay_signature: 'tampered_signature',
          bookingId: 'booking123'
        }, 'user123')
      ).rejects.toMatchObject({
        message: expect.stringContaining('verification failed')
      });
    });

    it('should reject payment when order ID does not match stored order', async () => {
      const { paymentService, Booking } = loadPaymentHarness();
      Booking.findById = jest.fn().mockResolvedValue(buildBooking({
        payment: { orderId: 'order_REAL', status: 'PENDING' }
      }));

      await expect(
        paymentService.verifyPayment({
          razorpay_order_id: 'order_FAKE',
          razorpay_payment_id: 'pay_123',
          razorpay_signature: 'some_sig',
          bookingId: 'booking123'
        }, 'user123')
      ).rejects.toMatchObject({
        message: expect.stringContaining('does not match')
      });
    });
  });

  describe('PAY-002: Idempotency - Duplicate Order Prevention', () => {
    it('should reuse existing pending order instead of creating duplicate', async () => {
      const { paymentService, Booking } = loadPaymentHarness();
      const existingOrder = {
        id: 'order_existing',
        status: 'created',
        amount: 50000,
        currency: 'INR',
        receipt: 'booking_123'
      };

      const mockBooking = {
        _id: 'booking123',
        patient: 'user123',
        pricing: { payableAmount: 500 },
        payment: { orderId: 'order_existing', status: 'PENDING' },
        serviceType: 'NURSE',
        save: jest.fn()
      };

      Booking.findById = jest.fn().mockResolvedValue(mockBooking);
      Booking.findOneAndUpdate = jest.fn();
      mockRazorpayInstance.orders.fetch.mockResolvedValue(existingOrder);

      const result = await paymentService.createOrder('booking123', 'user123');

      expect(result.order.id).toBe('order_existing');
      expect(mockRazorpayInstance.orders.create).not.toHaveBeenCalled();
      expect(Booking.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('should block concurrent order creation with atomic lock', async () => {
      const { paymentService, Booking } = loadPaymentHarness();
      const mockBooking = {
        _id: 'booking123',
        patient: 'user123',
        pricing: { payableAmount: 500 },
        payment: null,
        serviceType: 'NURSE'
      };

      Booking.findById = jest.fn().mockResolvedValue(mockBooking);
      Booking.findOneAndUpdate = jest.fn().mockResolvedValue(null);

      await expect(
        paymentService.createOrder('booking123', 'user123')
      ).rejects.toMatchObject({
        message: expect.stringContaining('already being created')
      });
    });

    it('should prevent order creation for already paid booking', async () => {
      const { paymentService, Booking } = loadPaymentHarness();
      Booking.findById = jest.fn().mockResolvedValue({
        _id: 'booking123',
        patient: 'user123',
        pricing: { payableAmount: 500 },
        payment: { status: 'PAID' }
      });

      await expect(
        paymentService.createOrder('booking123', 'user123')
      ).rejects.toMatchObject({
        message: expect.stringContaining('already paid')
      });
    });
  });

  describe('PAY-003: Refund Atomic Locking + Rollback', () => {
    it('should atomically lock booking before processing refund', async () => {
      const { paymentService, Booking } = loadPaymentHarness();
      const mockBooking = {
        _id: 'booking123',
        payment: { paymentId: 'pay_123', status: 'PAID' },
        pricing: { payableAmount: 500 }
      };

      Booking.findById = jest.fn().mockResolvedValue(mockBooking);
      Booking.findOneAndUpdate = jest.fn().mockResolvedValueOnce({
        ...mockBooking,
        payment: { ...mockBooking.payment, status: 'REFUND_PENDING' }
      });
      Booking.findByIdAndUpdate = jest.fn().mockResolvedValue({
        ...mockBooking,
        payment: { ...mockBooking.payment, status: 'REFUNDED', refundId: 'refund_123' }
      });

      mockRazorpayInstance.payments.refund.mockResolvedValue({
        id: 'refund_123',
        status: 'processed'
      });

      await paymentService.processRefund('booking123');

      expect(Booking.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: 'booking123',
          'payment.status': 'PAID'
        }),
        expect.objectContaining({
          $set: expect.objectContaining({
            'payment.status': 'REFUND_PENDING'
          })
        }),
        expect.any(Object)
      );
    });

    it('should rollback to PAID if Razorpay refund fails', async () => {
      const { paymentService, Booking } = loadPaymentHarness();
      const mockBooking = {
        _id: 'booking123',
        payment: { paymentId: 'pay_123', status: 'PAID' },
        pricing: { payableAmount: 500 }
      };

      Booking.findById = jest.fn().mockResolvedValue(mockBooking);
      Booking.findOneAndUpdate = jest.fn().mockResolvedValueOnce({
        ...mockBooking,
        payment: { paymentId: 'pay_123', status: 'REFUND_PENDING' }
      });
      Booking.findByIdAndUpdate = jest.fn().mockResolvedValue(true);

      mockRazorpayInstance.payments.refund.mockRejectedValue(new Error('Razorpay gateway error'));

      await expect(
        paymentService.processRefund('booking123')
      ).rejects.toMatchObject({
        message: expect.stringContaining('Refund failed')
      });

      expect(Booking.findByIdAndUpdate).toHaveBeenCalledWith(
        'booking123',
        expect.objectContaining({
          $set: { 'payment.status': 'PAID' }
        })
      );
    });

    it('should reject double refund for already refunded booking', async () => {
      const { paymentService, Booking } = loadPaymentHarness();
      Booking.findById = jest.fn().mockResolvedValue({
        _id: 'booking123',
        payment: { paymentId: 'pay_123', status: 'REFUNDED' },
        pricing: { payableAmount: 500 }
      });
      Booking.findOneAndUpdate = jest.fn().mockResolvedValue(null);

      await expect(
        paymentService.processRefund('booking123')
      ).rejects.toMatchObject({
        message: expect.stringContaining('already refunded')
      });
    });

    it('should reject concurrent refund requests', async () => {
      const { paymentService, Booking } = loadPaymentHarness();
      Booking.findById = jest.fn().mockResolvedValue({
        _id: 'booking123',
        payment: { paymentId: 'pay_123', status: 'REFUND_PENDING' },
        pricing: { payableAmount: 500 }
      });
      Booking.findOneAndUpdate = jest.fn().mockResolvedValue(null);

      await expect(
        paymentService.processRefund('booking123')
      ).rejects.toMatchObject({
        message: expect.stringContaining('already being processed')
      });
    });
  });

  describe('Booking Ownership Verification', () => {
    it('should reject payment operations by non-owner', async () => {
      const { paymentService, Booking } = loadPaymentHarness();
      Booking.findById = jest.fn().mockResolvedValue({
        _id: 'booking123',
        patient: 'owner_user',
        pricing: { payableAmount: 500 },
        payment: { status: 'PENDING' }
      });

      await expect(
        paymentService.createOrder('booking123', 'attacker_user')
      ).rejects.toMatchObject({
        statusCode: 403,
        message: expect.stringContaining('Unauthorized')
      });
    });

    it('should reject payment failure handling by non-owner', async () => {
      const { paymentService, Booking } = loadPaymentHarness();
      const booking = {
        _id: 'booking123',
        patient: { toString: () => 'owner_user' },
        payment: { status: 'PENDING', failureReason: null },
        save: jest.fn().mockResolvedValue(true)
      };

      Booking.findById = jest.fn().mockResolvedValue(booking);

      await expect(
        paymentService.handlePaymentFailure(
          'booking123',
          { description: 'Gateway timeout' },
          'attacker_user'
        )
      ).rejects.toMatchObject({
        statusCode: 403,
        message: expect.stringContaining('Unauthorized')
      });

      expect(booking.save).not.toHaveBeenCalled();
    });
  });
});
