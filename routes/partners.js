/**
 * Partner onboarding.
 *   POST  /partners/apply                         public: apply to join
 *   GET   /partners/admin/applications            platform_admin: review queue
 *   PATCH /partners/admin/applications/:id        platform_admin: approve / reject
 *   PATCH /partners/admin/staff/:id/verification  platform_admin: set trust badges
 *   GET   /partners/me/account                     partner: profile, earnings, rating, referral
 *   GET   /partners/me/payouts                     partner: balance, payout details, withdrawals
 *   PUT   /partners/me/payout-details              partner: UPI ID or bank account
 *   POST  /partners/me/withdrawals                 partner: withdraw the available balance
 *   GET   /partners/admin/withdrawals              platform_admin: withdrawal queue
 *   GET   /partners/admin/withdrawals/:id/destination  platform_admin (fresh 2FA): bank details to pay
 *   POST  /partners/admin/withdrawals/:id/paid     platform_admin (fresh 2FA): mark paid with UTR
 *   POST  /partners/admin/withdrawals/:id/reject   platform_admin (fresh 2FA): reject
 */

const express = require('express');
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { protect, authorize, requireRecentAuth } = require('../middleware/auth');
const partnerApplicationService = require('../services/partnerApplicationService');
const staffDashboardService = require('../services/staffDashboardService');
const PartnerApplication = require('../models/partnerApplication');
const partnerAccountService = require('../services/partnerAccountService');
const payoutService = require('../services/payoutService');
const partnerVerificationService = require('../services/partnerVerificationService');
const digilockerService = require('../services/digilockerService');
const { uploadPartnerDocument } = require('../middleware/upload');
const storageConfig = require('../config/storage');
const { DOCUMENT_KINDS } = require('../config/partnerDocuments');

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
    body('gender').optional({ values: 'falsy' }).isIn(['FEMALE', 'MALE', 'OTHER']),
    body('city').optional().isString().isLength({ max: 80 }),
    body('qualification').optional().isString().isLength({ max: 80 }),
    body('registrationNumber').optional().isString().isLength({ max: 60 }),
    body('experienceYears').optional().isInt({ min: 0, max: 60 }),
    body('businessName').optional().isString().isLength({ max: 120 }),
    body('gstin').optional().isString().isLength({ max: 20 }),
    body('address').optional().isString().isLength({ max: 300 }),
    body('vehicle').optional().isString().isLength({ max: 40 }),
    body('referralCode').optional({ values: 'falsy' }).isString().isLength({ max: 20 }),
    body('acceptTerms').optional().isBoolean()
  ],
  validate,
  wrap(async (req, res) => {
    const application = await partnerApplicationService.apply(req.body);
    res.status(201).json({ success: true, application });
  })
);

const PARTNER_ROLES = ['nurse', 'physiotherapist', 'medical_staff', 'pharmacy_vendor', 'phlebotomist', 'delivery_partner', 'lab_partner'];
router.get(
  '/me/account',
  protect,
  authorize(...PARTNER_ROLES),
  wrap(async (req, res) => res.json({ success: true, account: await partnerAccountService.getAccount(req.user._id) }))
);

const partner = [protect, authorize(...PARTNER_ROLES)];
// Verification documents: checklist, upload, and Aadhaar via DigiLocker.
router.get('/me/verification', partner, wrap(async (req, res) => res.json({ success: true, verification: await partnerVerificationService.getStatus(req.user._id) })));
router.post(
  '/me/documents',
  partner,
  uploadPartnerDocument,
  [body('kind').isIn(DOCUMENT_KINDS), body('number').optional().isString().trim().isLength({ max: 40 }), body('expiresAt').optional({ values: 'falsy' }).isISO8601()],
  validate,
  wrap(async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'Attach a photo or PDF of the document' });
    const document = await partnerVerificationService.submitDocument(req.user._id, req.body, storageConfig.toStoredFile(req.file));
    res.status(201).json({ success: true, document });
  })
);
router.post('/me/digilocker/start', partner, [body('returnTo').optional().isIn(['web', 'app'])], validate,
  wrap(async (req, res) => res.json({ success: true, url: await digilockerService.startUrl(req.user._id, req.body.returnTo) })));
// DigiLocker sends the partner back here (no session cookie needed: the one-time state identifies them).
router.get('/digilocker/callback', wrap(async (req, res) => {
  const r = await digilockerService.handleCallback({ code: req.query.code, state: req.query.state, error: req.query.error });
  const web = (process.env.WEB_APP_URL || process.env.APP_URL || '').replace(/\/+$/, '');
  const status = r.ok ? 'ok' : r.reason;
  res.set('Cache-Control', 'no-store');
  if (r.returnTo === 'app') return res.redirect(302, `nabzpartner://verification?digilocker=${status}`);
  return res.redirect(302, `${web}/partner/verification?digilocker=${encodeURIComponent(status)}`);
}));

// Offers & updates from the admin panel (campaigns for partners).
router.get('/me/updates', partner, wrap(async (req, res) => res.json({ success: true, updates: await require('../services/campaignService').feed('user', req.user.role) })));
router.post('/me/updates/:id/open', partner, [param('id').isMongoId()], validate, wrap(async (req, res) => {
  await require('../services/campaignService').recordOpen(req.params.id);
  res.json({ success: true });
}));
router.get('/me/payouts', partner, wrap(async (req, res) => res.json({ success: true, payouts: await payoutService.getPayoutSummary(req.user._id) })));
router.put(
  '/me/payout-details',
  partner,
  [
    body('method').isIn(['UPI', 'BANK']),
    body('upiId').optional({ values: 'falsy' }).isString().isLength({ max: 120 }),
    body('accountNumber').optional({ values: 'falsy' }).isString().isLength({ max: 24 }),
    body('ifsc').optional({ values: 'falsy' }).isString().isLength({ max: 11 }),
    body('accountName').optional({ values: 'falsy' }).isString().isLength({ max: 80 }),
    body('bankName').optional({ values: 'falsy' }).isString().isLength({ max: 60 })
  ],
  validate,
  wrap(async (req, res) => res.json({ success: true, details: await payoutService.savePayoutDetails(req.user._id, req.body) }))
);
router.post('/me/withdrawals', partner, wrap(async (req, res) => res.status(201).json({ success: true, withdrawal: await payoutService.requestWithdrawal(req.user._id) })));

router.get(
  '/admin/withdrawals',
  admin,
  [query('status').optional().isIn(['REQUESTED', 'PAID', 'REJECTED'])],
  validate,
  wrap(async (req, res) => res.json({ success: true, withdrawals: await payoutService.listRequests(req.query) }))
);
router.get(
  '/admin/withdrawals/:id/destination',
  adminSensitive,
  [param('id').isMongoId()],
  validate,
  wrap(async (req, res) => { res.set('Cache-Control', 'no-store'); res.json({ success: true, destination: await payoutService.revealDestination(req.params.id, req.user._id) }); })
);
router.post(
  '/admin/withdrawals/:id/paid',
  adminSensitive,
  [param('id').isMongoId(), body('utr').isString().trim().isLength({ min: 6, max: 40 }), body('note').optional().isString().isLength({ max: 300 })],
  validate,
  wrap(async (req, res) => res.json({ success: true, withdrawal: await payoutService.markPaid(req.params.id, req.user._id, req.body) }))
);
router.post(
  '/admin/withdrawals/:id/reject',
  adminSensitive,
  [param('id').isMongoId(), body('note').optional().isString().isLength({ max: 300 })],
  validate,
  wrap(async (req, res) => res.json({ success: true, withdrawal: await payoutService.reject(req.params.id, req.user._id, req.body) }))
);

router.get(
  '/admin/staff-mix',
  admin,
  wrap(async (req, res) => res.json({ success: true, mix: await partnerApplicationService.staffMix() }))
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
  wrap(async (req, res) => {
    const result = await staffDashboardService.setVerification(req.params.id, req.user._id, req.body);
    await require('../services/securityAuditService').record({
      event: 'admin_staff_verification_changed', actorId: req.user._id, actorType: 'user', targetType: 'user', targetId: req.params.id, req,
      metadata: { id: req.body.id, police: req.body.police, council: req.body.council, vaccinated: req.body.vaccinated, releasedVisits: result.releasedVisits }
    });
    res.json({ success: true, ...result });
  })
);

module.exports = router;
