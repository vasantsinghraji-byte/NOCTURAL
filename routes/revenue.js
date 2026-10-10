/**
 * Revenue reporting (platform operators only).
 * Hospital-scoped `admin` accounts can't see marketplace-wide revenue.
 *   GET /admin/revenue/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   GET /admin/revenue/payouts   pending partner payouts (weekly payout run input)
 *   GET /admin/revenue/policy    current rates and fees (config/revenue.js)
 */

const express = require('express');
const { query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { protect, authorize } = require('../middleware/auth');
const settlementService = require('../services/settlementService');
const { getRevenuePolicy } = require('../config/revenue');

const router = express.Router();
router.use(protect, authorize('platform_admin'));

router.get(
  '/summary',
  [query('from').optional().isISO8601(), query('to').optional().isISO8601()],
  validate,
  async (req, res, next) => {
    try {
      res.json({ success: true, summary: await settlementService.getSummary({ from: req.query.from, to: req.query.to }) });
    } catch (error) {
      next(error);
    }
  }
);

router.get('/payouts', async (req, res, next) => {
  try {
    res.json({ success: true, payouts: await settlementService.getPendingPayouts() });
  } catch (error) {
    next(error);
  }
});

router.get('/policy', (req, res) => {
  res.json({ success: true, policy: getRevenuePolicy() });
});

module.exports = router;
