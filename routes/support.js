/**
 * Support routes (/api/v1/support): "Call me back" for customers and the
 * admin queue that works them.
 */
const express = require('express');
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { protect, authorize, requireRecentAuth } = require('../middleware/auth');
const { protectBoth } = require('../middleware/patientAuth');
const supportService = require('../services/supportService');
const CallbackRequest = require('../models/callbackRequest');

const router = express.Router();
const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};
const patient = [protectBoth, authorize('patient')];
const admin = [protect, authorize('platform_admin')];
const pid = (req) => req.user._id || req.user.id;

router.post(
  '/callback',
  patient,
  [
    body('topic').optional().isIn(CallbackRequest.TOPICS),
    body('note').optional().isString().isLength({ max: 300 }),
    body('language').optional().isIn(['en', 'hi']),
    body('context.kind').optional().isIn(['VISIT', 'PLAN', 'LAB_ORDER', 'PHARMACY_ORDER']),
    body('context.id').optional().isMongoId()
  ],
  validate,
  wrap(async (req, res) => {
    const r = await supportService.requestCallback(pid(req), req.body);
    res.status(r.existing ? 200 : 201).json({ success: true, ...r });
  })
);

router.get('/callback', patient, wrap(async (req, res) => {
  res.json({ success: true, request: await supportService.myOpenCallback(pid(req)) });
}));

router.get('/admin/callbacks', admin, [query('status').optional().isIn([...CallbackRequest.STATUSES, 'ALL'])], validate, wrap(async (req, res) => {
  res.json({ success: true, requests: await supportService.adminList({ status: req.query.status || 'OPEN' }) });
}));

// Showing a customer's number needs a fresh sign-in, and is recorded.
router.post('/admin/callbacks/:id/reveal', admin, requireRecentAuth, [param('id').isMongoId()], validate, wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, ...(await supportService.adminReveal(pid(req), req.params.id)) });
}));

router.put(
  '/admin/callbacks/:id',
  admin,
  [param('id').isMongoId(), body('status').isIn(['OPEN', 'CALLED', 'CLOSED']), body('outcome').optional().isString().isLength({ max: 300 })],
  validate,
  wrap(async (req, res) => {
    res.json({ success: true, request: await supportService.adminUpdate(pid(req), req.params.id, req.body) });
  })
);

module.exports = router;
