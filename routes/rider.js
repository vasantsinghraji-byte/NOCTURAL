/**
 * Rider app (/api/v1/rider): go online, my deliveries (batched by store),
 * pickup → delivered with the customer's code, can't-take-it, earnings.
 */
const express = require('express');
const { body, param } = require('express-validator');
const { validate } = require('../middleware/validation');
const { protect, authorize } = require('../middleware/auth');
const riderService = require('../services/riderService');

const router = express.Router();
const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};
const rider = [protect, authorize('delivery_partner')];
const me = (req) => req.user._id || req.user.id;
const point = [body('lat').optional().isFloat({ min: -90, max: 90 }), body('lng').optional().isFloat({ min: -180, max: 180 })];

router.post('/online', rider, [body('online').isBoolean(), ...point], validate, wrap(async (req, res) => {
  res.json({ success: true, ...(await riderService.setOnline(me(req), req.body)) });
}));

// The app sends this every ~30 s while online.
router.post('/heartbeat', rider, [body('lat').isFloat({ min: -90, max: 90 }), body('lng').isFloat({ min: -180, max: 180 })], validate, wrap(async (req, res) => {
  res.json({ success: true, ...(await riderService.setOnline(me(req), { online: true, lat: req.body.lat, lng: req.body.lng })) });
}));

router.get('/jobs', rider, wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, batches: await riderService.myJobs(me(req)) });
}));

// Before the generic step route so "release" isn't read as a step.
router.post('/jobs/:orderId/release', rider, [param('orderId').isMongoId(), body('reason').optional().isString().isLength({ max: 200 })], validate, wrap(async (req, res) => {
  res.json({ success: true, ...(await riderService.release(me(req), req.params.orderId, req.body.reason)) });
}));

router.post(
  '/jobs/:orderId/:action',
  rider,
  [
    param('orderId').isMongoId(),
    param('action').isIn(['arrived-store', 'picked-up', 'arrived', 'delivered']),
    body('code').optional().isString().isLength({ max: 8 }),
    body('reason').optional().isString().isLength({ max: 200 })
  ],
  validate,
  wrap(async (req, res) => {
    res.json({ success: true, ...(await riderService.step(me(req), req.params.orderId, req.params.action, req.body)) });
  })
);

router.get('/earnings', rider, wrap(async (req, res) => {
  res.json({ success: true, ...(await riderService.earnings(me(req))) });
}));

module.exports = router;
