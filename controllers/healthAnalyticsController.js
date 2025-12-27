/**
 * Health Analytics Controller
 *
 * HTTP request handlers for health analytics endpoints.
 * Thin layer that delegates to healthMetricService.
 */

const healthMetricService = require('../services/healthMetricService');
const { ANALYTICS_PERIODS, METRIC_TYPES } = require('../constants/healthConstants');
const responseHelper = require('../utils/responseHelper');

/**
 * @desc    Get health trends
 * @route   GET /api/v1/health-analytics/trends
 * @access  Private (Patient)
 */
exports.getTrends = async (req, res, next) => {
  try {
    const patientId = req.healthAccess?.patientId || req.user._id;
    const { metricTypes, period, startDate, endDate } = req.query;

    // Parse metric types
    let types = [];
    if (metricTypes) {
      types = Array.isArray(metricTypes) ? metricTypes : metricTypes.split(',');
    } else {
      // Default to primary metrics
      types = [
        METRIC_TYPES.BP_SYSTOLIC,
        METRIC_TYPES.BP_DIASTOLIC,
        METRIC_TYPES.HEART_RATE,
        METRIC_TYPES.BLOOD_SUGAR
      ];
    }

    // Determine date range
    let dateRange;
    if (startDate && endDate) {
      dateRange = { startDate: new Date(startDate), endDate: new Date(endDate) };
    } else {
      dateRange = healthMetricService.getDateRangeForPeriod(period || ANALYTICS_PERIODS.MONTH);
    }

    const trends = await healthMetricService.getDashboardTrends(patientId, types, dateRange);

    responseHelper.sendSuccess(res, {
      period: period || ANALYTICS_PERIODS.MONTH,
      dateRange,
      trends
    }, 'Trends loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get specific metric trend
 * @route   GET /api/v1/health-analytics/trends/:metricType
 * @access  Private (Patient)
 */
exports.getMetricTrend = async (req, res, next) => {
  try {
    const patientId = req.healthAccess?.patientId || req.user._id;
    const { metricType } = req.params;
    const { period, startDate, endDate } = req.query;

    // Validate metric type
    if (!Object.values(METRIC_TYPES).includes(metricType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid metric type: ${metricType}`
      });
    }

    // Determine date range
    let dateRange;
    if (startDate && endDate) {
      dateRange = { startDate: new Date(startDate), endDate: new Date(endDate) };
    } else {
      dateRange = healthMetricService.getDateRangeForPeriod(period || ANALYTICS_PERIODS.MONTH);
    }

    const trend = await healthMetricService.getTrends(patientId, metricType, dateRange);

    responseHelper.sendSuccess(res, {
      metricType,
      period: period || ANALYTICS_PERIODS.MONTH,
      dateRange,
      trend
    }, 'Trend loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get health alerts (abnormal values)
 * @route   GET /api/v1/health-analytics/alerts
 * @access  Private (Patient)
 */
exports.getHealthAlerts = async (req, res, next) => {
  try {
    const patientId = req.healthAccess?.patientId || req.user._id;

    const alerts = await healthMetricService.getHealthAlerts(patientId);

    responseHelper.sendSuccess(res, { alerts }, 'Health alerts loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get comparison to normal ranges
 * @route   GET /api/v1/health-analytics/comparison
 * @access  Private (Patient)
 */
exports.getComparison = async (req, res, next) => {
  try {
    const patientId = req.healthAccess?.patientId || req.user._id;

    const comparison = await healthMetricService.getComparison(patientId);

    responseHelper.sendSuccess(res, { comparison }, 'Comparison loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get aggregated trends (for charts)
 * @route   GET /api/v1/health-analytics/aggregated
 * @access  Private (Patient)
 */
exports.getAggregatedTrends = async (req, res, next) => {
  try {
    const patientId = req.healthAccess?.patientId || req.user._id;
    const { metricType, period, groupBy } = req.query;

    if (!metricType) {
      return res.status(400).json({
        success: false,
        message: 'metricType is required'
      });
    }

    const dateRange = healthMetricService.getDateRangeForPeriod(period || ANALYTICS_PERIODS.MONTH);
    const HealthMetric = require('../models/healthMetric');

    const aggregated = await HealthMetric.getAggregatedTrends(
      patientId,
      metricType,
      dateRange,
      groupBy || 'day'
    );

    responseHelper.sendSuccess(res, {
      metricType,
      period: period || ANALYTICS_PERIODS.MONTH,
      dateRange,
      groupBy: groupBy || 'day',
      data: aggregated
    }, 'Aggregated trends loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get available periods
 * @route   GET /api/v1/health-analytics/periods
 * @access  Private (Patient)
 */
exports.getAvailablePeriods = async (req, res, next) => {
  try {
    const periods = Object.entries(ANALYTICS_PERIODS).map(([key, value]) => ({
      key,
      value,
      label: key.replace('_', ' ').toLowerCase()
    }));

    responseHelper.sendSuccess(res, { periods }, 'Available periods');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};
