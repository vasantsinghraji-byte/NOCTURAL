/**
 * Payment Service
 *
 * Business logic layer for payment operations
 * Handles Razorpay integration, order creation, and payment verification
 */

const Razorpay = require('razorpay');
const crypto = require('crypto');
const Booking = require('../models/nurseBooking');
const logger = require('../utils/logger');
const { HTTP_STATUS } = require('../constants');

// Validate Razorpay credentials at startup
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  logger.error('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET environment variables are required');
  throw new Error('Missing Razorpay credentials. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
}

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

class PaymentService {
  /**
   * Create a Razorpay order for booking
   * @param {String} bookingId - Booking ID
   * @param {String} userId - User ID (patient)
   * @returns {Promise<Object>} Order details
   */
  async createOrder(bookingId, userId) {
    const booking = await Booking.findById(bookingId);

    if (!booking) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'Booking not found'
      };
    }

    // Verify booking belongs to requesting patient
    if (booking.patient.toString() !== userId) {
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
        _id: bookingId,
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
      receipt: `booking_${bookingId}`,
      notes: {
        bookingId: bookingId,
        patientId: userId,
        serviceType: booking.serviceType
      }
    };

    const order = await razorpay.orders.create(options);

    // Atomically update booking with order details
    await Booking.findByIdAndUpdate(bookingId, {
      $set: {
        'payment.orderId': order.id,
        'payment.amount': booking.pricing.payableAmount,
        'payment.currency': 'INR',
        'payment.status': 'PENDING',
        'payment.createdAt': new Date()
      }
    });

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
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      bookingId
    } = paymentData;

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'Booking not found'
      };
    }

    // Verify booking belongs to requesting patient
    if (booking.patient.toString() !== userId) {
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
   * @returns {Promise<Object>} Updated booking
   */
  async handlePaymentFailure(bookingId, error) {
    const booking = await Booking.findById(bookingId);

    if (!booking) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'Booking not found'
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
    const booking = await Booking.findById(bookingId);

    if (!booking) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'Booking not found'
      };
    }

    // Verify booking belongs to requesting patient
    if (booking.patient.toString() !== userId) {
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

  /**
   * Process refund for a booking
   * @param {String} bookingId - Booking ID
   * @param {Number} amount - Refund amount (optional, full refund if not provided)
   * @returns {Promise<Object>} Refund result
   */
  async processRefund(bookingId, amount = null) {
    const booking = await Booking.findById(bookingId);

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
        _id: bookingId,
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

    // Step 2: Call Razorpay refund API
    let refund;
    try {
      refund = await razorpay.payments.refund(lockedBooking.payment.paymentId, {
        amount: Math.round(refundAmount * 100),
        notes: {
          bookingId: bookingId,
          reason: 'Booking cancelled'
        }
      });
    } catch (razorpayError) {
      // Razorpay refund failed — atomically roll back to PAID
      await Booking.findByIdAndUpdate(bookingId, {
        $set: { 'payment.status': 'PAID' },
        $unset: { 'payment.refundAmount': 1 }
      });

      logger.error('Razorpay refund API failed', {
        bookingId,
        paymentId: lockedBooking.payment.paymentId,
        error: razorpayError.message
      });

      throw {
        statusCode: HTTP_STATUS.BAD_GATEWAY,
        message: 'Refund failed at payment gateway. Please try again.'
      };
    }

    // Step 3: Atomically update booking with refund confirmation (with retry)
    const refundUpdate = {
      $set: {
        'payment.refundId': refund.id,
        'payment.refundedAt': new Date(),
        'payment.status': 'REFUNDED'
      }
    };

    let updatedBooking = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        updatedBooking = await Booking.findByIdAndUpdate(
          bookingId,
          refundUpdate,
          { new: true }
        );
        break; // Success — exit retry loop
      } catch (dbError) {
        if (attempt === 3) {
          // CRITICAL: Razorpay refund succeeded but all DB retries failed
          logger.error('CRITICAL: Refund succeeded on Razorpay but DB update failed after 3 retries', {
            bookingId,
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
              warning: 'Refund processed but record update failed. Support has been notified.'
            }
          };
        }
        // Wait briefly before retry
        await new Promise(resolve => setTimeout(resolve, 200 * attempt));
      }
    }

    logger.info('Refund processed', {
      bookingId,
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
