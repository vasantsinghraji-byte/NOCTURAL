/**
 * Security Monitoring Dashboard Routes
 * Real-time security metrics, alerts, and incident tracking
 */

const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const securityMonitor = require('../utils/securityMonitor');
const logger = require('../utils/logger');

/**
 * @route   GET /api/security/dashboard
 * @desc    Get security dashboard overview
 * @access  Admin only
 */
router.get('/dashboard', protect, authorize('admin'), async (req, res) => {
  try {
    const dashboard = await securityMonitor.getDashboard();

    res.json({
      success: true,
      data: dashboard
    });
  } catch (error) {
    logger.error('Error fetching security dashboard', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch security dashboard'
    });
  }
});

/**
 * @route   GET /api/security/metrics
 * @desc    Get real-time security metrics
 * @access  Admin only
 */
router.get('/metrics', protect, authorize('admin'), async (req, res) => {
  try {
    const { timeRange = '24h' } = req.query;

    const metrics = await securityMonitor.getMetrics(timeRange);

    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    logger.error('Error fetching security metrics', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch security metrics'
    });
  }
});

/**
 * @route   GET /api/security/incidents
 * @desc    Get security incidents log
 * @access  Admin only
 */
router.get('/incidents', protect, authorize('admin'), async (req, res) => {
  try {
    const { severity, status, page = 1, limit = 50 } = req.query;

    const incidents = await securityMonitor.getIncidents({
      severity,
      status,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      data: incidents.data,
      pagination: incidents.pagination
    });
  } catch (error) {
    logger.error('Error fetching security incidents', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch security incidents'
    });
  }
});

/**
 * @route   GET /api/security/incidents/:id
 * @desc    Get specific incident details
 * @access  Admin only
 */
router.get('/incidents/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const incident = await securityMonitor.getIncidentById(req.params.id);

    if (!incident) {
      return res.status(404).json({
        success: false,
        error: 'Incident not found'
      });
    }

    res.json({
      success: true,
      data: incident
    });
  } catch (error) {
    logger.error('Error fetching incident', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch incident'
    });
  }
});

/**
 * @route   POST /api/security/incidents/:id/resolve
 * @desc    Mark incident as resolved
 * @access  Admin only
 */
router.post('/incidents/:id/resolve', protect, authorize('admin'), async (req, res) => {
  try {
    const { resolution, notes } = req.body;

    const incident = await securityMonitor.resolveIncident(req.params.id, {
      resolution,
      notes,
      resolvedBy: req.user.id
    });

    res.json({
      success: true,
      message: 'Incident resolved',
      data: incident
    });
  } catch (error) {
    logger.error('Error resolving incident', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to resolve incident'
    });
  }
});

/**
 * @route   GET /api/security/blocked-ips
 * @desc    Get list of blocked IPs
 * @access  Admin only
 */
router.get('/blocked-ips', protect, authorize('admin'), async (req, res) => {
  try {
    const blockedIPs = await securityMonitor.getBlockedIPs();

    res.json({
      success: true,
      data: blockedIPs
    });
  } catch (error) {
    logger.error('Error fetching blocked IPs', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch blocked IPs'
    });
  }
});

/**
 * @route   POST /api/security/blocked-ips
 * @desc    Manually block an IP address
 * @access  Admin only
 */
router.post('/blocked-ips', protect, authorize('admin'), async (req, res) => {
  try {
    const { ip, reason, duration } = req.body;

    if (!ip) {
      return res.status(400).json({
        success: false,
        error: 'IP address is required'
      });
    }

    await securityMonitor.blockIP(ip, {
      reason,
      duration,
      blockedBy: req.user.id
    });

    res.json({
      success: true,
      message: 'IP address blocked'
    });
  } catch (error) {
    logger.error('Error blocking IP', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to block IP'
    });
  }
});

/**
 * @route   DELETE /api/security/blocked-ips/:ip
 * @desc    Unblock an IP address
 * @access  Admin only
 */
router.delete('/blocked-ips/:ip', protect, authorize('admin'), async (req, res) => {
  try {
    await securityMonitor.unblockIP(req.params.ip);

    res.json({
      success: true,
      message: 'IP address unblocked'
    });
  } catch (error) {
    logger.error('Error unblocking IP', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to unblock IP'
    });
  }
});

/**
 * @route   GET /api/security/threats
 * @desc    Get threat intelligence summary
 * @access  Admin only
 */
router.get('/threats', protect, authorize('admin'), async (req, res) => {
  try {
    const threats = await securityMonitor.getThreatSummary();

    res.json({
      success: true,
      data: threats
    });
  } catch (error) {
    logger.error('Error fetching threat summary', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch threat summary'
    });
  }
});

/**
 * @route   GET /api/security/audit-log
 * @desc    Get security audit log
 * @access  Admin only
 */
router.get('/audit-log', protect, authorize('admin'), async (req, res) => {
  try {
    const { action, userId, page = 1, limit = 100 } = req.query;

    const auditLog = await securityMonitor.getAuditLog({
      action,
      userId,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      data: auditLog.data,
      pagination: auditLog.pagination
    });
  } catch (error) {
    logger.error('Error fetching audit log', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch audit log'
    });
  }
});

/**
 * @route   GET /api/security/rate-limits
 * @desc    Get rate limit statistics
 * @access  Admin only
 */
router.get('/rate-limits', protect, authorize('admin'), async (req, res) => {
  try {
    const { getRateLimitStats } = require('../middleware/rateLimitEnhanced');
    const stats = await getRateLimitStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error fetching rate limit stats', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch rate limit statistics'
    });
  }
});

/**
 * @route   POST /api/security/rate-limits/reset
 * @desc    Reset rate limit for a specific key
 * @access  Admin only
 */
router.post('/rate-limits/reset', protect, authorize('admin'), async (req, res) => {
  try {
    const { key } = req.body;

    if (!key) {
      return res.status(400).json({
        success: false,
        error: 'Key is required'
      });
    }

    const { resetRateLimit } = require('../middleware/rateLimitEnhanced');
    const result = await resetRateLimit(key);

    res.json({
      success: result,
      message: result ? 'Rate limit reset' : 'Failed to reset rate limit'
    });
  } catch (error) {
    logger.error('Error resetting rate limit', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to reset rate limit'
    });
  }
});

/**
 * @route   GET /api/security/health
 * @desc    Get security health status
 * @access  Admin only
 */
router.get('/health', protect, authorize('admin'), async (req, res) => {
  try {
    const health = await securityMonitor.getHealthStatus();

    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    logger.error('Error fetching security health', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch security health'
    });
  }
});

module.exports = router;
