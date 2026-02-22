/**
 * Health Tracker Service
 *
 * Handles diabetes and hypertension tracking:
 * - Manual entry of readings (RBS, HBA1C, BP)
 * - Configurable targets
 * - Chart data generation
 * - Trend analysis
 */

const mongoose = require('mongoose');
const HealthMetric = require('../models/healthMetric');
const HealthTarget = require('../models/healthTarget');
const Patient = require('../models/patient');
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

  const patient = await Patient.findById(patientId).select('medicalHistory.conditions').lean();
  if (!patient) {
    throw new Error('Patient not found');
  }
  const hasDiabetes = (patient.medicalHistory?.conditions || []).some(
    c => c.name && c.name.toLowerCase().includes('diabetes')
  );
  if (!hasDiabetes) {
    throw new Error('Patient does not have a diabetes diagnosis. Add the condition to the patient profile before recording diabetes metrics.');
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

  const patient = await Patient.findById(patientId).select('medicalHistory.conditions').lean();
  if (!patient) {
    throw new Error('Patient not found');
  }
  const hasHypertension = (patient.medicalHistory?.conditions || []).some(
    c => c.name && c.name.toLowerCase().includes('hypertension')
  );
  if (!hasHypertension) {
    throw new Error('Patient does not have a hypertension diagnosis. Add the condition to the patient profile before recording BP metrics.');
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
 * Optimized: Uses Promise.all for parallel queries
 */
const getDiabetesChartData = async (patientId, options = {}) => {
  const { startDate, endDate, period = 'day' } = options;

  // Calculate date range
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000); // Last 90 days

  // Get target configuration and latest readings in parallel
  const [target, latestReadings] = await Promise.all([
    HealthTarget.getOrCreateTracker(patientId, TRACKER_TYPES.DIABETES),
    HealthMetric.getLatestByType(patientId)
  ]);

  // Fetch all metric data in parallel
  const metricPromises = DIABETES_METRICS.map(async (metricType) => {
    const [trends, aggregated] = await Promise.all([
      HealthMetric.getTrends(patientId, metricType, { startDate: start, endDate: end }),
      HealthMetric.getAggregatedTrends(patientId, metricType, period, { startDate: start, endDate: end })
    ]);

    const metricTarget = target.getTargetForMetric(metricType);

    return {
      metricType,
      data: {
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
      }
    };
  });

  const metricResults = await Promise.all(metricPromises);

  // Build chartData object
  const chartData = {};
  for (const { metricType, data } of metricResults) {
    chartData[metricType] = data;
  }

  // Filter latest readings for diabetes metrics
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
 * Optimized: Uses Promise.all for parallel queries
 */
const getHypertensionChartData = async (patientId, options = {}) => {
  const { startDate, endDate, period = 'day' } = options;

  // Calculate date range
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);

  // Run all queries in parallel
  const [
    target,
    bpReadings,
    systolicTrends,
    diastolicTrends,
    systolicAggregated,
    diastolicAggregated,
    latestReadings
  ] = await Promise.all([
    HealthTarget.getOrCreateTracker(patientId, TRACKER_TYPES.HYPERTENSION),
    getBPReadingsCombined(patientId, start, end),
    HealthMetric.getTrends(patientId, METRIC_TYPES.BP_SYSTOLIC, { startDate: start, endDate: end }),
    HealthMetric.getTrends(patientId, METRIC_TYPES.BP_DIASTOLIC, { startDate: start, endDate: end }),
    HealthMetric.getAggregatedTrends(patientId, METRIC_TYPES.BP_SYSTOLIC, period, { startDate: start, endDate: end }),
    HealthMetric.getAggregatedTrends(patientId, METRIC_TYPES.BP_DIASTOLIC, period, { startDate: start, endDate: end }),
    HealthMetric.getLatestByType(patientId)
  ]);

  // Get targets from the tracker
  const systolicTarget = target.getTargetForMetric(METRIC_TYPES.BP_SYSTOLIC);
  const diastolicTarget = target.getTargetForMetric(METRIC_TYPES.BP_DIASTOLIC);

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
 * Optimized: Fetches all readings in 2 queries instead of O(n) queries
 */
const getBPReadingsCombined = async (patientId, startDate, endDate) => {
  // Fetch both systolic and diastolic readings in parallel
  const [systolicReadings, diastolicReadings] = await Promise.all([
    HealthMetric.find({
      patient: patientId,
      metricType: METRIC_TYPES.BP_SYSTOLIC,
      measuredAt: { $gte: startDate, $lte: endDate }
    }).sort({ measuredAt: 1 }).lean(),
    HealthMetric.find({
      patient: patientId,
      metricType: METRIC_TYPES.BP_DIASTOLIC,
      measuredAt: { $gte: startDate, $lte: endDate }
    }).sort({ measuredAt: 1 }).lean()
  ]);

  // Create maps for quick lookup
  const diastolicByRelatedId = new Map();
  const diastolicByTime = new Map();

  for (const d of diastolicReadings) {
    if (d.relatedMetricId) {
      diastolicByRelatedId.set(d.relatedMetricId.toString(), d);
    }
    // Group by minute for proximity matching
    const timeKey = Math.floor(d.measuredAt.getTime() / 60000);
    if (!diastolicByTime.has(timeKey)) {
      diastolicByTime.set(timeKey, []);
    }
    diastolicByTime.get(timeKey).push(d);
  }

  const combined = [];

  for (const systolic of systolicReadings) {
    // First try to find by related ID
    let diastolic = diastolicByRelatedId.get(systolic._id.toString());

    // If not found, try timestamp proximity (within 1 minute)
    if (!diastolic) {
      const timeKey = Math.floor(systolic.measuredAt.getTime() / 60000);
      const nearby = [
        ...(diastolicByTime.get(timeKey - 1) || []),
        ...(diastolicByTime.get(timeKey) || []),
        ...(diastolicByTime.get(timeKey + 1) || [])
      ];

      // Find closest match within 1 minute
      for (const d of nearby) {
        const timeDiff = Math.abs(d.measuredAt.getTime() - systolic.measuredAt.getTime());
        if (timeDiff <= 60000) {
          diastolic = d;
          break;
        }
      }
    }

    if (diastolic) {
      combined.push({
        date: systolic.measuredAt,
        systolic: systolic.value,
        diastolic: diastolic.value,
        isAbnormal: systolic.isAbnormal || diastolic.isAbnormal,
        context: systolic.context,
        notes: systolic.notes
      });
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

  // Get total and abnormal counts atomically in a single aggregation
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [monthlyCounts] = await HealthMetric.aggregate([
    {
      $match: {
        patient: new mongoose.Types.ObjectId(patientId),
        metricType: { $in: metricTypes },
        measuredAt: { $gte: monthAgo }
      }
    },
    {
      $group: {
        _id: null,
        totalCount: { $sum: 1 },
        abnormalCount: {
          $sum: { $cond: [{ $eq: ['$isAbnormal', true] }, 1, 0] }
        }
      }
    }
  ]);
  const totalCount = monthlyCounts?.totalCount || 0;
  const abnormalCount = monthlyCounts?.abnormalCount || 0;

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
