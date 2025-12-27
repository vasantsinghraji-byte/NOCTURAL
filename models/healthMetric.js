/**
 * Health Metric Model
 *
 * Individual vital readings with timestamps for trend analysis.
 * Append-only - metrics are never deleted or modified.
 */

const mongoose = require('mongoose');
const {
  METRIC_TYPES,
  METRIC_UNITS,
  NORMAL_RANGES,
  ABNORMALITY_LEVELS,
  MEASUREMENT_SOURCES,
  DATA_SOURCES
} = require('../constants/healthConstants');

// Measured by sub-schema
const MeasuredBySchema = new mongoose.Schema({
  type: {
    type: String,
    enum: Object.values(MEASUREMENT_SOURCES),
    required: true,
    default: MEASUREMENT_SOURCES.PATIENT
  },
  providerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  providerName: String,
  deviceId: String,
  deviceName: String
}, { _id: false });

// Source tracking sub-schema
const SourceSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: Object.values(DATA_SOURCES),
    required: true,
    default: DATA_SOURCES.MANUAL_ENTRY
  },
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'NurseBooking'
  },
  healthRecordId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'HealthRecord'
  }
}, { _id: false });

// Normal range sub-schema (stored with each reading for historical accuracy)
const NormalRangeSchema = new mongoose.Schema({
  min: Number,
  max: Number
}, { _id: false });

const HealthMetricSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
    index: true
  },

  metricType: {
    type: String,
    enum: Object.values(METRIC_TYPES),
    required: true,
    index: true
  },

  value: {
    type: Number,
    required: true
  },

  unit: {
    type: String,
    required: true
  },

  // When the measurement was taken (not when recorded)
  measuredAt: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },

  // Who/what took the measurement
  measuredBy: MeasuredBySchema,

  // Source of this metric
  source: SourceSchema,

  // Normal range at time of measurement (for historical accuracy)
  normalRange: NormalRangeSchema,

  // Computed abnormality flags
  isAbnormal: {
    type: Boolean,
    default: false,
    index: true
  },
  abnormalityLevel: {
    type: String,
    enum: Object.values(ABNORMALITY_LEVELS)
  },

  // Additional context
  notes: String,
  context: {
    type: String,
    enum: ['FASTING', 'POST_MEAL', 'RESTING', 'POST_EXERCISE', 'UNDER_STRESS', 'OTHER']
  },

  // For blood pressure, we might want to store both values together
  relatedMetricId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'HealthMetric'
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
HealthMetricSchema.index({ patient: 1, metricType: 1, measuredAt: -1 }); // Trends query
HealthMetricSchema.index({ patient: 1, measuredAt: -1 }); // All metrics timeline
HealthMetricSchema.index({ patient: 1, isAbnormal: 1, measuredAt: -1 }); // Abnormal values
HealthMetricSchema.index({ 'source.bookingId': 1 }); // Booking metrics

// Pre-save: Set unit from constant if not provided
HealthMetricSchema.pre('save', function(next) {
  // Set unit from constant if not provided
  if (!this.unit && METRIC_UNITS[this.metricType]) {
    this.unit = METRIC_UNITS[this.metricType];
  }

  // Set normal range from constant if not provided
  if (!this.normalRange && NORMAL_RANGES[this.metricType]) {
    this.normalRange = NORMAL_RANGES[this.metricType];
  }

  // Calculate abnormality
  if (this.normalRange) {
    const { min, max } = this.normalRange;
    if (this.value < min * 0.75) {
      this.isAbnormal = true;
      this.abnormalityLevel = ABNORMALITY_LEVELS.CRITICAL_LOW;
    } else if (this.value < min) {
      this.isAbnormal = true;
      this.abnormalityLevel = ABNORMALITY_LEVELS.LOW;
    } else if (this.value > max * 1.25) {
      this.isAbnormal = true;
      this.abnormalityLevel = ABNORMALITY_LEVELS.CRITICAL_HIGH;
    } else if (this.value > max) {
      this.isAbnormal = true;
      this.abnormalityLevel = ABNORMALITY_LEVELS.HIGH;
    } else {
      this.isAbnormal = false;
      this.abnormalityLevel = ABNORMALITY_LEVELS.NORMAL;
    }
  }

  next();
});

// Static: Record a metric
HealthMetricSchema.statics.recordMetric = async function(patientId, metricData) {
  const metric = new this({
    patient: patientId,
    ...metricData
  });
  return metric.save();
};

// Static: Record multiple metrics from a booking
HealthMetricSchema.statics.recordBookingVitals = async function(patientId, bookingId, vitals, providerId) {
  const metrics = [];
  const source = {
    type: DATA_SOURCES.BOOKING,
    bookingId
  };
  const measuredBy = {
    type: MEASUREMENT_SOURCES.PROVIDER,
    providerId
  };

  // Parse blood pressure (format: "120/80")
  if (vitals.bloodPressure) {
    const [systolic, diastolic] = vitals.bloodPressure.split('/').map(Number);
    if (systolic && diastolic) {
      const systolicMetric = await this.create({
        patient: patientId,
        metricType: METRIC_TYPES.BP_SYSTOLIC,
        value: systolic,
        unit: METRIC_UNITS[METRIC_TYPES.BP_SYSTOLIC],
        source,
        measuredBy
      });
      const diastolicMetric = await this.create({
        patient: patientId,
        metricType: METRIC_TYPES.BP_DIASTOLIC,
        value: diastolic,
        unit: METRIC_UNITS[METRIC_TYPES.BP_DIASTOLIC],
        source,
        measuredBy,
        relatedMetricId: systolicMetric._id
      });
      metrics.push(systolicMetric, diastolicMetric);
    }
  }

  // Heart rate
  if (vitals.heartRate) {
    metrics.push(await this.create({
      patient: patientId,
      metricType: METRIC_TYPES.HEART_RATE,
      value: vitals.heartRate,
      unit: METRIC_UNITS[METRIC_TYPES.HEART_RATE],
      source,
      measuredBy
    }));
  }

  // Temperature
  if (vitals.temperature) {
    metrics.push(await this.create({
      patient: patientId,
      metricType: METRIC_TYPES.TEMPERATURE,
      value: vitals.temperature,
      unit: METRIC_UNITS[METRIC_TYPES.TEMPERATURE],
      source,
      measuredBy
    }));
  }

  // Oxygen level
  if (vitals.oxygenLevel) {
    metrics.push(await this.create({
      patient: patientId,
      metricType: METRIC_TYPES.OXYGEN_LEVEL,
      value: vitals.oxygenLevel,
      unit: METRIC_UNITS[METRIC_TYPES.OXYGEN_LEVEL],
      source,
      measuredBy
    }));
  }

  // Blood sugar
  if (vitals.bloodSugar) {
    metrics.push(await this.create({
      patient: patientId,
      metricType: METRIC_TYPES.BLOOD_SUGAR,
      value: vitals.bloodSugar,
      unit: METRIC_UNITS[METRIC_TYPES.BLOOD_SUGAR],
      source,
      measuredBy
    }));
  }

  return metrics;
};

// Static: Get latest reading for each metric type
HealthMetricSchema.statics.getLatestByType = async function(patientId) {
  const metricTypes = Object.values(METRIC_TYPES);
  const results = {};

  for (const metricType of metricTypes) {
    const latest = await this.findOne({
      patient: patientId,
      metricType
    })
      .sort({ measuredAt: -1 })
      .lean();

    if (latest) {
      results[metricType] = latest;
    }
  }

  return results;
};

// Static: Get trends for a specific metric type
HealthMetricSchema.statics.getTrends = async function(patientId, metricType, dateRange = {}) {
  const { startDate, endDate } = dateRange;

  const query = {
    patient: patientId,
    metricType
  };

  if (startDate) {
    query.measuredAt = { $gte: new Date(startDate) };
  }
  if (endDate) {
    query.measuredAt = { ...query.measuredAt, $lte: new Date(endDate) };
  }

  const metrics = await this.find(query)
    .sort({ measuredAt: 1 })
    .select('value measuredAt isAbnormal abnormalityLevel normalRange')
    .lean();

  // Calculate statistics
  if (metrics.length === 0) {
    return {
      metrics: [],
      stats: null
    };
  }

  const values = metrics.map(m => m.value);
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const abnormalCount = metrics.filter(m => m.isAbnormal).length;

  return {
    metrics,
    stats: {
      count: metrics.length,
      average: Math.round(avg * 10) / 10,
      min,
      max,
      abnormalCount,
      abnormalPercentage: Math.round((abnormalCount / metrics.length) * 100)
    }
  };
};

// Static: Get abnormal metrics
HealthMetricSchema.statics.getAbnormalMetrics = async function(patientId, dateRange = {}) {
  const { startDate, endDate } = dateRange;

  const query = {
    patient: patientId,
    isAbnormal: true
  };

  if (startDate) {
    query.measuredAt = { $gte: new Date(startDate) };
  }
  if (endDate) {
    query.measuredAt = { ...query.measuredAt, $lte: new Date(endDate) };
  }

  return this.find(query)
    .sort({ measuredAt: -1 })
    .limit(50)
    .lean();
};

// Static: Get aggregated trends by period
HealthMetricSchema.statics.getAggregatedTrends = async function(patientId, metricType, period = 'day', dateRange = {}) {
  const { startDate, endDate } = dateRange;

  const matchStage = {
    patient: new mongoose.Types.ObjectId(patientId),
    metricType
  };

  if (startDate || endDate) {
    matchStage.measuredAt = {};
    if (startDate) matchStage.measuredAt.$gte = new Date(startDate);
    if (endDate) matchStage.measuredAt.$lte = new Date(endDate);
  }

  // Group format based on period
  const groupFormats = {
    hour: { $dateToString: { format: '%Y-%m-%d %H:00', date: '$measuredAt' } },
    day: { $dateToString: { format: '%Y-%m-%d', date: '$measuredAt' } },
    week: { $dateToString: { format: '%Y-W%V', date: '$measuredAt' } },
    month: { $dateToString: { format: '%Y-%m', date: '$measuredAt' } }
  };

  const result = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: groupFormats[period] || groupFormats.day,
        avgValue: { $avg: '$value' },
        minValue: { $min: '$value' },
        maxValue: { $max: '$value' },
        count: { $sum: 1 },
        abnormalCount: {
          $sum: { $cond: ['$isAbnormal', 1, 0] }
        }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  return result.map(item => ({
    period: item._id,
    average: Math.round(item.avgValue * 10) / 10,
    min: item.minValue,
    max: item.maxValue,
    count: item.count,
    abnormalCount: item.abnormalCount
  }));
};

const HealthMetric = mongoose.model('HealthMetric', HealthMetricSchema);

module.exports = HealthMetric;
