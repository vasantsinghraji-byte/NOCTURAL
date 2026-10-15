/**
 * Nabz Plus membership (patients).
 *   GET  /membership/plans     public: plan, price, trial length
 *   GET  /membership           my status
 *   POST /membership/trial     start the one-time free trial
 *   POST /membership/checkout  Razorpay order for the plan (503 when online payment is off)
 *   POST /membership/verify    verify the Razorpay callback → activate
 */

const express = require('express');
const { body } = require('express-validator');
const { validate } = require('../middleware/validation');
const { protectPatient } = require('../middleware/patientAuth');
const idempotency = require('../middleware/idempotency');
const membershipService = require('../services/membershipService');

const router = express.Router();

router.get('/plans', (req, res) => {
  res.json({ success: true, ...membershipService.listPlans() });
});

router.get('/', protectPatient, async (req, res, next) => {
  try {
    res.json({ success: true, ...(await membershipService.getStatus(req.user._id)) });
  } catch (error) {
    next(error);
  }
});

router.post('/trial', protectPatient, idempotency({ route: 'membership/trial' }), async (req, res, next) => {
  try {
    const membership = await membershipService.startTrial(req.user._id);
    res.status(201).json({ success: true, membership });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/checkout',
  protectPatient,
  [body('plan').optional().isIn(['PLUS_MONTHLY']).withMessage('Unknown plan')],
  validate,
  async (req, res, next) => {
    try {
      const checkout = await membershipService.createCheckout(req.user._id, req.body.plan || 'PLUS_MONTHLY');
      res.status(201).json({ success: true, ...checkout });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/verify',
  protectPatient,
  [
    body('razorpay_order_id').isString().trim().notEmpty().withMessage('razorpay_order_id is required'),
    body('razorpay_payment_id').isString().trim().notEmpty().withMessage('razorpay_payment_id is required'),
    body('razorpay_signature').isString().trim().notEmpty().withMessage('razorpay_signature is required')
  ],
  validate,
  idempotency({ route: 'membership/verify' }),
  async (req, res, next) => {
    try {
      const membership = await membershipService.verifyCheckout(req.user._id, {
        razorpayOrderId: req.body.razorpay_order_id,
        razorpayPaymentId: req.body.razorpay_payment_id,
        razorpaySignature: req.body.razorpay_signature
      });
      res.json({ success: true, membership });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
