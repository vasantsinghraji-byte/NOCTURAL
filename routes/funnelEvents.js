const express = require('express');
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');

const router = express.Router();

const ALLOWED_EVENTS = [
  'book_home_care_click',
  'join_provider_click',
  'hospital_waitlist_click',
  'provider_registration_success',
  'hospital_waitlist_submit_attempt',
  'hospital_waitlist_submit_success'
];

router.post('/', [
  body('event').isIn(ALLOWED_EVENTS).withMessage('Invalid funnel event'),
  body('path').optional({ checkFalsy: true }).trim().isLength({ max: 160 }),
  body('target').optional({ checkFalsy: true }).trim().isLength({ max: 160 }),
  body('occurredAt').optional({ checkFalsy: true }).isISO8601(),
  body('metadata').optional().isObject()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(204).end();
  }

  logger.info('Public funnel event', {
    event: req.body.event,
    path: req.body.path || '',
    target: req.body.target || '',
    metadata: req.body.metadata || {},
    ip: req.ip
  });

  res.status(204).end();
});

module.exports = router;
