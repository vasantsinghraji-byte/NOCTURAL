/**
 * Investigation Report Model
 *
 * Stores patient investigation reports (lab reports, scans, etc.)
 * with AI analysis and doctor review workflow.
 */

const mongoose = require('mongoose');
const {
  INVESTIGATION_REPORT_STATUS,
  INVESTIGATION_REPORT_TYPES,
  REPORT_ASSIGNMENT_TYPE
} = require('../constants/healthConstants');

// File attachment sub-schema
const FileAttachmentSchema = new mongoose.Schema({
  originalName: {
    type: String,
    required: true
  },
  fileName: {
    type: String,
    required: true
  },
  mimeType: {
    type: String,
    required: true,
    enum: ['application/pdf', 'image/jpeg', 'image/png']
  },
  size: {
    type: Number,
    required: true
  },
  url: {
    type: String,
    required: true
  },
  publicId: String, // For cloud storage (S3/Cloudinary)
  uploadedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

// AI Analysis sub-schema
const AIAnalysisSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED'],
    default: 'PENDING'
  },
  startedAt: Date,
  completedAt: Date,
  model: String, // e.g., 'gemini-pro-vision'

  // Extracted data from the report
  extractedData: {
    reportDate: Date,
    labName: String,
    patientName: String,
    referringDoctor: String,
    testType: String,

    // Key findings extracted by AI
    findings: [{
      parameter: String,
      value: String,
      unit: String,
      normalRange: String,
      status: {
        type: String,
        enum: ['NORMAL', 'LOW', 'HIGH', 'CRITICAL_LOW', 'CRITICAL_HIGH']
      },
      interpretation: String
    }]
  },

  // AI-generated summary
  summary: String,

  // Key observations by AI
  keyObservations: [String],

  // Potential concerns flagged by AI
  concerns: [{
    severity: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
    },
    description: String,
    recommendation: String
  }],

  // Confidence score (0-100)
  confidenceScore: {
    type: Number,
    min: 0,
    max: 100
  },

  // Raw AI response for debugging
  rawResponse: mongoose.Schema.Types.Mixed,

  // Error details if analysis failed
  error: {
    code: String,
    message: String,
    retryable: Boolean
  }
}, { _id: false });

// Doctor Review sub-schema
const DoctorReviewSchema = new mongoose.Schema({
  // Assignment details
  assignmentType: {
    type: String,
    enum: Object.values(REPORT_ASSIGNMENT_TYPE),
    required: true
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User' // Admin or Patient
  },
  assignedAt: Date,

  // Assigned doctor
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // For auto-queue: specialization required
  requiredSpecialization: String,

  // Review status
  status: {
    type: String,
    enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED'],
    default: 'PENDING'
  },
  startedAt: Date,
  completedAt: Date,

  // Doctor's interpretation
  interpretation: String,

  // Doctor's findings
  findings: [{
    category: String,
    observation: String,
    significance: {
      type: String,
      enum: ['NORMAL', 'MONITOR', 'CONCERN', 'URGENT']
    }
  }],

  // Doctor's recommendations
  recommendations: [String],

  // Follow-up required
  followUpRequired: {
    type: Boolean,
    default: false
  },
  followUpNotes: String,
  followUpDate: Date,

  // Verify/correct AI findings
  aiAccuracyFeedback: {
    accurate: Boolean,
    corrections: [String],
    missedFindings: [String]
  },

  // Additional notes
  privateNotes: String, // Internal notes, not visible to patient
  patientNotes: String  // Notes visible to patient
}, { _id: false });

// Main Investigation Report Schema
const InvestigationReportSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
    index: true
  },

  // Report identification
  reportNumber: {
    type: String,
    unique: true,
    sparse: true
  },

  // Report type/category
  reportType: {
    type: String,
    enum: Object.values(INVESTIGATION_REPORT_TYPES),
    required: true,
    index: true
  },

  // Custom title/description by patient
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },

  description: {
    type: String,
    trim: true,
    maxlength: 1000
  },

  // Report date (when the test was conducted)
  reportDate: {
    type: Date,
    required: true
  },

  // File attachments (multiple files per report)
  files: {
    type: [FileAttachmentSchema],
    validate: {
      validator: function(v) {
        return v && v.length > 0 && v.length <= 10;
      },
      message: 'At least 1 and at most 10 files are required'
    }
  },

  // Overall status
  status: {
    type: String,
    enum: Object.values(INVESTIGATION_REPORT_STATUS),
    default: INVESTIGATION_REPORT_STATUS.UPLOADED,
    index: true
  },

  // AI Analysis
  aiAnalysis: AIAnalysisSchema,

  // Doctor Review
  doctorReview: DoctorReviewSchema,

  // Patient acknowledgment of doctor's review
  patientAcknowledged: {
    type: Boolean,
    default: false
  },
  patientAcknowledgedAt: Date,
  patientQuestions: [{
    question: String,
    askedAt: { type: Date, default: Date.now },
    answer: String,
    answeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    answeredAt: Date
  }],

  // Tags for organization
  tags: [String],

  // Linked to a booking/consultation
  linkedBooking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'NurseBooking'
  },

  // Visibility settings
  isVisibleToProviders: {
    type: Boolean,
    default: true
  },

  // Soft delete
  isActive: {
    type: Boolean,
    default: true
  },
  deletedAt: Date,
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'deletedByModel'
  },
  deletedByModel: {
    type: String,
    enum: ['Patient', 'User']
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
InvestigationReportSchema.index({ patient: 1, reportDate: -1 });
InvestigationReportSchema.index({ patient: 1, status: 1 });
InvestigationReportSchema.index({ patient: 1, reportType: 1, reportDate: -1 });
InvestigationReportSchema.index({ 'doctorReview.assignedTo': 1, status: 1 });
InvestigationReportSchema.index({ 'doctorReview.requiredSpecialization': 1, status: 1 });
InvestigationReportSchema.index({ status: 1, createdAt: 1 }); // For queue processing

// Pre-save: Generate report number
InvestigationReportSchema.pre('save', async function(next) {
  if (this.isNew && !this.reportNumber) {
    const date = new Date();
    const prefix = `INV${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
    const count = await this.constructor.countDocuments({
      reportNumber: new RegExp(`^${prefix}`)
    });
    this.reportNumber = `${prefix}${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

// Static: Get reports for patient with pagination
InvestigationReportSchema.statics.getPatientReports = async function(patientId, options = {}) {
  const { page = 1, limit = 10, reportType, status, startDate, endDate } = options;
  const skip = (page - 1) * limit;

  const query = {
    patient: patientId,
    isActive: true
  };

  if (reportType) query.reportType = reportType;
  if (status) query.status = status;
  if (startDate || endDate) {
    query.reportDate = {};
    if (startDate) query.reportDate.$gte = new Date(startDate);
    if (endDate) query.reportDate.$lte = new Date(endDate);
  }

  const [reports, total] = await Promise.all([
    this.find(query)
      .sort({ reportDate: -1 })
      .skip(skip)
      .limit(limit)
      .populate('doctorReview.assignedTo', 'name email specialization')
      .lean(),
    this.countDocuments(query)
  ]);

  return {
    reports,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

// Static: Get pending reviews for doctor
InvestigationReportSchema.statics.getPendingReviewsForDoctor = async function(doctorId, options = {}) {
  const { page = 1, limit = 10 } = options;
  const skip = (page - 1) * limit;

  const query = {
    'doctorReview.assignedTo': doctorId,
    status: INVESTIGATION_REPORT_STATUS.PENDING_DOCTOR_REVIEW,
    isActive: true
  };

  const [reports, total] = await Promise.all([
    this.find(query)
      .sort({ createdAt: 1 }) // Oldest first
      .skip(skip)
      .limit(limit)
      .populate('patient', 'name email phone')
      .lean(),
    this.countDocuments(query)
  ]);

  return {
    reports,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

// Static: Get reports in auto-queue by specialization
InvestigationReportSchema.statics.getAutoQueueReports = async function(specialization, options = {}) {
  const { page = 1, limit = 10 } = options;
  const skip = (page - 1) * limit;

  const query = {
    'doctorReview.assignmentType': REPORT_ASSIGNMENT_TYPE.AUTO_QUEUE,
    'doctorReview.requiredSpecialization': specialization,
    'doctorReview.assignedTo': { $exists: false },
    status: INVESTIGATION_REPORT_STATUS.PENDING_DOCTOR_REVIEW,
    isActive: true
  };

  const [reports, total] = await Promise.all([
    this.find(query)
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .populate('patient', 'name email phone')
      .lean(),
    this.countDocuments(query)
  ]);

  return {
    reports,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

// Static: Get analytics summary for patient
InvestigationReportSchema.statics.getPatientAnalyticsSummary = async function(patientId) {
  const result = await this.aggregate([
    {
      $match: {
        patient: new mongoose.Types.ObjectId(patientId),
        isActive: true
      }
    },
    {
      $group: {
        _id: null,
        totalReports: { $sum: 1 },
        pendingAI: {
          $sum: {
            $cond: [{ $in: ['$status', ['UPLOADED', 'AI_ANALYZING']] }, 1, 0]
          }
        },
        pendingReview: {
          $sum: {
            $cond: [{ $eq: ['$status', 'PENDING_DOCTOR_REVIEW'] }, 1, 0]
          }
        },
        reviewed: {
          $sum: {
            $cond: [{ $eq: ['$status', 'REVIEWED'] }, 1, 0]
          }
        },
        reportsByType: {
          $push: '$reportType'
        }
      }
    },
    {
      $project: {
        _id: 0,
        totalReports: 1,
        pendingAI: 1,
        pendingReview: 1,
        reviewed: 1,
        reportsByType: 1
      }
    }
  ]);

  if (result.length === 0) {
    return {
      totalReports: 0,
      pendingAI: 0,
      pendingReview: 0,
      reviewed: 0,
      reportsByType: {}
    };
  }

  // Count reports by type
  const typeCount = {};
  result[0].reportsByType.forEach(type => {
    typeCount[type] = (typeCount[type] || 0) + 1;
  });

  return {
    ...result[0],
    reportsByType: typeCount
  };
};

const InvestigationReport = mongoose.model('InvestigationReport', InvestigationReportSchema);

module.exports = InvestigationReport;
