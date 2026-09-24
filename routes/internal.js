/**
 * Internal endpoints (mounted at /api/v1/internal). Not for browsers or apps.
 *
 * POST /tick: called every minute by an EventBridge schedule with the header
 * `x-cron-secret`. Runs the background sweeps (see services/cronService.js).
 * Returns 404 unless CRON_SECRET is configured, so it doesn't exist at all in
 * environments that don't use it.
 */

const express = require('express');
const router = express.Router();
const cronService = require('../services/cronService');
const logger = require('../utils/logger');

router.post('/tick', async (req, res) => {
  if (!process.env.CRON_SECRET) return res.status(404).json({ success: false, message: 'Not found' });
  if (!cronService.secretMatches(req.get('x-cron-secret'))) {
    logger.logSecurity('internal_tick_rejected', { ip: req.ip });
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  try {
    const result = await cronService.runTick();
    return res.json({ success: true, ...result });
  } catch (err) {
    logger.error('Internal tick failed', { error: err.message });
    return res.status(500).json({ success: false, message: 'Tick failed' });
  }
});

module.exports = router;
