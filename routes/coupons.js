/**
 * Discount coupons.
 *   POST /coupons/check        customer: what a code takes off this order (nothing is used yet)
 *
 * Admin panel (section "plans"):
 *   GET  /coupons/admin        every coupon with uses and discount given
 *   POST /coupons/admin        create (fresh authenticator code)
 *   PUT  /coupons/admin/:id    change or switch off (fresh authenticator code)
 *
 * A code is only used when the order is placed (each checkout calls
 * couponService.reserve with its own server-side total).
 */

const express = require('express');
const { body, param } = require('express-validator');
const { validate } = require('../middleware/validation');
const { protectPatient } = require('../middleware/patientAuth');
const { protect, requireRecentAuth } = require('../middleware/auth');
const { adminSection } = require('../middleware/adminAccess');
const couponService = require('../services/couponService');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.post(
  '/check',
  protectPatient,
  [
    body('code').isString().trim().isLength({ min: 1, max: 30 }).withMessage('Enter a code'),
    body('service').isIn(couponService.SERVICES).withMessage('Unknown service'),
    body('amount').isFloat({ min: 0, max: 10000000 }).toFloat().withMessage('amount is the order total before fees')
  ],
  validate,
  wrap(async (req, res) => {
    res.json({ success: true, coupon: await couponService.preview({ code: req.body.code, patientId: req.user._id, service: req.body.service, amount: req.body.amount }) });
  })
);

const couponBody = (creating) => [
  ...(creating ? [body('code').isString().trim().isLength({ min: 3, max: 20 }).withMessage('Code: 3-20 letters and digits')] : []),
  body('description')[creating ? 'exists' : 'optional']().isString().trim().isLength({ min: 3, max: 120 }),
  body('kind')[creating ? 'exists' : 'optional']().isIn(['PERCENT', 'FLAT']),
  body('value')[creating ? 'exists' : 'optional']().isInt({ min: 1, max: 100000 }).toInt(),
  body('maxDiscount').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1, max: 100000 }).toInt(),
  body('minOrder').optional({ nullable: true }).isFloat({ min: 0, max: 1000000 }).toFloat(),
  body('services')[creating ? 'exists' : 'optional']().isArray({ min: 1, max: 5 }),
  body('services.*').optional().isIn(couponService.SERVICES),
  body('startsAt')[creating ? 'exists' : 'optional']().isISO8601(),
  body('endsAt')[creating ? 'exists' : 'optional']().isISO8601(),
  body('totalLimit').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1, max: 1000000 }).toInt(),
  body('perCustomerLimit').optional().isInt({ min: 1, max: 100 }).toInt(),
  body('firstOrderOnly').optional().isBoolean().toBoolean(),
  body('requireVerifiedPhone').optional().isBoolean().toBoolean(),
  body('active').optional().isBoolean().toBoolean()
];

router.get('/admin', protect, adminSection('plans'), wrap(async (req, res) => {
  res.json({ success: true, coupons: await couponService.adminList(), services: couponService.SERVICES.map((key) => ({ key, label: couponService.SERVICE_LABEL[key] })) });
}));

router.post('/admin', protect, adminSection('plans'), requireRecentAuth, couponBody(true), validate, wrap(async (req, res) => {
  res.status(201).json({ success: true, coupon: await couponService.adminCreate(req.user._id, req.body) });
}));

router.put('/admin/:id', protect, adminSection('plans'), requireRecentAuth, [param('id').isMongoId(), ...couponBody(false)], validate, wrap(async (req, res) => {
  res.json({ success: true, coupon: await couponService.adminUpdate(req.user._id, req.params.id, req.body) });
}));

module.exports = router;
