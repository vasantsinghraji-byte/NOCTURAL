/**
 * Nabz Plus membership (patients).
 *   GET  /membership/plans     public: plan, price, trial length
 *   GET  /membership           my status
 *   POST /membership/trial     start the one-time free trial
 *   POST /membership/checkout  Razorpay order for the plan (503 when online payment is off)
 *   POST /membership/verify    verify the Razorpay callback → activate
 *
 * Admin panel (section "plans"):
 *   GET  /membership/admin/plans        every plan with member counts
 *   PUT  /membership/admin/plans/:code  create or change a plan (fresh authenticator code)
 */

const express = require('express');
const { body, param } = require('express-validator');
const { validate } = require('../middleware/validation');
const { protectPatient } = require('../middleware/patientAuth');
const { protect, requireRecentAuth } = require('../middleware/auth');
const { adminSection } = require('../middleware/adminAccess');
const idempotency = require('../middleware/idempotency');
const membershipService = require('../services/membershipService');

const router = express.Router();

const PLAN_CODE = /^[A-Z][A-Z0-9_]{2,29}$/;

router.get('/plans', async (req, res, next) => {
  try {
    res.json({ success: true, ...(await membershipService.listPlans()) });
  } catch (error) {
    next(error);
  }
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
  [
    body('plan').optional().isString().trim().toUpperCase().matches(PLAN_CODE).withMessage('Unknown plan'),
    body('couponCode').optional({ values: 'falsy' }).isString().trim().isLength({ max: 30 }).withMessage('That code is not valid')
  ],
  validate,
  async (req, res, next) => {
    try {
      const checkout = await membershipService.createCheckout(req.user._id, req.body.plan || 'PLUS_MONTHLY', req.body.couponCode);
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

// ── Admin panel ──────────────────────────────────────────────────────────────
router.get('/admin/plans', protect, adminSection('plans'), async (req, res, next) => {
  try {
    res.json({ success: true, ...(await membershipService.adminListPlans(req.user._id)) });
  } catch (error) {
    next(error);
  }
});

router.put(
  '/admin/plans/:code',
  protect,
  adminSection('plans'),
  requireRecentAuth,
  [
    param('code').isString().trim().toUpperCase().matches(PLAN_CODE).withMessage('Plan code: 3-30 capital letters, digits or _'),
    body('name').optional().isString().trim().isLength({ min: 2, max: 40 }),
    body('price').optional().isInt({ min: 1, max: 100000 }).toInt(),
    body('days').optional().isInt({ min: 1, max: 366 }).toInt(),
    body('note').optional({ nullable: true }).isString().trim().isLength({ max: 60 }),
    body('active').optional().isBoolean().toBoolean(),
    body('sortOrder').optional().isInt({ min: 0, max: 999 }).toInt()
  ],
  validate,
  async (req, res, next) => {
    try {
      const plan = await membershipService.adminSavePlan(req.user._id, req.params.code, req.body);
      res.json({ success: true, plan });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
