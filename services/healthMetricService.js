/**
 * Health Metric Service
 *
 * Business logic for health metrics (vital readings).
 * Handles recording, retrieval, and trend analysis.
 */

const HealthMetric = require('../models/healthMetric');
const Patient = require('../models/patient');
const logger = require('../utils/logger');
const {
  METRIC_TYPES,
  METRIC_UNITS,
  NORMAL_RANGES,
  MEASUREMENT_SOURCES,
  DATA_SOURCES,
  ANALYTICS_PERIODS
} = require('../constants/healthConstants');
const { NotFoundError, ValidationError } = require('../utils/errors');

class HealthMetricService {
  /**
   * Record a single metric
   */
  async recordMetric(patientId, metricData, source = {}) {
    const patient = await Patient.findById(patientId);
    if (!patient) {
      throw new NotFoundError('Patient', patientId);
    }

    // Validate metric type
    if (!Object.values(METRIC_TYPES).includes(metricData.metricType)) {
      throw new ValidationError(`Invalid metric type: ${metricData.metricType}`);
    }

    const metric = new HealthMetric({
      patient: patientId,
      metricType: metricData.metricType,
      value: metricData.value,
      unit: metricData.unit || METRIC_UNITS[metricData.metricType],
      measuredAt: metricData.measuredAt || new Date(),
      measuredBy: metricData.measuredBy || {
        type: MEASUREMENT_SOURCES.PATIENT
      },
      source: {
        type: source.type || DATA_SOURCES.MANUAL_ENTRY,
        bookingId: source.bookingId
      },
      notes: metricData.notes,
      context: metricData.context
    });

    await metric.save();

    // Check if abnormal and update patient flag
    if (metric.isAbnormal) {
      patient.hasAbnormalMetrics = true;
      await patient.save();
    }

    logger.info('Health metric recorded', {
      patientId,
      metricType: metric.metricType,
      value: metric.value,
      isAbnormal: metric.isAbnormal
    });

    return metric;
  }

  /**
   * Record multiple metrics at once (e.g., from a booking)
   */
  async recordMultipleMetrics(patientId, metricsArray, source = {}) {
    const patient = await Patient.findById(patientId);
    if (!patient) {
      throw new NotFoundError('Patient', patientId);
    }

    const recordedMetrics = [];
    let hasAbnormal = false;

    for (const metricData of metricsArray) {
      try {
        const metric = await this.recordMetric(patientId, metricData, source);
        recordedMetrics.push(metric);
        if (metric.isAbnormal) {
          hasAbnormal = true;
        }
      } catch (error) {
        logger.warn('Failed to record metric', {
          patientId,
          metricType: metricData.metricType,
          error: error.message
        });
      }
    }

    if (hasAbnormal) {
      patient.hasAbnormalMetrics = true;
      await patient.save();
    }

    return recordedMetrics;
  }

  /**
   * Record vitals from a booking service report
   */
  async recordBookingVitals(patientId, bookingId, vitals, providerId) {
    return HealthMetric.recordBookingVitals(patientId, bookingId, vitals, providerId);
  }

  /**
   * Get metrics with filters
   */
  async getMetrics(patientId, filters = {}) {
    const { metricType, startDate, endDate, page = 1, limit = 50 } = filters;
    const skip = (page - 1) * limit;

    const query = { patient: patientId };

    if (metricType) {
      query.metricType = metricType;
    }

    if (startDate || endDate) {
      query.measuredAt = {};
      if (startDate) query.measuredAt.$gte = new Date(startDate);
      if (endDate) query.measuredAt.$lte = new Date(endDate);
    }

    const metrics = await HealthMetric.find(query)
      .sort({ measuredAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await HealthMetric.countDocuments(query);

    return {
      metrics,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get latest reading for each metric type
   */
  async getLatestByType(patientId) {
    return HealthMetric.getLatestByType(patientId);
  }

  /**
   * Get trends for a specific metric type
   */
  async getTrends(patientId, metricType, dateRange = {}) {
    return HealthMetric.getTrends(patientId, metricType, dateRange);
  }

  /**
   * Get trends by period (for charts)
   */
  async getTrendsByPeriod(patientId, metricType, period = ANALYTICS_PERIODS.MONTH) {
    const dateRange = this.getDateRangeForPeriod(period);
    return HealthMetric.getTrends(patientId, metricType, dateRange);
  }

  /**
   * Get aggregated trends (averaged by day/week/month)
   */
  async getAggregatedTrends(patientId, metricType, aggregation = 'day', period = ANALYTICS_PERIODS.MONTH) {
    const dateRange = this.getDateRangeForPeriod(period);
    return HealthMetric.getAggregatedTrends(patientId, metricType, aggregation, dateRange);
  }

  /**
   * Get abnormal metrics
   */
  async getAbnormalMetrics(patientId, dateRange = {}) {
    return HealthMetric.getAbnormalMetrics(patientId, dateRange);
  }

  /**
   * Get health alerts (recent abnormal values)
   */
  async getHealthAlerts(patientId) {
    const last7Days = {
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    };

    const abnormalMetrics = await this.getAbnormalMetrics(patientId, last7Days);

    // Group by metric type
    const alertsByType = {};
    for (const metric of abnormalMetrics) {
      if (!alertsByType[metric.metricType]) {
        alertsByType[metric.metricType] = [];
      }
      alertsByType[metric.metricType].push(metric);
    }

    // Build alerts summary
    const alerts = [];
    for (const [metricType, metrics] of Object.entries(alertsByType)) {
      const latestMetric = metrics[0]; // Already sorted by date desc
      const normalRange = NORMAL_RANGES[metricType];

      alerts.push({
        metricType,
        latestValue: latestMetric.value,
        unit: latestMetric.unit,
        abnormalityLevel: latestMetric.abnormalityLevel,
        measuredAt: latestMetric.measuredAt,
        occurrences: metrics.length,
        normalRange,
        message: this.getAlertMessage(metricType, latestMetric.value, latestMetric.abnormalityLevel, normalRange)
      });
    }

    // Sort by severity (CRITICAL first)
    alerts.sort((a, b) => {
      const severityOrder = { CRITICAL_HIGH: 0, CRITICAL_LOW: 1, HIGH: 2, LOW: 3 };
      return (severityOrder[a.abnormalityLevel] || 4) - (severityOrder[b.abnormalityLevel] || 4);
    });

    return alerts;
  }

  /**
   * Get date range for period
   */
  getDateRangeForPeriod(period) {
    const now = new Date();
    let startDate;

    switch (period) {
      case ANALYTICS_PERIODS.WEEK:
      case '7d':
        startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
        break;
      case ANALYTICS_PERIODS.MONTH:
      case '30d':
        startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
        break;
      case ANALYTICS_PERIODS.QUARTER:
      case '90d':
        startDate = new Date(now - 90 * 24 * 60 * 60 * 1000);
        break;
      case ANALYTICS_PERIODS.YEAR:
      case '1y':
        startDate = new Date(now - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
    }

    return { startDate, endDate: now };
  }

  /**
   * Generate alert message
   */
  getAlertMessage(metricType, value, level, normalRange) {
    const metricNames = {
      [METRIC_TYPES.BP_SYSTOLIC]: 'Blood Pressure (Systolic)',
      [METRIC_TYPES.BP_DIASTOLIC]: 'Blood Pressure (Diastolic)',
      [METRIC_TYPES.HEART_RATE]: 'Heart Rate',
      [METRIC_TYPES.TEMPERATURE]: 'Body Temperature',
      [METRIC_TYPES.OXYGEN_LEVEL]: 'Oxygen Level',
      [METRIC_TYPES.BLOOD_SUGAR]: 'Blood Sugar',
      [METRIC_TYPES.BMI]: 'BMI'
    };

    const metricName = metricNames[metricType] || metricType;

    if (level === 'CRITICAL_HIGH' || level === 'CRITICAL_LOW') {
      return `${metricName} is critically ${level.includes('HIGH') ? 'high' : 'low'} at ${value}. Seek medical attention.`;
    } else if (level === 'HIGH') {
      return `${metricName} is above normal range (${normalRange?.max}). Current: ${value}`;
    } else if (level === 'LOW') {
      return `${metricName} is below normal range (${normalRange?.min}). Current: ${value}`;
    }

    return `${metricName}: ${value}`;
  }

  /**
   * Get comprehensive health trends for dashboard
   */
  async getDashboardTrends(patientId, period = ANALYTICS_PERIODS.MONTH) {
    const dateRange = this.getDateRangeForPeriod(period);
    const primaryMetrics = [
      METRIC_TYPES.BP_SYSTOLIC,
      METRIC_TYPES.BP_DIASTOLIC,
      METRIC_TYPES.HEART_RATE,
      METRIC_TYPES.BLOOD_SUGAR,
      METRIC_TYPES.OXYGEN_LEVEL
    ];

    const trends = {};

    for (const metricType of primaryMetrics) {
      const trendData = await HealthMetric.getTrends(patientId, metricType, dateRange);
      if (trendData.metrics.length > 0) {
        trends[metricType] = trendData;
      }
    }

    return {
      period,
      dateRange,
      trends
    };
  }

  /**
   * Compare patient metrics to normal ranges
   */
  async getComparison(patientId) {
    const latestByType = await this.getLatestByType(patientId);
    const comparisons = [];

    for (const [metricType, metric] of Object.entries(latestByType)) {
      const normalRange = NORMAL_RANGES[metricType];
      if (!normalRange) continue;

      const isWithinRange = metric.value >= normalRange.min && metric.value <= normalRange.max;
      const percentageFromIdeal = this.calculatePercentageFromIdeal(
        metric.value,
        normalRange.min,
        normalRange.max
      );

      comparisons.push({
        metricType,
        value: metric.value,
        unit: metric.unit,
        normalRange,
        isWithinRange,
        percentageFromIdeal,
        status: metric.abnormalityLevel || 'NORMAL',
        measuredAt: metric.measuredAt
      });
    }

    return comparisons;
  }

  /**
   * Calculate percentage deviation from ideal range
   */
  calculatePercentageFromIdeal(value, min, max) {
    const idealMid = (min + max) / 2;
    const deviation = Math.abs(value - idealMid);
    const range = max - min;
    return Math.round((deviation / range) * 100);
  }

  /**
   * Clear abnormal metrics flag if all recent metrics are normal
   */
  async updateAbnormalMetricsFlag(patientId) {
    const last24Hours = {
      startDate: new Date(Date.now() - 24 * 60 * 60 * 1000)
    };

    const abnormalMetrics = await this.getAbnormalMetrics(patientId, last24Hours);

    const patient = await Patient.findById(patientId);
    if (patient) {
      patient.hasAbnormalMetrics = abnormalMetrics.length > 0;
      await patient.save();
    }

    return abnormalMetrics.length > 0;
  }
}

module.exports = new HealthMetricService();
