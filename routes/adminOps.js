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
 * Manual badge changes still use PATCH /partners/admin/staff/:id/verification.
 */

const express = require('express');
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { protect, authorize, requireRecentAuth } = require('../middleware/auth');
const adminOpsService = require('../services/adminOpsService');
const campaignService = require('../services/campaignService');
const securityAuditService = require('../services/securityAuditService');
const logBuffer = require('../utils/logBuffer');
const partnerVerificationService = require('../services/partnerVerificationService');
const storageConfig = require('../config/storage');

const router = express.Router();
const admin = [protect, authorize('platform_admin')];
const adminSensitive = [...admin, requireRecentAuth];
const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};
// Admin data must never be cached by browsers or proxies.
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

router.get(
  '/logs',
  admin,
  [query('after').optional().isInt({ min: 0 }), query('level').optional().isIn(['error', 'warn', 'info', 'http', 'verbose', 'debug']), query('q').optional().isString().isLength({ max: 100 })],
  validate,
  wrap(async (req, res) => res.json({ success: true, ...logBuffer.query({ after: Number(req.query.after) || 0, level: req.query.level, q: req.query.q }) }))
);

router.get(
  '/payments',
  admin,
  [query(['from', 'to']).optional().isISO8601(), query('kind').optional().isIn(adminOpsService.KINDS)],
  validate,
  wrap(async (req, res) => res.json({ success: true, ...(await adminOpsService.paymentLog(req.query)) }))
);

const userParams = [param('type').isIn(['customers', 'partners']), param('id').isMongoId()];

router.get(
  '/users',
  admin,
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

router.get('/users/:type/:id', admin, userParams, validate,
  wrap(async (req, res) => res.json({ success: true, user: await adminOpsService.getUser(req.params.type, req.params.id) })));

router.post(
  '/users/:type/:id/reveal',
  adminSensitive,
  [...userParams, body('reason').isString().trim().isLength({ min: 3, max: 200 }).withMessage('Say why you need the contact details')],
  validate,
  wrap(async (req, res) => res.json({ success: true, contact: await adminOpsService.revealContact(req.params.type, req.params.id, req.user, req, req.body.reason) }))
);

router.patch(
  '/users/:type/:id/status',
  adminSensitive,
  [...userParams, body('active').isBoolean(), body('reason').isString().trim().isLength({ min: 3, max: 200 }).withMessage('Give a reason')],
  validate,
  wrap(async (req, res) => res.json({ success: true, ...(await adminOpsService.setActive(req.params.type, req.params.id, req.body.active, req.user, req, req.body.reason)) }))
);

router.get(
  '/verification',
  admin,
  [query('status').optional().isIn(['pending', 'verified', 'all']), query('q').optional().isString().isLength({ max: 80 })],
  validate,
  wrap(async (req, res) => res.json({ success: true, staff: await adminOpsService.listVerification(req.query) }))
);

router.get('/documents', admin, [query('status').optional().isIn(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'ALL'])], validate,
  wrap(async (req, res) => res.json({ success: true, documents: await partnerVerificationService.reviewQueue({ status: req.query.status || 'PENDING' }) })));

router.get('/documents/partner/:userId', admin, [param('userId').isMongoId()], validate,
  wrap(async (req, res) => res.json({ success: true, verification: await partnerVerificationService.getStatus(req.params.userId) })));

router.post('/documents/:id/view', adminSensitive, [param('id').isMongoId()], validate, wrap(async (req, res) => {
  const doc = await partnerVerificationService.fileFor(req.params.id);
  await securityAuditService.record({ event: 'admin_partner_document_viewed', actorId: req.user._id, actorType: 'user', targetType: 'user', targetId: doc.user, req, metadata: { documentId: req.params.id, kind: doc.kind } });
  if (storageConfig.USE_CLOUD) {
    const url = await storageConfig.getSignedUrl(doc.file.key, 120);
    if (!url) return res.status(404).json({ success: false, message: 'File not found' });
    return res.json({ success: true, url, mimeType: doc.file.mimeType, expiresInSeconds: 120 });
  }
  // Local development only: stream the file back as a data URL.
  const data = await require('fs').promises.readFile(storageConfig.resolveLocalFile(doc.file.key));
  return res.json({ success: true, url: `data:${doc.file.mimeType};base64,${data.toString('base64')}`, mimeType: doc.file.mimeType, expiresInSeconds: 0 });
}));

router.patch(
  '/documents/:id',
  adminSensitive,
  [param('id').isMongoId(), body('decision').isIn(['APPROVED', 'REJECTED']), body('note').optional().isString().trim().isLength({ max: 300 }), body('expiresAt').optional({ values: 'falsy' }).isISO8601()],
  validate,
  wrap(async (req, res) => {
    const result = await partnerVerificationService.review(req.params.id, req.user._id, req.body);
    await securityAuditService.record({
      event: req.body.decision === 'APPROVED' ? 'admin_partner_document_approved' : 'admin_partner_document_rejected',
      actorId: req.user._id, actorType: 'user', targetType: 'partner_document', targetId: req.params.id, req,
      metadata: { kind: result.document.kind, note: req.body.note }
    });
    res.json({ success: true, ...result });
  })
);

router.get('/campaigns', admin, wrap(async (req, res) => res.json({ success: true, campaigns: await campaignService.list() })));

router.post(
  '/campaigns',
  adminSensitive,
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

router.post(
  '/campaigns/:id/cancel',
  adminSensitive,
  [param('id').isMongoId()],
  validate,
  wrap(async (req, res) => {
    const campaign = await campaignService.cancel(req.params.id, req.user._id);
    await securityAuditService.record({ event: 'admin_campaign_cancelled', actorId: req.user._id, actorType: 'user', targetType: 'campaign', targetId: campaign._id, req });
    res.json({ success: true, campaign });
  })
);

module.exports = router;
