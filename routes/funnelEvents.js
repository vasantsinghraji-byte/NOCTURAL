const express = require('express');
const { body, validationResult } = require('express-validator');
const funnelAnalyticsService = require('../services/funnelAnalyticsService');

const router = express.Router();

const validateEvent = [
  body('event')
    .trim()
    .notEmpty()
    .isLength({ max: 80 })
    .matches(/^[a-z0-9_:-]+$/i),
  body('path')
    .optional()
    .trim()
    .isLength({ max: 300 }),
  body('target')
    .optional()
    .trim()
    .isLength({ max: 300 })
];

router.post('/', validateEvent, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(204).send();
  }

  await funnelAnalyticsService.incrementEvent({
    event: req.body.event,
    path: req.body.path || req.get('referer') || '/',
    target: req.body.target || ''
  });

  return res.status(204).send();
});

module.exports = router;
