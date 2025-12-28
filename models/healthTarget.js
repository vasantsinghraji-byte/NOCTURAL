/**
 * Health Target Model
 *
 * Stores configurable health targets/goals for patients.
 * Used for diabetes and hypertension tracking charts.
 */

const mongoose = require('mongoose');
const {
  METRIC_TYPES,
  TRACKER_TYPES,
  NORMAL_RANGES
} = require('../constants/healthConstants');

// Target range sub-schema
const TargetRangeSchema = new mongoose.Schema({
  min: {
    type: Number,
    required: true
  },
  max: {
    type: Number,
    required: true
  },
  warningMin: Number, // Optional warning threshold
  warningMax: Number
}, { _id: false });

// Individual metric target sub-schema
const MetricTargetSchema = new mongoose.Schema({
  metricType: {
    type: String,
    required: true
  },
  targetRange: TargetRangeSchema,
  isCustom: {
    type: Boolean,
    default: false
  },
  setBy: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'targets.setByModel'
  },
  setByModel: {
    type: String,
    enum: ['Patient', 'User']
  },
  setAt: {
    type: Date,
    default: Date.now
  },
  notes: String
}, { _id: true });

const HealthTargetSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
    index: true
  },

  // Tracker type (diabetes or hypertension)
  trackerType: {
    type: String,
    enum: Object.values(TRACKER_TYPES),
    required: true
  },

  // Whether this tracker is enabled for the patient
  isEnabled: {
    type: Boolean,
    default: true
  },

  // Individual metric targets
  targets: [MetricTargetSchema],

  // Reminder settings
  reminders: {
    enabled: {
      type: Boolean,
      default: false
    },
    frequency: {
      type: String,
      enum: ['DAILY', 'TWICE_DAILY', 'WEEKLY', 'CUSTOM'],
      default: 'DAILY'
    },
    times: [{
      hour: { type: Number, min: 0, max: 23 },
      minute: { type: Number, min: 0, max: 59 }
    }],
    customDays: [{ // For weekly/custom
      type: Number, // 0=Sunday, 6=Saturday
      min: 0,
      max: 6
    }]
  },

  // Last updated info
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'lastModifiedByModel'
  },
  lastModifiedByModel: {
    type: String,
    enum: ['Patient', 'User']
  }
}, {
  timestamps: true
});

// Compound index for unique tracker per patient
HealthTargetSchema.index({ patient: 1, trackerType: 1 }, { unique: true });

// Pre-save: Initialize default targets if not set
HealthTargetSchema.pre('save', function(next) {
  if (this.isNew && (!this.targets || this.targets.length === 0)) {
    this.targets = getDefaultTargets(this.trackerType);
  }
  next();
});

// Helper function to get default targets based on tracker type
function getDefaultTargets(trackerType) {
  if (trackerType === TRACKER_TYPES.DIABETES) {
    return [
      {
        metricType: METRIC_TYPES.BLOOD_SUGAR_RBS,
        targetRange: {
          min: NORMAL_RANGES[METRIC_TYPES.BLOOD_SUGAR_RBS].min,
          max: NORMAL_RANGES[METRIC_TYPES.BLOOD_SUGAR_RBS].max,
          warningMin: 60,
          warningMax: 180
        },
        isCustom: false
      },
      {
        metricType: METRIC_TYPES.BLOOD_SUGAR_FASTING,
        targetRange: {
          min: NORMAL_RANGES[METRIC_TYPES.BLOOD_SUGAR_FASTING].min,
          max: NORMAL_RANGES[METRIC_TYPES.BLOOD_SUGAR_FASTING].max,
          warningMin: 60,
          warningMax: 130
        },
        isCustom: false
      },
      {
        metricType: METRIC_TYPES.BLOOD_SUGAR_PP,
        targetRange: {
          min: NORMAL_RANGES[METRIC_TYPES.BLOOD_SUGAR_PP].min,
          max: NORMAL_RANGES[METRIC_TYPES.BLOOD_SUGAR_PP].max,
          warningMin: 70,
          warningMax: 180
        },
        isCustom: false
      },
      {
        metricType: METRIC_TYPES.HBA1C,
        targetRange: {
          min: NORMAL_RANGES[METRIC_TYPES.HBA1C].min,
          max: NORMAL_RANGES[METRIC_TYPES.HBA1C].max,
          warningMin: 4.0,
          warningMax: 7.0
        },
        isCustom: false
      }
    ];
  } else if (trackerType === TRACKER_TYPES.HYPERTENSION) {
    return [
      {
        metricType: METRIC_TYPES.BP_SYSTOLIC,
        targetRange: {
          min: NORMAL_RANGES[METRIC_TYPES.BP_SYSTOLIC].min,
          max: NORMAL_RANGES[METRIC_TYPES.BP_SYSTOLIC].max,
          warningMin: 80,
          warningMax: 140
        },
        isCustom: false
      },
      {
        metricType: METRIC_TYPES.BP_DIASTOLIC,
        targetRange: {
          min: NORMAL_RANGES[METRIC_TYPES.BP_DIASTOLIC].min,
          max: NORMAL_RANGES[METRIC_TYPES.BP_DIASTOLIC].max,
          warningMin: 50,
          warningMax: 90
        },
        isCustom: false
      }
    ];
  }
  return [];
}

// Static: Get or create tracker for patient
HealthTargetSchema.statics.getOrCreateTracker = async function(patientId, trackerType) {
  let tracker = await this.findOne({ patient: patientId, trackerType });

  if (!tracker) {
    tracker = await this.create({
      patient: patientId,
      trackerType,
      targets: getDefaultTargets(trackerType)
    });
  }

  return tracker;
};

// Static: Update target for specific metric
HealthTargetSchema.statics.updateMetricTarget = async function(patientId, trackerType, metricType, targetData, updatedBy, updatedByModel) {
  const tracker = await this.getOrCreateTracker(patientId, trackerType);

  const existingIndex = tracker.targets.findIndex(t => t.metricType === metricType);

  const newTarget = {
    metricType,
    targetRange: targetData.targetRange,
    isCustom: true,
    setBy: updatedBy,
    setByModel: updatedByModel,
    setAt: new Date(),
    notes: targetData.notes
  };

  if (existingIndex >= 0) {
    tracker.targets[existingIndex] = newTarget;
  } else {
    tracker.targets.push(newTarget);
  }

  tracker.lastModifiedBy = updatedBy;
  tracker.lastModifiedByModel = updatedByModel;

  return tracker.save();
};

// Static: Reset target to default
HealthTargetSchema.statics.resetMetricTarget = async function(patientId, trackerType, metricType) {
  const tracker = await this.findOne({ patient: patientId, trackerType });
  if (!tracker) return null;

  const defaultTargets = getDefaultTargets(trackerType);
  const defaultTarget = defaultTargets.find(t => t.metricType === metricType);

  if (defaultTarget) {
    const existingIndex = tracker.targets.findIndex(t => t.metricType === metricType);
    if (existingIndex >= 0) {
      tracker.targets[existingIndex] = defaultTarget;
    } else {
      tracker.targets.push(defaultTarget);
    }
    return tracker.save();
  }

  return tracker;
};

// Instance: Get target for specific metric
HealthTargetSchema.methods.getTargetForMetric = function(metricType) {
  return this.targets.find(t => t.metricType === metricType);
};

// Instance: Check if value is within target
HealthTargetSchema.methods.checkValueAgainstTarget = function(metricType, value) {
  const target = this.getTargetForMetric(metricType);
  if (!target) return { status: 'NO_TARGET', target: null };

  const { min, max, warningMin, warningMax } = target.targetRange;

  if (value < (warningMin || min * 0.8)) {
    return { status: 'CRITICAL_LOW', target, value };
  } else if (value < min) {
    return { status: 'LOW', target, value };
  } else if (value > (warningMax || max * 1.2)) {
    return { status: 'CRITICAL_HIGH', target, value };
  } else if (value > max) {
    return { status: 'HIGH', target, value };
  } else {
    return { status: 'NORMAL', target, value };
  }
};

const HealthTarget = mongoose.model('HealthTarget', HealthTargetSchema);

module.exports = HealthTarget;
