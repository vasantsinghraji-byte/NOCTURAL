/**
 * Partner onboarding.
 *   POST  /partners/apply                         public: apply to join
 *   GET   /partners/admin/applications            platform_admin: review queue
 *   PATCH /partners/admin/applications/:id        platform_admin: approve / reject
 *   PATCH /partners/admin/staff/:id/verification  platform_admin: set trust badges
 */

const express = require('express');
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { protect, authorize, requireRecentAuth } = require('../middleware/auth');
const partnerApplicationService = require('../services/partnerApplicationService');
const staffDashboardService = require('../services/staffDashboardService');
const PartnerApplication = require('../models/partnerApplication');

const router = express.Router();
const admin = [protect, authorize('platform_admin')];
// Approving partners / setting trust badges needs a fresh authenticator code.
const adminSensitive = [...admin, requireRecentAuth];
const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};

router.post(
  '/apply',
  [
    body('kind').isIn(PartnerApplication.PARTNER_KINDS).withMessage('Choose a partner type'),
    body('name').isString().trim().isLength({ min: 2, max: 120 }).withMessage('Enter your name'),
    body('phone').isString().matches(/^(\+?91)?[6-9]\d{9}$/).withMessage('Enter a valid mobile number'),
    body('email').optional({ values: 'falsy' }).isEmail().withMessage('Enter a valid email'),
    body('city').optional().isString().isLength({ max: 80 }),
    body('qualification').optional().isString().isLength({ max: 80 }),
    body('registrationNumber').optional().isString().isLength({ max: 60 }),
    body('experienceYears').optional().isInt({ min: 0, max: 60 }),
    body('businessName').optional().isString().isLength({ max: 120 }),
    body('gstin').optional().isString().isLength({ max: 20 }),
    body('address').optional().isString().isLength({ max: 300 }),
    body('vehicle').optional().isString().isLength({ max: 40 })
  ],
  validate,
  wrap(async (req, res) => {
    const application = await partnerApplicationService.apply(req.body);
    res.status(201).json({ success: true, application });
  })
);

router.get(
  '/admin/applications',
  admin,
  [query('status').optional().isIn(['PENDING', 'APPROVED', 'REJECTED']), query('kind').optional().isIn(PartnerApplication.PARTNER_KINDS)],
  validate,
  wrap(async (req, res) => res.json({ success: true, applications: await partnerApplicationService.list(req.query) }))
);

router.patch(
  '/admin/applications/:id',
  adminSensitive,
  [param('id').isMongoId(), body('status').isIn(['APPROVED', 'REJECTED']), body('note').optional().isString().isLength({ max: 300 }), body('email').optional().isEmail().isLength({ max: 160 })],
  validate,
  wrap(async (req, res) => res.json({ success: true, application: await partnerApplicationService.review(req.params.id, req.user._id, req.body) }))
);

router.patch(
  '/admin/staff/:id/verification',
  adminSensitive,
  [param('id').isMongoId(), body(['id', 'police', 'council', 'vaccinated']).optional().isBoolean()],
  validate,
  wrap(async (req, res) => res.json({ success: true, ...(await staffDashboardService.setVerification(req.params.id, req.user._id, req.body)) }))
);

module.exports = router;
