/**
 * Payment Routes
 *
 * Routes for Razorpay payment integration
 */

const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/validation');
const { protectPatient } = require('../middleware/patientAuth');
const paymentController = require('../controllers/paymentController');
const idempotency = require('../middleware/idempotency');

/**
 * @route   POST /api/v1/payments/create-order
 * @desc    Create Razorpay order for booking payment
 * @access  Private (Patient)
 */
router.post(
  '/create-order',
  protectPatient,
  [
    body('bookingId')
      .notEmpty().withMessage('Booking ID is required')
      .isMongoId().withMessage('Invalid booking ID format'),
    validate
  ],
  idempotency({ route: 'payments/create-order' }),
  paymentController.createOrder
);

/**
 * @route   POST /api/v1/payments/verify
 * @desc    Verify Razorpay payment signature
 * @access  Private (Patient)
 */
router.post(
  '/verify',
  protectPatient,
  [
    body('razorpay_order_id').isString().withMessage('Order ID must be a string')
      .notEmpty().withMessage('Order ID is required'),
    body('razorpay_payment_id').isString().withMessage('Payment ID must be a string')
      .notEmpty().withMessage('Payment ID is required'),
    body('razorpay_signature').isString().withMessage('Payment signature must be a string')
      .notEmpty().withMessage('Payment signature is required'),
    body('bookingId')
      .notEmpty().withMessage('Booking ID is required')
      .isMongoId().withMessage('Invalid booking ID format'),
    validate
  ],
  idempotency({ route: 'payments/verify' }),
  paymentController.verifyPayment
);

/**
 * @route   POST /api/v1/payments/failure
 * @desc    Handle payment failure
 * @access  Private (Patient)
 */
router.post(
  '/failure',
  protectPatient,
  [
    body('bookingId')
      .notEmpty().withMessage('Booking ID is required')
      .isMongoId().withMessage('Invalid booking ID format'),
    validate
  ],
  paymentController.handlePaymentFailure
);

/**
 * @route   GET /api/v1/payments/status/:bookingId
 * @desc    Get payment status for booking
 * @access  Private (Patient)
 */
router.get(
  '/status/:bookingId',
  protectPatient,
  paymentController.getPaymentStatus
);

module.exports = router;
