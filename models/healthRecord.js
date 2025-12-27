/**
 * Health Record Model
 *
 * Versioned, append-only health snapshots for patients.
 * Never overwrites existing data - creates new versions instead.
 *
 * This is the core model for the Patient Health History Dashboard.
 */

const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../utils/encryption');
const {
  RECORD_TYPES,
  RECORD_STATUS,
  DATA_SOURCES,
  ALLERGY_SEVERITY,
  CONDITION_SEVERITY
} = require('../constants/healthConstants');

// Sub-schema for conditions
const ConditionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  diagnosedDate: Date,
  severity: {
    type: String,
    enum: Object.values(CONDITION_SEVERITY),
    default: CONDITION_SEVERITY.MODERATE
  },
  notes: String,
  isActive: {
    type: Boolean,
    default: true
  },
  icdCode: String // ICD-10 code for standardization
}, { _id: false });

// Sub-schema for allergies
const AllergySchema = new mongoose.Schema({
  allergen: {
    type: String,
    required: true,
    trim: true
  },
  reaction: String,
  severity: {
    type: String,
    enum: Object.values(ALLERGY_SEVERITY),
    default: ALLERGY_SEVERITY.MODERATE
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isDrugAllergy: {
    type: Boolean,
    default: false
  }
}, { _id: false });

// Sub-schema for medications
const MedicationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  dosage: String,
  frequency: String,
  startDate: Date,
  endDate: Date,
  prescribedBy: String,
  isActive: {
    type: Boolean,
    default: true
  },
  reason: String
}, { _id: false });

// Sub-schema for surgeries
const SurgerySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  date: Date,
  hospital: String,
  surgeon: String,
  complications: String,
  notes: String
}, { _id: false });

// Sub-schema for family history
const FamilyHistorySchema = new mongoose.Schema({
  relation: {
    type: String,
    required: true,
    enum: ['FATHER', 'MOTHER', 'SIBLING', 'GRANDPARENT', 'CHILD', 'OTHER']
  },
  condition: {
    type: String,
    required: true
  },
  notes: String
}, { _id: false });

// Sub-schema for immunizations
const ImmunizationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  date: Date,
  provider: String,
  dueDate: Date,
  batchNumber: String
}, { _id: false });

// Sub-schema for lifestyle
const LifestyleSchema = new mongoose.Schema({
  sleepHours: {
    type: Number,
    min: 0,
    max: 24
  },
  stressLevel: {
    type: String,
    enum: ['LOW', 'MODERATE', 'HIGH', 'SEVERE']
  },
  occupation: String,
  physicalActivityLevel: {
    type: String,
    enum: ['SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'VERY_ACTIVE']
  }
}, { _id: false });

// Sub-schema for habits
const HabitsSchema = new mongoose.Schema({
  smoking: {
    type: Boolean,
    default: false
  },
  smokingDetails: String,
  alcohol: {
    type: Boolean,
    default: false
  },
  alcoholDetails: String,
  exercise: {
    type: String,
    enum: ['NONE', 'LIGHT', 'MODERATE', 'REGULAR', 'INTENSE']
  },
  diet: {
    type: String,
    enum: ['VEGETARIAN', 'NON_VEGETARIAN', 'VEGAN', 'PESCATARIAN', 'OTHER']
  }
}, { _id: false });

// Main health snapshot sub-schema
const HealthSnapshotSchema = new mongoose.Schema({
  conditions: [ConditionSchema],
  allergies: [AllergySchema],
  currentMedications: [MedicationSchema],
  surgeries: [SurgerySchema],
  familyHistory: [FamilyHistorySchema],
  immunizations: [ImmunizationSchema],
  habits: HabitsSchema,
  lifestyle: LifestyleSchema
}, { _id: false });

// Review workflow sub-schema
const ReviewSchema = new mongoose.Schema({
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  assignedAt: Date,
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: Date,
  notes: String,
  changesRequired: [String],
  decision: {
    type: String,
    enum: ['APPROVED', 'REJECTED', 'CHANGES_REQUESTED']
  }
}, { _id: false });

// Source tracking sub-schema
const SourceSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: Object.values(DATA_SOURCES),
    required: true
  },
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'NurseBooking'
  },
  providerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { _id: false });

// Main Health Record Schema
const HealthRecordSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
    index: true
  },

  // Version control - auto-incremented per patient
  version: {
    type: Number,
    required: true,
    default: 1
  },

  // Record type
  recordType: {
    type: String,
    enum: Object.values(RECORD_TYPES),
    required: true,
    default: RECORD_TYPES.UPDATE
  },

  // Status for intake workflow
  status: {
    type: String,
    enum: Object.values(RECORD_STATUS),
    default: RECORD_STATUS.APPROVED
  },

  // The actual health data snapshot
  healthSnapshot: HealthSnapshotSchema,

  // Source of this record
  source: SourceSchema,

  // Review workflow data
  review: ReviewSchema,

  // Version chain
  isLatest: {
    type: Boolean,
    default: true,
    index: true
  },
  previousVersion: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'HealthRecord'
  },

  // Changes from previous version (for diff display)
  changes: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },

  // Fields that are encrypted
  encryptedFields: [String],

  // Soft delete
  isActive: {
    type: Boolean,
    default: true
  },
  deletedAt: Date,
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
HealthRecordSchema.index({ patient: 1, version: -1 });
HealthRecordSchema.index({ patient: 1, isLatest: 1 });
HealthRecordSchema.index({ patient: 1, recordType: 1, createdAt: -1 });
HealthRecordSchema.index({ status: 1, createdAt: 1 }); // Pending review queue
HealthRecordSchema.index({ 'source.bookingId': 1 });
HealthRecordSchema.index({ 'review.assignedTo': 1, status: 1 }); // Doctor's review queue

// Pre-save: Auto-increment version and manage isLatest
HealthRecordSchema.pre('save', async function(next) {
  if (this.isNew) {
    // Get the latest version for this patient
    const latestRecord = await this.constructor.findOne({
      patient: this.patient,
      isLatest: true
    }).sort({ version: -1 });

    if (latestRecord) {
      // Set version and link to previous
      this.version = latestRecord.version + 1;
      this.previousVersion = latestRecord._id;

      // Mark previous as not latest
      await this.constructor.updateOne(
        { _id: latestRecord._id },
        { isLatest: false }
      );
    } else {
      this.version = 1;
    }
  }
  next();
});

// Static: Get latest approved record for a patient
HealthRecordSchema.statics.getLatestApproved = async function(patientId) {
  return this.findOne({
    patient: patientId,
    status: RECORD_STATUS.APPROVED,
    isActive: true
  }).sort({ version: -1 });
};

// Static: Get version history for a patient
HealthRecordSchema.statics.getVersionHistory = async function(patientId, options = {}) {
  const { page = 1, limit = 10 } = options;
  const skip = (page - 1) * limit;

  const records = await this.find({
    patient: patientId,
    isActive: true
  })
    .sort({ version: -1 })
    .skip(skip)
    .limit(limit)
    .select('version recordType status createdAt source review.reviewedAt')
    .lean();

  const total = await this.countDocuments({
    patient: patientId,
    isActive: true
  });

  return {
    records,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

// Static: Get pending reviews for a doctor
HealthRecordSchema.statics.getPendingReviews = async function(doctorId, options = {}) {
  const { page = 1, limit = 10 } = options;
  const skip = (page - 1) * limit;

  const records = await this.find({
    'review.assignedTo': doctorId,
    status: RECORD_STATUS.PENDING_REVIEW,
    isActive: true
  })
    .sort({ createdAt: 1 }) // Oldest first
    .skip(skip)
    .limit(limit)
    .populate('patient', 'name email phone')
    .lean();

  const total = await this.countDocuments({
    'review.assignedTo': doctorId,
    status: RECORD_STATUS.PENDING_REVIEW,
    isActive: true
  });

  return {
    records,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

// Static: Get all pending reviews (for admin assignment)
HealthRecordSchema.statics.getAllPendingIntakes = async function(options = {}) {
  const { page = 1, limit = 20, unassignedOnly = false } = options;
  const skip = (page - 1) * limit;

  const query = {
    recordType: RECORD_TYPES.BASELINE,
    status: { $in: [RECORD_STATUS.PENDING_REVIEW, RECORD_STATUS.PENDING_PATIENT] },
    isActive: true
  };

  if (unassignedOnly) {
    query['review.assignedTo'] = { $exists: false };
  }

  const records = await this.find(query)
    .sort({ createdAt: 1 })
    .skip(skip)
    .limit(limit)
    .populate('patient', 'name email phone')
    .populate('review.assignedTo', 'name email')
    .lean();

  const total = await this.countDocuments(query);

  return {
    records,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

// Instance: Compute changes from previous version
HealthRecordSchema.methods.computeChanges = async function() {
  if (!this.previousVersion) {
    return null;
  }

  const previous = await this.constructor.findById(this.previousVersion);
  if (!previous) {
    return null;
  }

  const changes = {};
  const currentSnapshot = this.healthSnapshot?.toObject() || {};
  const previousSnapshot = previous.healthSnapshot?.toObject() || {};

  // Compare each field
  for (const field of ['conditions', 'allergies', 'currentMedications', 'surgeries', 'familyHistory', 'immunizations']) {
    const current = currentSnapshot[field] || [];
    const prev = previousSnapshot[field] || [];

    if (JSON.stringify(current) !== JSON.stringify(prev)) {
      changes[field] = {
        added: current.length - prev.length,
        previous: prev.length,
        current: current.length
      };
    }
  }

  // Compare habits and lifestyle
  if (JSON.stringify(currentSnapshot.habits) !== JSON.stringify(previousSnapshot.habits)) {
    changes.habits = true;
  }
  if (JSON.stringify(currentSnapshot.lifestyle) !== JSON.stringify(previousSnapshot.lifestyle)) {
    changes.lifestyle = true;
  }

  return changes;
};

const HealthRecord = mongoose.model('HealthRecord', HealthRecordSchema);

module.exports = HealthRecord;
