/**
 * Payment Controller
 *
 * Handles Razorpay payment integration for bookings
 */

const Razorpay = require('razorpay');
const crypto = require('crypto');
const Booking = require('../models/nurseBooking');
const { HTTP_STATUS } = require('../constants');
const responseHelper = require('../utils/responseHelper');

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_YOUR_KEY_HERE',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'YOUR_SECRET_HERE'
});

/**
 * @desc    Create Razorpay order for booking
 * @route   POST /api/payments/create-order
 * @access  Private (Patient)
 */
exports.createOrder = async (req, res, next) => {
  try {
    const { bookingId } = req.body;

    if (!bookingId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Booking ID is required'
      });
    }

    // Find booking
    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Verify booking belongs to requesting patient
    if (booking.patient.toString() !== req.user.id) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: 'Unauthorized access to booking'
      });
    }

    // Check if already paid
    if (booking.paymentStatus === 'PAID') {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Booking already paid'
      });
    }

    // Create Razorpay order
    const options = {
      amount: Math.round(booking.pricing.payableAmount * 100), // Amount in paise
      currency: 'INR',
      receipt: `booking_${bookingId}`,
      notes: {
        bookingId: bookingId,
        patientId: req.user.id,
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

    responseHelper.sendSuccess(res, {
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
    }, 'Payment order created successfully');

  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to create payment order',
      error: error.message
    });
  }
};

/**
 * @desc    Verify Razorpay payment signature
 * @route   POST /api/payments/verify
 * @access  Private (Patient)
 */
exports.verifyPayment = async (req, res, next) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      bookingId
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !bookingId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Missing payment verification details'
      });
    }

    // Find booking
    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Verify booking belongs to requesting patient
    if (booking.patient.toString() !== req.user.id) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: 'Unauthorized access to booking'
      });
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

      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Payment verification failed'
      });
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

    responseHelper.sendSuccess(res, {
      booking: {
        id: booking._id,
        status: booking.status,
        paymentStatus: booking.paymentStatus
      }
    }, 'Payment verified successfully');

  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to verify payment',
      error: error.message
    });
  }
};

/**
 * @desc    Handle payment failure
 * @route   POST /api/payments/failure
 * @access  Private (Patient)
 */
exports.handlePaymentFailure = async (req, res, next) => {
  try {
    const { bookingId, error } = req.body;

    if (!bookingId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Booking ID is required'
      });
    }

    // Find booking
    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Update payment status
    booking.payment.status = 'FAILED';
    booking.paymentStatus = 'FAILED';
    booking.payment.failureReason = error?.description || 'Payment failed';
    await booking.save();

    responseHelper.sendSuccess(res, {
      booking: {
        id: booking._id,
        paymentStatus: booking.paymentStatus
      }
    }, 'Payment failure recorded');

  } catch (error) {
    console.error('Error handling payment failure:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to process payment failure',
      error: error.message
    });
  }
};

/**
 * @desc    Get payment status
 * @route   GET /api/payments/status/:bookingId
 * @access  Private (Patient)
 */
exports.getPaymentStatus = async (req, res, next) => {
  try {
    const { bookingId } = req.params;

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Verify booking belongs to requesting patient
    if (booking.patient.toString() !== req.user.id) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: 'Unauthorized access to booking'
      });
    }

    responseHelper.sendSuccess(res, {
      payment: {
        status: booking.paymentStatus,
        amount: booking.pricing.payableAmount,
        orderId: booking.payment?.orderId,
        paymentId: booking.payment?.paymentId,
        paidAt: booking.payment?.paidAt
      }
    }, 'Payment status fetched successfully');

  } catch (error) {
    console.error('Error fetching payment status:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to fetch payment status',
      error: error.message
    });
  }
};
