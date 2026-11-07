/**
 * Onboarding panel (website /onboarding): partner applications and partner
 * documents, for the onboarding team and platform admins. Every account here
 * signs in with an authenticator code (adminMfaService.ADMIN_ROLES), and every
 * decision needs a fresh code (requireRecentAuth) and is audited.
 *
 *   GET   /onboarding/applications?status&kind      queue, one tab per partner kind
 *   GET   /onboarding/applications/counts           pending per kind (tab badges)
 *   PATCH /onboarding/applications/:id              approve / reject (fresh 2FA)
 *   GET   /onboarding/documents?status              document queue
 *   GET   /onboarding/documents/partner/:userId     one partner's checklist
 *   POST  /onboarding/documents/:id/view            short-lived file link (fresh 2FA)
 *   PATCH /onboarding/documents/:id                 approve / reject a document (fresh 2FA)
 *
 *   Platform admin only:
 *   GET   /onboarding/team                          reviewers and the allowed login domains
 *   POST  /onboarding/team                          add a reviewer (login ID; they set the password)
 *   PATCH /onboarding/team/:id                      suspend / restore
 *   POST  /onboarding/team/:id/invite               send a fresh set-password link
 */

const express = require('express');
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { protect, authorize, requireRecentAuth } = require('../middleware/auth');
const partnerApplicationService = require('../services/partnerApplicationService');
const partnerVerificationService = require('../services/partnerVerificationService');
const onboardingTeamService = require('../services/onboardingTeamService');
const securityAuditService = require('../services/securityAuditService');
const PartnerApplication = require('../models/partnerApplication');

const router = express.Router();
const reviewer = [protect, authorize('onboarding_reviewer', 'platform_admin')];
const reviewerSensitive = [...reviewer, requireRecentAuth];
const admin = [protect, authorize('platform_admin')];
const adminSensitive = [...admin, requireRecentAuth];

const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};
// Partner identity data must never be cached by browsers or proxies.
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

// ── Applications ───────────────────────────────────────────────────────────
router.get('/applications/counts', reviewer,
  wrap(async (req, res) => res.json({ success: true, counts: await partnerApplicationService.pendingCounts(), createsLogin: partnerApplicationService.PROVISIONED_KINDS })));

router.get('/applications', reviewer,
  [query('status').optional().isIn(['PENDING', 'APPROVED', 'REJECTED']), query('kind').optional().isIn(PartnerApplication.PARTNER_KINDS)],
  validate,
  wrap(async (req, res) => res.json({ success: true, applications: await partnerApplicationService.list(req.query) })));

router.patch('/applications/:id', reviewerSensitive,
  [param('id').isMongoId(), body('status').isIn(['APPROVED', 'REJECTED']), body('note').optional().isString().isLength({ max: 300 }), body('email').optional().isEmail().isLength({ max: 160 })],
  validate,
  wrap(async (req, res) => {
    const application = await partnerApplicationService.review(req.params.id, req.user._id, req.body);
    await securityAuditService.record({
      event: req.body.status === 'APPROVED' ? 'onboarding_application_approved' : 'onboarding_application_rejected',
      actorId: req.user._id, actorType: 'user', targetType: 'partner_application', targetId: req.params.id, req,
      metadata: { kind: application.kind, note: req.body.note, provisioned: !!application.provisioned }
    });
    res.json({ success: true, application });
  }));

// ── Documents ──────────────────────────────────────────────────────────────
router.get('/documents', reviewer, [query('status').optional().isIn(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'ALL'])], validate,
  wrap(async (req, res) => res.json({ success: true, documents: await partnerVerificationService.reviewQueue({ status: req.query.status || 'PENDING' }) })));

router.get('/documents/partner/:userId', reviewer, [param('userId').isMongoId()], validate,
  wrap(async (req, res) => res.json({ success: true, verification: await partnerVerificationService.getStatus(req.params.userId) })));

router.post('/documents/:id/view', reviewerSensitive, [param('id').isMongoId()], validate, wrap(async (req, res) => {
  const doc = await partnerVerificationService.fileFor(req.params.id);
  await securityAuditService.record({ event: 'onboarding_partner_document_viewed', actorId: req.user._id, actorType: 'user', targetType: 'user', targetId: doc.user, req, metadata: { documentId: req.params.id, kind: doc.kind } });
  const link = await partnerVerificationService.fileLink(doc);
  if (!link) return res.status(404).json({ success: false, message: 'File not found' });
  return res.json({ success: true, ...link });
}));

router.patch('/documents/:id', reviewerSensitive,
  [param('id').isMongoId(), body('decision').isIn(['APPROVED', 'REJECTED']), body('note').optional().isString().trim().isLength({ max: 300 }), body('expiresAt').optional({ values: 'falsy' }).isISO8601()],
  validate,
  wrap(async (req, res) => {
    const result = await partnerVerificationService.review(req.params.id, req.user._id, req.body);
    await securityAuditService.record({
      event: req.body.decision === 'APPROVED' ? 'onboarding_partner_document_approved' : 'onboarding_partner_document_rejected',
      actorId: req.user._id, actorType: 'user', targetType: 'partner_document', targetId: req.params.id, req,
      metadata: { kind: result.document.kind, note: req.body.note }
    });
    res.json({ success: true, ...result });
  }));

// ── Team (platform admin) ──────────────────────────────────────────────────
router.get('/team', admin, wrap(async (req, res) => res.json({ success: true, ...(await onboardingTeamService.list()) })));

router.post('/team', adminSensitive,
  [body('name').isString().trim().isLength({ min: 2, max: 80 }), body('email').isEmail().isLength({ max: 160 })],
  validate,
  wrap(async (req, res) => res.status(201).json({ success: true, ...(await onboardingTeamService.create(req.user, req.body, req)) })));

router.patch('/team/:id', adminSensitive, [param('id').isMongoId(), body('active').isBoolean()], validate,
  wrap(async (req, res) => res.json({ success: true, ...(await onboardingTeamService.setActive(req.user, req.params.id, req.body.active, req)) })));

router.post('/team/:id/invite', adminSensitive, [param('id').isMongoId()], validate,
  wrap(async (req, res) => res.json({ success: true, ...(await onboardingTeamService.resendInvite(req.user, req.params.id, req)) })));

module.exports = router;
