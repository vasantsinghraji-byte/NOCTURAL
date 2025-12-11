/**
 * Payment Controller
 *
 * Handles HTTP requests for payment operations
 * Delegates business logic to paymentService
 *
 * Pattern: Controller → Service → Model
 */

const paymentService = require('../services/paymentService');
const { HTTP_STATUS } = require('../constants');
const responseHelper = require('../utils/responseHelper');

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

    const result = await paymentService.createOrder(bookingId, req.user.id);
    responseHelper.sendSuccess(res, result, 'Payment order created successfully');

  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
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

    const result = await paymentService.verifyPayment(req.body, req.user.id);
    responseHelper.sendSuccess(res, result, 'Payment verified successfully');

  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
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

    const result = await paymentService.handlePaymentFailure(bookingId, error);
    responseHelper.sendSuccess(res, result, 'Payment failure recorded');

  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
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

    const result = await paymentService.getPaymentStatus(bookingId, req.user.id);
    responseHelper.sendSuccess(res, result, 'Payment status fetched successfully');

  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    console.error('Error fetching payment status:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to fetch payment status',
      error: error.message
    });
  }
};

/**
 * @desc    Process refund for a booking
 * @route   POST /api/payments/refund
 * @access  Private (Admin)
 */
exports.processRefund = async (req, res, next) => {
  try {
    const { bookingId, amount } = req.body;

    if (!bookingId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Booking ID is required'
      });
    }

    const result = await paymentService.processRefund(bookingId, amount);
    responseHelper.sendSuccess(res, result, 'Refund processed successfully');

  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    console.error('Error processing refund:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to process refund',
      error: error.message
    });
  }
};
