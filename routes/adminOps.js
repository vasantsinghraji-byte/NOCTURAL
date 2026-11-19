/**
 * Admin panel operations (platform_admin only).
 *
 *   GET   /admin/ops/logs                          live logs (redacted, this instance)
 *   GET   /admin/ops/payments                      payment log: payments, refunds, cash, failures, withdrawals
 *   GET   /admin/ops/users                         customers / partners, contact details masked
 *   GET   /admin/ops/users/:type/:id               one user, masked
 *   POST  /admin/ops/users/:type/:id/reveal        full email + phone (fresh 2FA, audited)
 *   PATCH /admin/ops/users/:type/:id/status        suspend / restore (fresh 2FA, audited)
 *   GET   /admin/ops/verification                  medical staff verification queue
 *   GET   /admin/ops/campaigns                     offer / announcement campaigns
 *   POST  /admin/ops/campaigns                     create (fresh 2FA, audited)
 *   POST  /admin/ops/campaigns/:id/cancel          stop a campaign (fresh 2FA, audited)
 *
 *   GET   /admin/ops/documents                     verification documents to review
 *   GET   /admin/ops/documents/partner/:userId     one partner's checklist
 *   POST  /admin/ops/documents/:id/view            short-lived link to the file (fresh 2FA, audited)
 *   PATCH /admin/ops/documents/:id                 approve / reject (fresh 2FA, audited)
 *
 *   GET   /admin/ops/heatmap?layer=pharmacy|care   demand vs free riders / nurses per ~1 km cell, zone surge
 *
 * Manual badge changes still use PATCH /partners/admin/staff/:id/verification.
 */

const express = require('express');
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { protect, requireRecentAuth } = require('../middleware/auth');
const { adminSection } = require('../middleware/adminAccess');
const { rolesForKinds } = require('../constants/adminAccess');
const mayVerify = (req, kind) => req.adminKinds === null || (req.adminKinds || []).includes(kind);
/** Staff checks are medical staff verification: only for reviewers of that partner type. */
const medicalStaffOnly = (req, res, next) => (mayVerify(req, 'MEDICAL_STAFF') ? next()
  : res.status(403).json({ success: false, message: 'You can’t verify nurses and physios. Ask the main admin.' }));
const adminOpsService = require('../services/adminOpsService');
const campaignService = require('../services/campaignService');
const securityAuditService = require('../services/securityAuditService');
const logBuffer = require('../utils/logBuffer');
const partnerVerificationService = require('../services/partnerVerificationService');

const router = express.Router();
// Admin endpoints: the admin section each belongs to (constants/adminAccess.js).
const area = (section) => [protect, adminSection(section)];
const areaSensitive = (section) => [...area(section), requireRecentAuth];
const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};
// Admin data must never be cached by browsers or proxies.
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

router.get('/logs', area("logs"),
  [query('after').optional().isInt({ min: 0 }), query('level').optional().isIn(['error', 'warn', 'info', 'http', 'verbose', 'debug']), query('q').optional().isString().isLength({ max: 100 })],
  validate,
  wrap(async (req, res) => res.json({ success: true, ...logBuffer.query({ after: Number(req.query.after) || 0, level: req.query.level, q: req.query.q }) }))
);

router.get('/heatmap', area("tower"),
  [query('layer').optional().isIn(['pharmacy', 'care']), query('precision').optional().isInt({ min: 5, max: 7 })],
  validate,
  wrap(async (req, res) => {
    const heatmapService = require('../services/heatmapService');
    const [map, zones] = await Promise.all([heatmapService.heatmap(req.query), heatmapService.zonesSummary()]);
    res.json({ success: true, ...map, zones });
  })
);

router.get('/payments', area("payments"),
  [query(['from', 'to']).optional().isISO8601(), query('kind').optional().isIn(adminOpsService.KINDS)],
  validate,
  wrap(async (req, res) => res.json({ success: true, ...(await adminOpsService.paymentLog(req.query)) }))
);

const userParams = [param('type').isIn(['customers', 'partners']), param('id').isMongoId()];

router.get('/users', area("users"),
  [
    query('type').optional().isIn(['customers', 'partners']),
    query('q').optional().isString().isLength({ max: 80 }),
    query('role').optional().isIn(adminOpsService.PARTNER_ROLES),
    query('active').optional().isIn(['true', 'false']),
    query(['page', 'limit']).optional().isInt({ min: 1, max: 1000 })
  ],
  validate,
  wrap(async (req, res) => res.json({ success: true, ...(await adminOpsService.listUsers(req.query)) }))
);

router.get('/users/:type/:id', area("users"), userParams, validate,
  wrap(async (req, res) => res.json({ success: true, user: await adminOpsService.getUser(req.params.type, req.params.id) })));

router.post('/users/:type/:id/reveal', areaSensitive("users"),
  [...userParams, body('reason').isString().trim().isLength({ min: 3, max: 200 }).withMessage('Say why you need the contact details')],
  validate,
  wrap(async (req, res) => res.json({ success: true, contact: await adminOpsService.revealContact(req.params.type, req.params.id, req.user, req, req.body.reason) }))
);

router.patch('/users/:type/:id/status', areaSensitive("users"),
  [...userParams, body('active').isBoolean(), body('reason').isString().trim().isLength({ min: 3, max: 200 }).withMessage('Give a reason')],
  validate,
  wrap(async (req, res) => res.json({ success: true, ...(await adminOpsService.setActive(req.params.type, req.params.id, req.body.active, req.user, req, req.body.reason)) }))
);

router.get('/verification', area("verification"), medicalStaffOnly,
  [query('status').optional().isIn(['pending', 'verified', 'all']), query('q').optional().isString().isLength({ max: 80 })],
  validate,
  wrap(async (req, res) => res.json({ success: true, staff: await adminOpsService.listVerification(req.query) }))
);

router.get('/documents', area("documents"), [query('status').optional().isIn(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'ALL'])], validate,
  wrap(async (req, res) => res.json({ success: true, documents: await partnerVerificationService.reviewQueue({ status: req.query.status || 'PENDING', roles: rolesForKinds(req.adminKinds) }) })));

router.get('/documents/partner/:userId', area("documents"), [param('userId').isMongoId()], validate,
  wrap(async (req, res) => {
    await partnerVerificationService.assertInScope({ userId: req.params.userId }, rolesForKinds(req.adminKinds));
    res.json({ success: true, verification: await partnerVerificationService.getStatus(req.params.userId) });
  }));

router.post('/documents/:id/view', areaSensitive("documents"), [param('id').isMongoId()], validate, wrap(async (req, res) => {
  await partnerVerificationService.assertInScope({ docId: req.params.id }, rolesForKinds(req.adminKinds));
  const doc = await partnerVerificationService.fileFor(req.params.id);
  await securityAuditService.record({ event: 'admin_partner_document_viewed', actorId: req.user._id, actorType: 'user', targetType: 'user', targetId: doc.user, req, metadata: { documentId: req.params.id, kind: doc.kind } });
  const link = await partnerVerificationService.fileLink(doc);
  if (!link) return res.status(404).json({ success: false, message: 'File not found' });
  return res.json({ success: true, ...link });
}));

router.patch('/documents/:id', areaSensitive("documents"),
  [param('id').isMongoId(), body('decision').isIn(['APPROVED', 'REJECTED']), body('note').optional().isString().trim().isLength({ max: 300 }), body('expiresAt').optional({ values: 'falsy' }).isISO8601()],
  validate,
  wrap(async (req, res) => {
    await partnerVerificationService.assertInScope({ docId: req.params.id }, rolesForKinds(req.adminKinds));
    const result = await partnerVerificationService.review(req.params.id, req.user._id, req.body);
    await securityAuditService.record({
      event: req.body.decision === 'APPROVED' ? 'admin_partner_document_approved' : 'admin_partner_document_rejected',
      actorId: req.user._id, actorType: 'user', targetType: 'partner_document', targetId: req.params.id, req,
      metadata: { kind: result.document.kind, note: req.body.note }
    });
    res.json({ success: true, ...result });
  })
);

router.get('/campaigns', area("campaigns"), wrap(async (req, res) => res.json({ success: true, campaigns: await campaignService.list() })));

router.post('/campaigns', areaSensitive("campaigns"),
  [
    body('title').isString().trim().isLength({ min: 3, max: 80 }),
    body('body').isString().trim().isLength({ min: 3, max: 300 }),
    body('audience').isIn(campaignService.AUDIENCES),
    body(['sendAt', 'expiresAt']).optional({ values: 'falsy' }).isISO8601(),
    body('push').optional().isBoolean(),
    body('offerCode').optional({ values: 'falsy' }).isString().trim().matches(/^[A-Za-z0-9-]{3,20}$/).withMessage('Offer code: 3–20 letters, numbers or dashes'),
    body('cta.label').optional({ values: 'falsy' }).isString().trim().isLength({ max: 24 }),
    body('cta.path').optional({ values: 'falsy' }).isString().trim().matches(/^\/(?!\/)[A-Za-z0-9\-/_?=&.]*$/).withMessage('The button must link to a Nabz page, e.g. /pharmacy')
  ],
  validate,
  wrap(async (req, res) => {
    const campaign = await campaignService.create(req.body, req.user._id);
    await securityAuditService.record({
      event: 'admin_campaign_created', actorId: req.user._id, actorType: 'user', targetType: 'campaign', targetId: campaign._id, req,
      metadata: { audience: campaign.audience, push: campaign.push.status !== 'OFF', title: campaign.title }
    });
    res.status(201).json({ success: true, campaign });
  })
);

router.post('/campaigns/:id/cancel', areaSensitive("campaigns"),
  [param('id').isMongoId()],
  validate,
  wrap(async (req, res) => {
    const campaign = await campaignService.cancel(req.params.id, req.user._id);
    await securityAuditService.record({ event: 'admin_campaign_cancelled', actorId: req.user._id, actorType: 'user', targetType: 'campaign', targetId: campaign._id, req });
    res.json({ success: true, campaign });
  })
);

module.exports = router;
