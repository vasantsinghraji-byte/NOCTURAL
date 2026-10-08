/**
 * Medicine refills (/api/v1/refills): set up from a delivered order, list,
 * change, pause / cancel, refill the cart, and record the refill order.
 */
const express = require('express');
const { body, param } = require('express-validator');
const { validate } = require('../middleware/validation');
const { authorize } = require('../middleware/auth');
const { protectBoth } = require('../middleware/patientAuth');
const refillService = require('../services/refillService');

const router = express.Router();
const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};
const patient = [protectBoth, authorize('patient')];
const me = (req) => req.user._id || req.user.id;
const id = param('id').isMongoId().withMessage('Not found');

router.get('/', patient, wrap(async (req, res) => {
  res.json({ success: true, refills: await refillService.listMine(me(req)) });
}));

router.post('/', patient, [body('orderId').isMongoId(), body('everyDays').optional().isIn([15, 30, 60, 90])], validate, wrap(async (req, res) => {
  res.status(201).json({ success: true, refill: await refillService.create(me(req), req.body) });
}));

router.put('/:id', patient, [id, body('everyDays').optional().isIn([15, 30, 60, 90]), body('status').optional().isIn(['ACTIVE', 'PAUSED', 'CANCELLED'])], validate, wrap(async (req, res) => {
  res.json({ success: true, refill: await refillService.update(me(req), req.params.id, req.body) });
}));

router.get('/:id/reorder', patient, [id], validate, wrap(async (req, res) => {
  res.json({ success: true, ...(await refillService.reorder(me(req), req.params.id)) });
}));

router.post('/:id/ordered', patient, [id, body('orderId').isMongoId()], validate, wrap(async (req, res) => {
  res.json({ success: true, refill: await refillService.markOrdered(me(req), req.params.id, req.body.orderId) });
}));

module.exports = router;
