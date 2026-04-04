/**
 * Payment Controller
 *
 * Handles HTTP requests for payment operations
 * Delegates business logic to paymentService
 *
 * Pattern: Controller → Service → Model
 */

const paymentService = require('../services/paymentService');
const logger = require('../utils/logger');
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
      return responseHelper.sendBadRequest(res, 'Booking ID is required');
    }

    const result = await paymentService.createOrder(bookingId, req.user.id);
    responseHelper.sendSuccess(res, result, 'Payment order created successfully');
  } catch (error) {
    if (!error.statusCode) {
      logger.error('Error creating Razorpay order', {
        bookingId: req.body?.bookingId,
        userId: req.user?.id,
        error: error.message,
        stack: error.stack
      });
    }
    responseHelper.handleServiceError(error, res, next);
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
      return responseHelper.sendBadRequest(res, 'Missing payment verification details');
    }

    const result = await paymentService.verifyPayment(req.body, req.user.id);
    responseHelper.sendSuccess(res, result, 'Payment verified successfully');
  } catch (error) {
    if (!error.statusCode) {
      logger.error('Error verifying payment', {
        bookingId: req.body?.bookingId,
        userId: req.user?.id,
        error: error.message,
        stack: error.stack
      });
    }
    responseHelper.handleServiceError(error, res, next);
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
      return responseHelper.sendBadRequest(res, 'Booking ID is required');
    }

    const result = await paymentService.handlePaymentFailure(bookingId, error, req.user.id);
    responseHelper.sendSuccess(res, result, 'Payment failure recorded');
  } catch (error) {
    if (!error.statusCode) {
      logger.error('Error handling payment failure', {
        bookingId: req.body?.bookingId,
        userId: req.user?.id,
        error: error.message,
        stack: error.stack
      });
    }
    responseHelper.handleServiceError(error, res, next);
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
    if (!error.statusCode) {
      logger.error('Error fetching payment status', {
        bookingId: req.params?.bookingId,
        userId: req.user?.id,
        error: error.message,
        stack: error.stack
      });
    }
    responseHelper.handleServiceError(error, res, next);
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
      return responseHelper.sendBadRequest(res, 'Booking ID is required');
    }

    const result = await paymentService.processRefund(bookingId, amount);
    responseHelper.sendSuccess(res, result, 'Refund processed successfully');
  } catch (error) {
    if (!error.statusCode) {
      logger.error('Error processing refund', {
        bookingId: req.body?.bookingId,
        userId: req.user?.id,
        error: error.message,
        stack: error.stack
      });
    }
    responseHelper.handleServiceError(error, res, next);
  }
};
