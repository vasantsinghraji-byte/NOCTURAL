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

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_YOUR_KEY_HERE',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'YOUR_SECRET_HERE'
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
    if (booking.paymentStatus === 'PAID') {
      throw {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: 'Booking already paid'
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

    // Update booking with order details
    booking.payment = {
      orderId: order.id,
      amount: booking.pricing.payableAmount,
      currency: 'INR',
      status: 'PENDING',
      createdAt: new Date()
    };
    await booking.save();

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
      razorpayKey: process.env.RAZORPAY_KEY_ID || 'rzp_test_YOUR_KEY_HERE'
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

    // Verify signature
    const sign = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'YOUR_SECRET_HERE')
      .update(sign.toString())
      .digest('hex');

    if (razorpay_signature !== expectedSign) {
      // Payment verification failed
      booking.payment.status = 'FAILED';
      booking.paymentStatus = 'FAILED';
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

    // Payment verified successfully
    booking.payment.paymentId = razorpay_payment_id;
    booking.payment.status = 'SUCCESS';
    booking.payment.paidAt = new Date();
    booking.paymentStatus = 'PAID';

    // Update booking status from REQUESTED to SEARCHING
    if (booking.status === 'REQUESTED') {
      booking.status = 'SEARCHING';
      booking.statusHistory.push({
        status: 'SEARCHING',
        timestamp: new Date(),
        note: 'Payment verified, searching for provider'
      });
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
        paymentStatus: booking.paymentStatus
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
    booking.paymentStatus = 'FAILED';
    booking.payment.failureReason = error?.description || 'Payment failed';
    await booking.save();

    logger.warn('Payment failed', {
      bookingId,
      reason: error?.description || 'Unknown'
    });

    return {
      booking: {
        id: booking._id,
        paymentStatus: booking.paymentStatus
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
        status: booking.paymentStatus,
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

    if (booking.paymentStatus !== 'PAID') {
      throw {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: 'Cannot refund unpaid booking'
      };
    }

    if (!booking.payment?.paymentId) {
      throw {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: 'No payment ID found for refund'
      };
    }

    const refundAmount = amount || booking.pricing.payableAmount;

    const refund = await razorpay.payments.refund(booking.payment.paymentId, {
      amount: Math.round(refundAmount * 100),
      notes: {
        bookingId: bookingId,
        reason: 'Booking cancelled'
      }
    });

    booking.payment.refundId = refund.id;
    booking.payment.refundAmount = refundAmount;
    booking.payment.refundedAt = new Date();
    booking.paymentStatus = 'REFUNDED';
    await booking.save();

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
