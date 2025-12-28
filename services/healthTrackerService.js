/**
 * Health Tracker Service
 *
 * Handles diabetes and hypertension tracking:
 * - Manual entry of readings (RBS, HBA1C, BP)
 * - Configurable targets
 * - Chart data generation
 * - Trend analysis
 */

const HealthMetric = require('../models/healthMetric');
const HealthTarget = require('../models/healthTarget');
const {
  METRIC_TYPES,
  METRIC_UNITS,
  NORMAL_RANGES,
  TRACKER_TYPES,
  MEASUREMENT_SOURCES,
  DATA_SOURCES
} = require('../constants/healthConstants');

// Diabetes-related metric types
const DIABETES_METRICS = [
  METRIC_TYPES.BLOOD_SUGAR_RBS,
  METRIC_TYPES.BLOOD_SUGAR_FASTING,
  METRIC_TYPES.BLOOD_SUGAR_PP,
  METRIC_TYPES.HBA1C
];

// Hypertension-related metric types
const HYPERTENSION_METRICS = [
  METRIC_TYPES.BP_SYSTOLIC,
  METRIC_TYPES.BP_DIASTOLIC
];

/**
 * Record a diabetes reading
 */
const recordDiabetesReading = async (patientId, data) => {
  const { metricType, value, measuredAt, context, notes } = data;

  if (!DIABETES_METRICS.includes(metricType)) {
    throw new Error('Invalid metric type for diabetes tracker');
  }

  const metric = await HealthMetric.create({
    patient: patientId,
    metricType,
    value,
    unit: METRIC_UNITS[metricType],
    measuredAt: measuredAt ? new Date(measuredAt) : new Date(),
    measuredBy: {
      type: MEASUREMENT_SOURCES.PATIENT
    },
    source: {
      type: DATA_SOURCES.PATIENT_SELF
    },
    context,
    notes
  });

  // Get target and check value
  const target = await HealthTarget.getOrCreateTracker(patientId, TRACKER_TYPES.DIABETES);
  const targetCheck = target.checkValueAgainstTarget(metricType, value);

  return {
    metric,
    targetCheck
  };
};

/**
 * Record a blood pressure reading
 */
const recordBPReading = async (patientId, data) => {
  const { systolic, diastolic, measuredAt, context, notes } = data;

  if (!systolic || !diastolic) {
    throw new Error('Both systolic and diastolic values are required');
  }

  // Create systolic metric
  const systolicMetric = await HealthMetric.create({
    patient: patientId,
    metricType: METRIC_TYPES.BP_SYSTOLIC,
    value: systolic,
    unit: METRIC_UNITS[METRIC_TYPES.BP_SYSTOLIC],
    measuredAt: measuredAt ? new Date(measuredAt) : new Date(),
    measuredBy: {
      type: MEASUREMENT_SOURCES.PATIENT
    },
    source: {
      type: DATA_SOURCES.PATIENT_SELF
    },
    context,
    notes
  });

  // Create diastolic metric linked to systolic
  const diastolicMetric = await HealthMetric.create({
    patient: patientId,
    metricType: METRIC_TYPES.BP_DIASTOLIC,
    value: diastolic,
    unit: METRIC_UNITS[METRIC_TYPES.BP_DIASTOLIC],
    measuredAt: measuredAt ? new Date(measuredAt) : new Date(),
    measuredBy: {
      type: MEASUREMENT_SOURCES.PATIENT
    },
    source: {
      type: DATA_SOURCES.PATIENT_SELF
    },
    relatedMetricId: systolicMetric._id,
    context,
    notes
  });

  // Get target and check values
  const target = await HealthTarget.getOrCreateTracker(patientId, TRACKER_TYPES.HYPERTENSION);
  const systolicCheck = target.checkValueAgainstTarget(METRIC_TYPES.BP_SYSTOLIC, systolic);
  const diastolicCheck = target.checkValueAgainstTarget(METRIC_TYPES.BP_DIASTOLIC, diastolic);

  return {
    systolic: { metric: systolicMetric, targetCheck: systolicCheck },
    diastolic: { metric: diastolicMetric, targetCheck: diastolicCheck }
  };
};

/**
 * Get diabetes tracker data for charts
 */
const getDiabetesChartData = async (patientId, options = {}) => {
  const { startDate, endDate, period = 'day' } = options;

  // Calculate date range
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000); // Last 90 days

  // Get target configuration
  const target = await HealthTarget.getOrCreateTracker(patientId, TRACKER_TYPES.DIABETES);

  // Get data for each metric type
  const chartData = {};

  for (const metricType of DIABETES_METRICS) {
    const trends = await HealthMetric.getTrends(patientId, metricType, { startDate: start, endDate: end });
    const aggregated = await HealthMetric.getAggregatedTrends(patientId, metricType, period, { startDate: start, endDate: end });
    const metricTarget = target.getTargetForMetric(metricType);

    chartData[metricType] = {
      readings: trends.metrics.map(m => ({
        date: m.measuredAt,
        value: m.value,
        isAbnormal: m.isAbnormal,
        abnormalityLevel: m.abnormalityLevel
      })),
      aggregated: aggregated,
      stats: trends.stats,
      target: metricTarget ? {
        min: metricTarget.targetRange.min,
        max: metricTarget.targetRange.max,
        warningMin: metricTarget.targetRange.warningMin,
        warningMax: metricTarget.targetRange.warningMax,
        isCustom: metricTarget.isCustom
      } : null,
      unit: METRIC_UNITS[metricType],
      normalRange: NORMAL_RANGES[metricType]
    };
  }

  // Get latest readings
  const latestReadings = await HealthMetric.getLatestByType(patientId);
  const diabetesLatest = {};
  for (const metricType of DIABETES_METRICS) {
    if (latestReadings[metricType]) {
      diabetesLatest[metricType] = latestReadings[metricType];
    }
  }

  return {
    chartData,
    latestReadings: diabetesLatest,
    targets: target.targets.filter(t => DIABETES_METRICS.includes(t.metricType)),
    dateRange: { start, end },
    period
  };
};

/**
 * Get hypertension tracker data for charts
 */
const getHypertensionChartData = async (patientId, options = {}) => {
  const { startDate, endDate, period = 'day' } = options;

  // Calculate date range
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);

  // Get target configuration
  const target = await HealthTarget.getOrCreateTracker(patientId, TRACKER_TYPES.HYPERTENSION);

  // Get combined BP readings (systolic + diastolic)
  const bpReadings = await getBPReadingsCombined(patientId, start, end);

  // Get individual trends
  const systolicTrends = await HealthMetric.getTrends(patientId, METRIC_TYPES.BP_SYSTOLIC, { startDate: start, endDate: end });
  const diastolicTrends = await HealthMetric.getTrends(patientId, METRIC_TYPES.BP_DIASTOLIC, { startDate: start, endDate: end });

  // Get aggregated data
  const systolicAggregated = await HealthMetric.getAggregatedTrends(patientId, METRIC_TYPES.BP_SYSTOLIC, period, { startDate: start, endDate: end });
  const diastolicAggregated = await HealthMetric.getAggregatedTrends(patientId, METRIC_TYPES.BP_DIASTOLIC, period, { startDate: start, endDate: end });

  // Get targets
  const systolicTarget = target.getTargetForMetric(METRIC_TYPES.BP_SYSTOLIC);
  const diastolicTarget = target.getTargetForMetric(METRIC_TYPES.BP_DIASTOLIC);

  // Get latest readings
  const latestReadings = await HealthMetric.getLatestByType(patientId);

  return {
    chartData: {
      combined: bpReadings,
      systolic: {
        readings: systolicTrends.metrics.map(m => ({
          date: m.measuredAt,
          value: m.value,
          isAbnormal: m.isAbnormal,
          abnormalityLevel: m.abnormalityLevel
        })),
        aggregated: systolicAggregated,
        stats: systolicTrends.stats,
        target: systolicTarget ? {
          min: systolicTarget.targetRange.min,
          max: systolicTarget.targetRange.max,
          warningMin: systolicTarget.targetRange.warningMin,
          warningMax: systolicTarget.targetRange.warningMax,
          isCustom: systolicTarget.isCustom
        } : null,
        unit: METRIC_UNITS[METRIC_TYPES.BP_SYSTOLIC]
      },
      diastolic: {
        readings: diastolicTrends.metrics.map(m => ({
          date: m.measuredAt,
          value: m.value,
          isAbnormal: m.isAbnormal,
          abnormalityLevel: m.abnormalityLevel
        })),
        aggregated: diastolicAggregated,
        stats: diastolicTrends.stats,
        target: diastolicTarget ? {
          min: diastolicTarget.targetRange.min,
          max: diastolicTarget.targetRange.max,
          warningMin: diastolicTarget.targetRange.warningMin,
          warningMax: diastolicTarget.targetRange.warningMax,
          isCustom: diastolicTarget.isCustom
        } : null,
        unit: METRIC_UNITS[METRIC_TYPES.BP_DIASTOLIC]
      }
    },
    latestReadings: {
      systolic: latestReadings[METRIC_TYPES.BP_SYSTOLIC],
      diastolic: latestReadings[METRIC_TYPES.BP_DIASTOLIC]
    },
    targets: target.targets.filter(t => HYPERTENSION_METRICS.includes(t.metricType)),
    dateRange: { start, end },
    period
  };
};

/**
 * Get combined BP readings (systolic/diastolic pairs)
 */
const getBPReadingsCombined = async (patientId, startDate, endDate) => {
  const systolicReadings = await HealthMetric.find({
    patient: patientId,
    metricType: METRIC_TYPES.BP_SYSTOLIC,
    measuredAt: { $gte: startDate, $lte: endDate }
  }).sort({ measuredAt: 1 }).lean();

  const combined = [];

  for (const systolic of systolicReadings) {
    // Find matching diastolic reading
    const diastolic = await HealthMetric.findOne({
      patient: patientId,
      metricType: METRIC_TYPES.BP_DIASTOLIC,
      relatedMetricId: systolic._id
    }).lean();

    if (diastolic) {
      combined.push({
        date: systolic.measuredAt,
        systolic: systolic.value,
        diastolic: diastolic.value,
        isAbnormal: systolic.isAbnormal || diastolic.isAbnormal,
        context: systolic.context,
        notes: systolic.notes
      });
    } else {
      // Try to find by timestamp proximity
      const nearbyDiastolic = await HealthMetric.findOne({
        patient: patientId,
        metricType: METRIC_TYPES.BP_DIASTOLIC,
        measuredAt: {
          $gte: new Date(systolic.measuredAt.getTime() - 60000), // Within 1 minute
          $lte: new Date(systolic.measuredAt.getTime() + 60000)
        }
      }).lean();

      if (nearbyDiastolic) {
        combined.push({
          date: systolic.measuredAt,
          systolic: systolic.value,
          diastolic: nearbyDiastolic.value,
          isAbnormal: systolic.isAbnormal || nearbyDiastolic.isAbnormal,
          context: systolic.context,
          notes: systolic.notes
        });
      }
    }
  }

  return combined;
};

/**
 * Get tracker settings
 */
const getTrackerSettings = async (patientId, trackerType) => {
  const target = await HealthTarget.getOrCreateTracker(patientId, trackerType);
  return target;
};

/**
 * Update tracker target
 */
const updateTrackerTarget = async (patientId, trackerType, metricType, targetData, updatedBy, updatedByModel = 'Patient') => {
  return HealthTarget.updateMetricTarget(patientId, trackerType, metricType, targetData, updatedBy, updatedByModel);
};

/**
 * Reset tracker target to default
 */
const resetTrackerTarget = async (patientId, trackerType, metricType) => {
  return HealthTarget.resetMetricTarget(patientId, trackerType, metricType);
};

/**
 * Enable/disable tracker
 */
const toggleTracker = async (patientId, trackerType, isEnabled) => {
  const tracker = await HealthTarget.getOrCreateTracker(patientId, trackerType);
  tracker.isEnabled = isEnabled;
  return tracker.save();
};

/**
 * Update reminder settings
 */
const updateReminderSettings = async (patientId, trackerType, reminderSettings) => {
  const tracker = await HealthTarget.getOrCreateTracker(patientId, trackerType);
  tracker.reminders = {
    ...tracker.reminders,
    ...reminderSettings
  };
  return tracker.save();
};

/**
 * Get tracker summary
 */
const getTrackerSummary = async (patientId, trackerType) => {
  const target = await HealthTarget.getOrCreateTracker(patientId, trackerType);

  const metricTypes = trackerType === TRACKER_TYPES.DIABETES ? DIABETES_METRICS : HYPERTENSION_METRICS;

  // Get latest readings
  const latestReadings = await HealthMetric.getLatestByType(patientId);

  // Get readings from last 7 days
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const weeklyStats = {};

  for (const metricType of metricTypes) {
    const trends = await HealthMetric.getTrends(patientId, metricType, { startDate: weekAgo });
    weeklyStats[metricType] = trends.stats;
  }

  // Get abnormal readings count from last 30 days
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const abnormalCount = await HealthMetric.countDocuments({
    patient: patientId,
    metricType: { $in: metricTypes },
    isAbnormal: true,
    measuredAt: { $gte: monthAgo }
  });

  const totalCount = await HealthMetric.countDocuments({
    patient: patientId,
    metricType: { $in: metricTypes },
    measuredAt: { $gte: monthAgo }
  });

  return {
    trackerType,
    isEnabled: target.isEnabled,
    targets: target.targets.filter(t => metricTypes.includes(t.metricType)),
    latestReadings: Object.fromEntries(
      metricTypes
        .filter(type => latestReadings[type])
        .map(type => [type, latestReadings[type]])
    ),
    weeklyStats,
    monthlyStats: {
      totalReadings: totalCount,
      abnormalReadings: abnormalCount,
      abnormalPercentage: totalCount > 0 ? Math.round((abnormalCount / totalCount) * 100) : 0
    },
    reminders: target.reminders
  };
};

/**
 * Get all trackers summary for patient
 */
const getAllTrackersSummary = async (patientId) => {
  const [diabetesSummary, hypertensionSummary] = await Promise.all([
    getTrackerSummary(patientId, TRACKER_TYPES.DIABETES),
    getTrackerSummary(patientId, TRACKER_TYPES.HYPERTENSION)
  ]);

  return {
    diabetes: diabetesSummary,
    hypertension: hypertensionSummary
  };
};

/**
 * Get tracker target configuration
 */
const getTrackerTarget = async (patientId, trackerType) => {
  const target = await HealthTarget.getOrCreateTracker(patientId, trackerType);

  // Build ranges object based on tracker type
  let ranges = {};

  if (trackerType === TRACKER_TYPES.DIABETES) {
    const fastingTarget = target.targets.find(t => t.metricType === METRIC_TYPES.BLOOD_SUGAR_FASTING);
    const rbsTarget = target.targets.find(t => t.metricType === METRIC_TYPES.BLOOD_SUGAR_RBS);
    const ppTarget = target.targets.find(t => t.metricType === METRIC_TYPES.BLOOD_SUGAR_PP);
    const hba1cTarget = target.targets.find(t => t.metricType === METRIC_TYPES.HBA1C);

    ranges = {
      fasting: fastingTarget ? { min: fastingTarget.minValue, max: fastingTarget.maxValue } : { min: 70, max: 100 },
      rbs: rbsTarget ? { min: rbsTarget.minValue, max: rbsTarget.maxValue } : { min: 70, max: 140 },
      postPrandial: ppTarget ? { min: ppTarget.minValue, max: ppTarget.maxValue } : { min: 70, max: 180 },
      hba1c: hba1cTarget ? { max: hba1cTarget.maxValue, good: hba1cTarget.minValue || 6.5 } : { max: 7.0, good: 6.5 }
    };
  } else if (trackerType === TRACKER_TYPES.HYPERTENSION) {
    const systolicTarget = target.targets.find(t => t.metricType === METRIC_TYPES.BP_SYSTOLIC);
    const diastolicTarget = target.targets.find(t => t.metricType === METRIC_TYPES.BP_DIASTOLIC);

    ranges = {
      systolic: systolicTarget ? {
        min: systolicTarget.minValue || 90,
        max: systolicTarget.maxValue || 120,
        elevated: 129,
        high1: 139
      } : { min: 90, max: 120, elevated: 129, high1: 139 },
      diastolic: diastolicTarget ? {
        min: diastolicTarget.minValue || 60,
        max: diastolicTarget.maxValue || 80,
        high1: 89,
        high2: 90
      } : { min: 60, max: 80, high1: 89, high2: 90 }
    };
  }

  return {
    trackerType,
    ranges,
    reminders: target.reminders,
    isEnabled: target.isEnabled
  };
};

/**
 * Save tracker target configuration
 */
const saveTrackerTarget = async (patientId, trackerType, data) => {
  const { ranges, reminders } = data;
  const target = await HealthTarget.getOrCreateTracker(patientId, trackerType);

  // Update target ranges based on tracker type
  if (trackerType === TRACKER_TYPES.DIABETES && ranges) {
    if (ranges.fasting) {
      await updateTrackerTarget(patientId, TRACKER_TYPES.DIABETES, {
        metricType: METRIC_TYPES.BLOOD_SUGAR_FASTING,
        minValue: ranges.fasting.min,
        maxValue: ranges.fasting.max
      });
    }
    if (ranges.rbs) {
      await updateTrackerTarget(patientId, TRACKER_TYPES.DIABETES, {
        metricType: METRIC_TYPES.BLOOD_SUGAR_RBS,
        minValue: ranges.rbs.min,
        maxValue: ranges.rbs.max
      });
    }
    if (ranges.postPrandial) {
      await updateTrackerTarget(patientId, TRACKER_TYPES.DIABETES, {
        metricType: METRIC_TYPES.BLOOD_SUGAR_PP,
        minValue: ranges.postPrandial.min,
        maxValue: ranges.postPrandial.max
      });
    }
    if (ranges.hba1c) {
      await updateTrackerTarget(patientId, TRACKER_TYPES.DIABETES, {
        metricType: METRIC_TYPES.HBA1C,
        minValue: ranges.hba1c.good || 0,
        maxValue: ranges.hba1c.max
      });
    }
  } else if (trackerType === TRACKER_TYPES.HYPERTENSION && ranges) {
    if (ranges.systolic) {
      await updateTrackerTarget(patientId, TRACKER_TYPES.HYPERTENSION, {
        metricType: METRIC_TYPES.BP_SYSTOLIC,
        minValue: ranges.systolic.min,
        maxValue: ranges.systolic.max
      });
    }
    if (ranges.diastolic) {
      await updateTrackerTarget(patientId, TRACKER_TYPES.HYPERTENSION, {
        metricType: METRIC_TYPES.BP_DIASTOLIC,
        minValue: ranges.diastolic.min,
        maxValue: ranges.diastolic.max
      });
    }
  }

  // Update reminders if provided
  if (reminders) {
    await updateReminderSettings(patientId, trackerType, reminders);
  }

  // Return updated target
  return getTrackerTarget(patientId, trackerType);
};

module.exports = {
  recordDiabetesReading,
  recordBPReading,
  getDiabetesChartData,
  getHypertensionChartData,
  getTrackerSettings,
  updateTrackerTarget,
  resetTrackerTarget,
  toggleTracker,
  updateReminderSettings,
  getTrackerSummary,
  getAllTrackersSummary,
  getTrackerTarget,
  saveTrackerTarget,
  DIABETES_METRICS,
  HYPERTENSION_METRICS
};
