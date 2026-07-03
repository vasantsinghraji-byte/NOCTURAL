/**
 * Health Analytics Routes
 *
 * Routes for health analytics and trends endpoints.
 * All routes require patient authentication.
 */

const express = require('express');
const router = express.Router();
const { protectPatient } = require('../middleware/patientAuth');
const { auditHealthAccess } = require('../middleware/healthDataAccess');
const healthAnalyticsController = require('../controllers/healthAnalyticsController');
const { validateAnalyticsQuery } = require('../validators/healthDataValidator');
const { ALLOWED_RESOURCES, AUDIT_ACTIONS } = require('../constants/healthConstants');

// All routes require patient authentication
router.use(protectPatient);

/**
 * @route   GET /api/v1/health-analytics/trends
 * @desc    Get health trends for multiple metrics
 * @access  Private (Patient)
 */
router.get(
  '/trends',
  validateAnalyticsQuery,
  auditHealthAccess(ALLOWED_RESOURCES.HEALTH_METRIC, AUDIT_ACTIONS.VIEW),
  healthAnalyticsController.getTrends
);

/**
 * @route   GET /api/v1/health-analytics/trends/:metricType
 * @desc    Get trend for specific metric type
 * @access  Private (Patient)
 */
router.get(
  '/trends/:metricType',
  validateAnalyticsQuery,
  auditHealthAccess(ALLOWED_RESOURCES.HEALTH_METRIC, AUDIT_ACTIONS.VIEW),
  healthAnalyticsController.getMetricTrend
);

/**
 * @route   GET /api/v1/health-analytics/alerts
 * @desc    Get health alerts (abnormal values)
 * @access  Private (Patient)
 */
router.get(
  '/alerts',
  auditHealthAccess(ALLOWED_RESOURCES.HEALTH_METRIC, AUDIT_ACTIONS.VIEW),
  healthAnalyticsController.getHealthAlerts
);

/**
 * @route   GET /api/v1/health-analytics/comparison
 * @desc    Get comparison to normal ranges
 * @access  Private (Patient)
 */
router.get(
  '/comparison',
  auditHealthAccess(ALLOWED_RESOURCES.HEALTH_METRIC, AUDIT_ACTIONS.VIEW),
  healthAnalyticsController.getComparison
);

/**
 * @route   GET /api/v1/health-analytics/aggregated
 * @desc    Get aggregated trends for charts
 * @access  Private (Patient)
 */
router.get(
  '/aggregated',
  validateAnalyticsQuery,
  auditHealthAccess(ALLOWED_RESOURCES.HEALTH_METRIC, AUDIT_ACTIONS.VIEW),
  healthAnalyticsController.getAggregatedTrends
);

/**
 * @route   GET /api/v1/health-analytics/periods
 * @desc    Get available analytics periods
 * @access  Private (Patient)
 */
router.get(
  '/periods',
  healthAnalyticsController.getAvailablePeriods
);

module.exports = router;
