/**
 * Care Circle and care logs.
 *   /api/v1/family/...          the customer's family links and a member's care
 *   /api/v1/family/care-log/... visit care logs (professional writes, family reads)
 */
const express = require('express');
const { body, param } = require('express-validator');
const { validate } = require('../middleware/validation');
const { protect, authorize } = require('../middleware/auth');
const { protectBoth } = require('../middleware/patientAuth');
const familyService = require('../services/familyService');
const careLogService = require('../services/careLogService');
const CareLog = require('../models/careLog');

const router = express.Router();
const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};
const patient = [protectBoth, authorize('patient')];
const staff = [protect, authorize('nurse', 'physiotherapist', 'medical_staff')];
const me = (req) => req.user._id || req.user.id;
const id = (name) => param(name).isMongoId().withMessage('Not found');

// ── Care Circle ─────────────────────────────────────────────────────────────
router.get('/', patient, wrap(async (req, res) => {
  res.json({ success: true, ...(await familyService.listMine(me(req))) });
}));

router.post('/invite', patient, [body('phone').isString().isLength({ min: 10, max: 16 }), body('relation').optional().isString().isLength({ max: 40 })], validate, wrap(async (req, res) => {
  res.status(201).json({ success: true, link: await familyService.invite(me(req), req.body) });
}));

router.post('/:linkId/accept', patient, [id('linkId')], validate, wrap(async (req, res) => {
  res.json({ success: true, link: await familyService.respond(me(req), req.params.linkId, true) });
}));

router.post('/:linkId/decline', patient, [id('linkId')], validate, wrap(async (req, res) => {
  res.json({ success: true, link: await familyService.respond(me(req), req.params.linkId, false) });
}));

router.delete('/:linkId', patient, [id('linkId')], validate, wrap(async (req, res) => {
  res.json({ success: true, ...(await familyService.remove(me(req), req.params.linkId)) });
}));

router.get('/members/:memberId/care', patient, [id('memberId')], validate, wrap(async (req, res) => {
  res.json({ success: true, ...(await familyService.memberCare(me(req), req.params.memberId)) });
}));

// ── Care logs ───────────────────────────────────────────────────────────────
router.get('/care-log/visit/:bookingId', patient, [id('bookingId')], validate, wrap(async (req, res) => {
  res.json({ success: true, log: await careLogService.getForPatient(me(req), req.params.bookingId) });
}));

router.get('/care-log/plan/:planId', patient, [id('planId')], validate, wrap(async (req, res) => {
  res.json({ success: true, logs: await careLogService.planLogs(me(req), req.params.planId) });
}));

router.get('/care-log/staff/:bookingId', staff, [id('bookingId')], validate, wrap(async (req, res) => {
  res.json({ success: true, log: await careLogService.getForStaff(me(req), req.params.bookingId) });
}));

router.post(
  '/care-log/staff/:bookingId',
  staff,
  [id('bookingId'), body('kind').isIn(CareLog.KINDS), body('text').optional().isString().isLength({ max: 300 }), body('vitals').optional().isObject()],
  validate,
  wrap(async (req, res) => {
    res.status(201).json({ success: true, log: await careLogService.addEntry(me(req), req.params.bookingId, req.body) });
  })
);

module.exports = router;
