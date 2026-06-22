/**
 * Payment Service
 *
 * Business logic layer for payment operations
 * Handles Razorpay integration, order creation, and payment verification
 */

const crypto = require('crypto');
const Booking = require('../models/nurseBooking');
const RefundOutbox = require('../models/refundOutbox');
const logger = require('../utils/logger');
const monitoring = require('../utils/monitoring');
const { VALIDATED_QUERY_UPDATE_OPTIONS } = require('../utils/queryUpdateOptions');
const { normalizeObjectId } = require('../utils/safeMongo');
const { HTTP_STATUS } = require('../constants');

let razorpayClient = null;

const REFUND_OUTBOX_ACTIVE_STATUSES = ['GATEWAY_CONFIRMED', 'RETRY_PENDING'];
const REFUND_OUTBOX_DEFAULT_INTERVAL_MS = 60 * 1000;
const REFUND_OUTBOX_LOCK_TIMEOUT_MS = 15 * 60 * 1000;
const REFUND_OUTBOX_MAX_DELAY_MS = 60 * 60 * 1000;

function getRefundOutboxDelayMs(attemptCount) {
  const baseDelayMs = Number(process.env.REFUND_OUTBOX_RETRY_BASE_MS || 60 * 1000);
  return Math.min(baseDelayMs * Math.pow(2, Math.max(attemptCount - 1, 0)), REFUND_OUTBOX_MAX_DELAY_MS);
}

function getRazorpayClient() {
  if (razorpayClient) return razorpayClient;

  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    logger.error('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET environment variables are required for payment operations');
    throw {
      statusCode: HTTP_STATUS.SERVICE_UNAVAILABLE,
      message: 'Missing Razorpay credentials. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.'
    };
  }

  let Razorpay;
  try {
    Razorpay = require('razorpay');
  } catch (err) {
    logger.error('razorpay package is not installed', { error: err.message });
    throw {
      statusCode: HTTP_STATUS.SERVICE_UNAVAILABLE,
      message: 'Payment service unavailable. Required package not installed.'
    };
  }

  razorpayClient = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
  return razorpayClient;
}

class PaymentService {
  constructor() {
    this.refundOutboxWorker = null;
  }

  /**
   * Create a Razorpay order for booking
   * @param {String} bookingId - Booking ID
   * @param {String} userId - User ID (patient)
   * @returns {Promise<Object>} Order details
   */
  async createOrder(bookingId, userId) {
    const razorpay = getRazorpayClient();
    const safeBookingId = normalizeObjectId(bookingId, 'booking id');
    const safeUserId = normalizeObjectId(userId, 'user id');
    const booking = await Booking.findById(safeBookingId);

    if (!booking) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'Booking not found'
      };
    }

    // Verify booking belongs to requesting patient
    if (booking.patient.toString() !== safeUserId.toString()) {
      throw {
        statusCode: HTTP_STATUS.FORBIDDEN,
        message: 'Unauthorized access to booking'
      };
    }

    // Check if already paid
    if (booking.payment?.status === 'PAID') {
      throw {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: 'Booking already paid'
      };
    }

    // Idempotency: if a pending order already exists, reuse it
    if (booking.payment?.orderId && booking.payment.status === 'PENDING') {
      try {
        const existingOrder = await razorpay.orders.fetch(booking.payment.orderId);

        // Reuse if the order is still open and amount matches
        if (existingOrder.status === 'created' &&
            existingOrder.amount === Math.round(booking.pricing.payableAmount * 100)) {
          logger.info('Reusing existing pending order', {
            bookingId,
            orderId: existingOrder.id
          });

          return {
            order: {
              id: existingOrder.id,
              amount: existingOrder.amount,
              currency: existingOrder.currency,
              receipt: existingOrder.receipt
            },
            booking: {
              id: booking._id,
              serviceType: booking.serviceType,
              amount: booking.pricing.payableAmount
            },
            razorpayKey: process.env.RAZORPAY_KEY_ID
          };
        }
        // If order is paid/attempted on Razorpay side but our DB missed it, fail safe
        if (existingOrder.status === 'paid') {
          logger.logSecurity('order_already_paid_on_razorpay', {
            bookingId,
            orderId: existingOrder.id
          });

          throw {
            statusCode: HTTP_STATUS.CONFLICT,
            message: 'A payment is already processing for this booking'
          };
        }
      } catch (err) {
        // If it's our own thrown error, rethrow it
        if (err.statusCode) throw err;
        // Razorpay fetch failed (order expired/invalid) - proceed to create new order
        logger.warn('Failed to fetch existing order, creating new one', {
          bookingId,
          orderId: booking.payment.orderId,
          error: err.message
        });
      }
    }

    // Atomically lock: only one concurrent request can create an order
    const lockedBooking = await Booking.findOneAndUpdate(
      {
        _id: safeBookingId,
        $or: [
          { 'payment.orderId': { $exists: false } },
          { 'payment.orderId': null },
          { payment: null }
        ]
      },
      { $set: { 'payment.status': 'PENDING' } },
      { new: true }
    );

    if (!lockedBooking) {
      throw {
        statusCode: HTTP_STATUS.CONFLICT,
        message: 'An order is already being created for this booking'
      };
    }

    // Create Razorpay order
    const options = {
      amount: Math.round(booking.pricing.payableAmount * 100), // Amount in paise
      currency: 'INR',
      receipt: `booking_${safeBookingId}`,
      notes: {
        bookingId: String(safeBookingId),
        patientId: String(safeUserId),
        serviceType: booking.serviceType
      }
    };

    const order = await razorpay.orders.create(options);

    // Atomically update booking with order details
    await Booking.findByIdAndUpdate(safeBookingId, {
      $set: {
        'payment.orderId': order.id,
        'payment.amount': booking.pricing.payableAmount,
        'payment.currency': 'INR',
        'payment.status': 'PENDING',
        'payment.createdAt': new Date()
      }
    }, VALIDATED_QUERY_UPDATE_OPTIONS);

    logger.info('Payment order created', {
      bookingId,
      orderId: order.id,
      amount: booking.pricing.payableAmount
    });

    return {
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt
      },
      booking: {
        id: booking._id,
        serviceType: booking.serviceType,
        amount: booking.pricing.payableAmount
      },
      razorpayKey: process.env.RAZORPAY_KEY_ID
    };
  }

  /**
   * Verify Razorpay payment signature
   * @param {Object} paymentData - Payment verification data
   * @param {String} userId - User ID (patient)
   * @returns {Promise<Object>} Verification result
   */
  async verifyPayment(paymentData, userId) {
    const razorpay = getRazorpayClient();
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      bookingId
    } = paymentData;

    const safeBookingId = normalizeObjectId(bookingId, 'booking id');
    const safeUserId = normalizeObjectId(userId, 'user id');
    const booking = await Booking.findById(safeBookingId);

    if (!booking) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'Booking not found'
      };
    }

    // Verify booking belongs to requesting patient
    if (booking.patient.toString() !== safeUserId.toString()) {
      throw {
        statusCode: HTTP_STATUS.FORBIDDEN,
        message: 'Unauthorized access to booking'
      };
    }

    // Verify order ID matches the one stored during createOrder
    if (!booking.payment?.orderId || booking.payment.orderId !== razorpay_order_id) {
      logger.logSecurity('payment_order_id_mismatch', {
        bookingId,
        expected: booking.payment?.orderId,
        received: razorpay_order_id
      });

      throw {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: 'Order ID does not match booking'
      };
    }

    // Verify signature
    const sign = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(sign.toString())
      .digest('hex');

    if (razorpay_signature !== expectedSign) {
      // Payment verification failed
      booking.payment.status = 'FAILED';
      await booking.save();

      logger.logSecurity('payment_verification_failed', {
        bookingId,
        orderId: razorpay_order_id
      });

      throw {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: 'Payment verification failed'
      };
    }

    // Re-verify amount from Razorpay to prevent underpayment attacks
    const razorpayPayment = await razorpay.payments.fetch(razorpay_payment_id);
    const expectedAmountPaise = Math.round(booking.pricing.payableAmount * 100);

    if (razorpayPayment.amount !== expectedAmountPaise) {
      booking.payment.status = 'FAILED';
      await booking.save();

      logger.logSecurity('payment_amount_mismatch', {
        bookingId,
        expectedPaise: expectedAmountPaise,
        receivedPaise: razorpayPayment.amount,
        paymentId: razorpay_payment_id
      });

      throw {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: 'Payment amount does not match booking amount'
      };
    }

    if (razorpayPayment.currency !== 'INR') {
      booking.payment.status = 'FAILED';
      await booking.save();

      logger.logSecurity('payment_currency_mismatch', {
        bookingId,
        expectedCurrency: 'INR',
        receivedCurrency: razorpayPayment.currency,
        paymentId: razorpay_payment_id
      });

      throw {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: 'Payment currency mismatch'
      };
    }

    // Payment verified successfully
    booking.payment.paymentId = razorpay_payment_id;
    booking.payment.status = 'PAID';
    booking.payment.paidAt = new Date();

    // Update booking status from REQUESTED to SEARCHING
    if (booking.status === 'REQUESTED') {
      booking.status = 'SEARCHING';
    }

    await booking.save();

    logger.info('Payment verified successfully', {
      bookingId,
      paymentId: razorpay_payment_id,
      amount: booking.pricing.payableAmount
    });

    return {
      booking: {
        id: booking._id,
        status: booking.status,
        paymentStatus: booking.payment.status
      }
    };
  }

  /**
   * Handle payment failure
   * @param {String} bookingId - Booking ID
   * @param {Object} error - Error details
   * @param {String} userId - User ID (patient)
   * @returns {Promise<Object>} Updated booking
   */
  async handlePaymentFailure(bookingId, error, userId) {
    const safeBookingId = normalizeObjectId(bookingId, 'booking id');
    const safeUserId = normalizeObjectId(userId, 'user id');
    const booking = await Booking.findById(safeBookingId);

    if (!booking) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'Booking not found'
      };
    }

    // Verify booking belongs to requesting patient
    if (booking.patient.toString() !== safeUserId.toString()) {
      throw {
        statusCode: HTTP_STATUS.FORBIDDEN,
        message: 'Unauthorized access to booking'
      };
    }

    // Update payment status
    booking.payment.status = 'FAILED';
    booking.payment.failureReason = error?.description || 'Payment failed';
    await booking.save();

    logger.warn('Payment failed', {
      bookingId,
      reason: error?.description || 'Unknown'
    });

    return {
      booking: {
        id: booking._id,
        paymentStatus: booking.payment.status
      }
    };
  }

  /**
   * Get payment status for a booking
   * @param {String} bookingId - Booking ID
   * @param {String} userId - User ID (patient)
   * @returns {Promise<Object>} Payment status
   */
  async getPaymentStatus(bookingId, userId) {
    const safeBookingId = normalizeObjectId(bookingId, 'booking id');
    const safeUserId = normalizeObjectId(userId, 'user id');
    const booking = await Booking.findById(safeBookingId);

    if (!booking) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'Booking not found'
      };
    }

    // Verify booking belongs to requesting patient
    if (booking.patient.toString() !== safeUserId.toString()) {
      throw {
        statusCode: HTTP_STATUS.FORBIDDEN,
        message: 'Unauthorized access to booking'
      };
    }

    return {
      payment: {
        status: booking.payment.status,
        amount: booking.pricing.payableAmount,
        orderId: booking.payment?.orderId,
        paymentId: booking.payment?.paymentId,
        paidAt: booking.payment?.paidAt
      }
    };
  }

  async scheduleRefundOutboxRetry(outbox, error) {
    const currentAttemptCount = outbox.attemptCount || 0;
    const nextAttemptCount = currentAttemptCount + 1;
    const maxAttempts = outbox.maxAttempts || 10;
    const isDeadLetter = nextAttemptCount >= maxAttempts;
    const nextAttemptAt = new Date(Date.now() + getRefundOutboxDelayMs(nextAttemptCount));

    await RefundOutbox.updateOne(
      { _id: outbox._id },
      {
        $set: {
          status: isDeadLetter ? 'DEAD_LETTER' : 'RETRY_PENDING',
          attemptCount: nextAttemptCount,
          nextAttemptAt,
          lastError: error.message,
          lockedAt: null
        }
      }
    );

    logger.error(isDeadLetter ? 'Refund outbox moved to dead letter' : 'Refund outbox scheduled for retry', {
      refundOutboxId: outbox._id,
      bookingId: outbox.booking,
      paymentId: outbox.paymentId,
      refundId: outbox.gatewayRefundId,
      attemptCount: nextAttemptCount,
      maxAttempts,
      nextAttemptAt,
      error: error.message
    });

    if (isDeadLetter) {
      monitoring.triggerAlert('refund_outbox_dead_letter', 1, {
        refundOutboxId: outbox._id,
        bookingId: outbox.booking,
        paymentId: outbox.paymentId,
        refundId: outbox.gatewayRefundId,
        amount: outbox.amount
      });
    }
  }

  async commitRefundOutbox(outbox) {
    const refundedAt = new Date();
    const refundUpdate = {
      $set: {
        'payment.refundId': outbox.gatewayRefundId,
        'payment.refundedAt': refundedAt,
        'payment.refundAmount': outbox.amount,
        'payment.status': 'REFUNDED'
      }
    };

    try {
      const updatedBooking = await Booking.findOneAndUpdate(
        {
          _id: outbox.booking,
          'payment.paymentId': outbox.paymentId,
          $or: [
            { 'payment.status': 'REFUND_PENDING' },
            { 'payment.refundId': outbox.gatewayRefundId }
          ]
        },
        refundUpdate,
        VALIDATED_QUERY_UPDATE_OPTIONS
      );

      if (!updatedBooking) {
        throw new Error('Refund booking update skipped because booking is not in an expected refund state');
      }

      await RefundOutbox.updateOne(
        { _id: outbox._id },
        {
          $set: {
            status: 'COMPLETED',
            completedAt: new Date(),
            lastError: null,
            lockedAt: null
          }
        }
      );

      logger.info('Refund outbox committed', {
        refundOutboxId: outbox._id,
        bookingId: outbox.booking,
        refundId: outbox.gatewayRefundId,
        amount: outbox.amount
      });

      return updatedBooking;
    } catch (error) {
      await this.scheduleRefundOutboxRetry(outbox, error);
      throw error;
    }
  }

  async processRefundOutboxBatch(limit = 10) {
    const staleLockedBefore = new Date(Date.now() - REFUND_OUTBOX_LOCK_TIMEOUT_MS);
    const claimableOutboxQuery = {
      $or: [
        {
          status: { $in: REFUND_OUTBOX_ACTIVE_STATUSES },
          nextAttemptAt: { $lte: new Date() }
        },
        {
          status: 'PROCESSING',
          lockedAt: { $lte: staleLockedBefore }
        }
      ]
    };

    const outboxItems = await RefundOutbox.find({
      ...claimableOutboxQuery
    })
      .sort({ nextAttemptAt: 1 })
      .limit(limit);

    let processed = 0;

    for (const outboxItem of outboxItems) {
      const lockedOutbox = await RefundOutbox.findOneAndUpdate(
        {
          _id: outboxItem._id,
          ...claimableOutboxQuery
        },
        {
          $set: {
            status: 'PROCESSING',
            lockedAt: new Date()
          }
        },
        { new: true }
      );

      if (!lockedOutbox) {
        continue;
      }

      try {
        if (!lockedOutbox.gatewayRefundId) {
          throw new Error('Refund outbox is missing gateway refund ID');
        }

        await this.commitRefundOutbox(lockedOutbox);
        processed++;
      } catch (error) {
        logger.error('Refund outbox processing failed', {
          refundOutboxId: lockedOutbox._id,
          bookingId: lockedOutbox.booking,
          refundId: lockedOutbox.gatewayRefundId,
          error: error.message
        });
      }
    }

    return { processed };
  }

  startRefundOutboxWorker(options = {}) {
    if (process.env.REFUND_OUTBOX_WORKER_ENABLED === 'false') {
      return null;
    }

    if (this.refundOutboxWorker) {
      return this.refundOutboxWorker;
    }

    const intervalMs = Number(options.intervalMs || process.env.REFUND_OUTBOX_WORKER_INTERVAL_MS || REFUND_OUTBOX_DEFAULT_INTERVAL_MS);
    const runWorker = async () => {
      try {
        await this.processRefundOutboxBatch();
      } catch (error) {
        logger.error('Refund outbox worker failed', { error: error.message });
        monitoring.trackError('payment_refund_outbox', error);
      }
    };

    this.refundOutboxWorker = setInterval(runWorker, intervalMs);
    if (typeof this.refundOutboxWorker.unref === 'function') {
      this.refundOutboxWorker.unref();
    }

    runWorker();

    logger.info('Refund outbox worker started', { intervalMs });
    return this.refundOutboxWorker;
  }

  stopRefundOutboxWorker() {
    if (!this.refundOutboxWorker) {
      return;
    }

    clearInterval(this.refundOutboxWorker);
    this.refundOutboxWorker = null;
    logger.info('Refund outbox worker stopped');
  }

  /**
   * Process refund for a booking
   * @param {String} bookingId - Booking ID
   * @param {Number} amount - Refund amount (optional, full refund if not provided)
   * @returns {Promise<Object>} Refund result
   */
  async processRefund(bookingId, amount = null) {
    const razorpay = getRazorpayClient();
    const safeBookingId = normalizeObjectId(bookingId, 'booking id');
    const booking = await Booking.findById(safeBookingId);

    if (!booking) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'Booking not found'
      };
    }

    if (!booking.payment?.paymentId) {
      throw {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: 'No payment ID found for refund'
      };
    }

    const refundAmount = amount || booking.pricing.payableAmount;

    // Step 1: Atomically mark as REFUND_PENDING — only if currently PAID
    // Prevents double-refund from concurrent requests
    const lockedBooking = await Booking.findOneAndUpdate(
      {
        _id: safeBookingId,
        'payment.status': 'PAID'
      },
      {
        $set: {
          'payment.status': 'REFUND_PENDING',
          'payment.refundAmount': refundAmount
        }
      },
      { new: true }
    );

    if (!lockedBooking) {
      // Determine why the lock failed for a clear error message
      if (booking.payment.status === 'REFUNDED') {
        throw {
          statusCode: HTTP_STATUS.BAD_REQUEST,
          message: 'Booking already refunded'
        };
      }
      if (booking.payment.status === 'REFUND_PENDING') {
        throw {
          statusCode: HTTP_STATUS.CONFLICT,
          message: 'Refund is already being processed for this booking'
        };
      }
      throw {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: 'Cannot refund unpaid booking'
      };
    }

    // Step 2: Persist the refund outbox before touching the payment gateway
    let refundOutbox;
    try {
      refundOutbox = await RefundOutbox.create({
        booking: safeBookingId,
        paymentId: lockedBooking.payment.paymentId,
        amount: refundAmount,
        currency: lockedBooking.payment.currency || 'INR',
        status: 'REQUESTED',
        refundReason: 'Booking cancelled',
        nextAttemptAt: new Date()
      });
    } catch (outboxError) {
      await Booking.findByIdAndUpdate(safeBookingId, {
        $set: { 'payment.status': 'PAID' },
        $unset: { 'payment.refundAmount': 1 }
      }, VALIDATED_QUERY_UPDATE_OPTIONS);

      logger.error('Refund outbox creation failed before gateway call', {
        bookingId,
        paymentId: lockedBooking.payment.paymentId,
        refundAmount,
        error: outboxError.message
      });

      throw {
        statusCode: HTTP_STATUS.SERVICE_UNAVAILABLE,
        message: 'Refund could not be queued safely. Please try again.'
      };
    }

    // Step 3: Call Razorpay refund API
    let refund;
    try {
      refund = await razorpay.payments.refund(lockedBooking.payment.paymentId, {
        amount: Math.round(refundAmount * 100),
        receipt: `refund_${refundOutbox._id}`,
        notes: {
          bookingId: String(safeBookingId),
          refundOutboxId: refundOutbox._id.toString(),
          reason: 'Booking cancelled'
        }
      });
    } catch (razorpayError) {
      // Razorpay refund failed — atomically roll back to PAID
      await Booking.findByIdAndUpdate(safeBookingId, {
        $set: { 'payment.status': 'PAID' },
        $unset: { 'payment.refundAmount': 1 }
      }, VALIDATED_QUERY_UPDATE_OPTIONS);
      await RefundOutbox.updateOne(
        { _id: refundOutbox._id },
        {
          $set: {
            status: 'GATEWAY_FAILED',
            lastError: razorpayError.message
          }
        }
      );

      logger.error('Razorpay refund API failed', {
        bookingId,
        refundOutboxId: refundOutbox._id,
        paymentId: lockedBooking.payment.paymentId,
        error: razorpayError.message
      });

      throw {
        statusCode: HTTP_STATUS.BAD_GATEWAY,
        message: 'Refund failed at payment gateway. Please try again.'
      };
    }

    const confirmedOutbox = {
      _id: refundOutbox._id,
      booking: safeBookingId,
      paymentId: lockedBooking.payment.paymentId,
      gatewayRefundId: refund.id,
      amount: refundAmount,
      attemptCount: refundOutbox.attemptCount || 0,
      maxAttempts: refundOutbox.maxAttempts || 10
    };

    try {
      await RefundOutbox.updateOne(
        { _id: refundOutbox._id },
        {
          $set: {
            status: 'GATEWAY_CONFIRMED',
            gatewayRefundId: refund.id,
            gatewayStatus: refund.status,
            gatewayResponse: refund,
            nextAttemptAt: new Date(),
            lastError: null
          }
        }
      );
    } catch (outboxUpdateError) {
      logger.error('CRITICAL: Refund succeeded on Razorpay but outbox confirmation update failed', {
        bookingId,
        refundOutboxId: refundOutbox._id,
        paymentId: lockedBooking.payment.paymentId,
        refundId: refund.id,
        refundAmount,
        razorpayStatus: refund.status,
        error: outboxUpdateError.message
      });

      monitoring.triggerAlert('refund_outbox_confirmation_failed', 1, {
        bookingId,
        refundOutboxId: refundOutbox._id,
        paymentId: lockedBooking.payment.paymentId,
        refundId: refund.id,
        refundAmount
      });

      return {
        refund: {
          id: refund.id,
          amount: refundAmount,
          status: refund.status,
          warning: 'Refund processed but reconciliation queue update failed. Manual reconciliation required.'
        }
      };
    }

    try {
      await this.commitRefundOutbox(confirmedOutbox);
    } catch (dbError) {
      logger.error('Refund succeeded on Razorpay and was queued for DB reconciliation', {
        bookingId,
        refundOutboxId: refundOutbox._id,
        paymentId: lockedBooking.payment.paymentId,
        refundId: refund.id,
        refundAmount,
        razorpayStatus: refund.status,
        dbError: dbError.message
      });

      return {
        refund: {
          id: refund.id,
          amount: refundAmount,
          status: refund.status,
          warning: 'Refund processed and queued for automatic reconciliation.'
        }
      };
    }

    logger.info('Refund processed', {
      bookingId,
      refundOutboxId: refundOutbox._id,
      refundId: refund.id,
      amount: refundAmount
    });

    return {
      refund: {
        id: refund.id,
        amount: refundAmount,
        status: refund.status
      }
    };
  }
}

module.exports = new PaymentService();
