/**
 * Health Data Access Log Model
 *
 * HIPAA-style audit logging for all health data access.
 * Every view, create, update, delete, export, or share action is logged.
 */

const mongoose = require('mongoose');
const {
  AUDIT_ACTIONS,
  ACCESS_REASONS,
  USER_TYPES,
  ALLOWED_RESOURCES
} = require('../constants/healthConstants');

// Accessor sub-schema
const AccessorSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'accessor.userModel'
  },
  userModel: {
    type: String,
    enum: ['User', 'Patient'],
    default: 'User'
  },
  userType: {
    type: String,
    enum: Object.values(USER_TYPES),
    required: true
  },
  name: String,
  email: String,
  role: String
}, { _id: false });

const HealthDataAccessLogSchema = new mongoose.Schema({
  // Who accessed
  accessor: {
    type: AccessorSchema,
    required: true
  },

  // Whose data was accessed
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
    index: true
  },

  // What was accessed
  resourceType: {
    type: String,
    enum: Object.values(ALLOWED_RESOURCES),
    required: true
  },
  resourceId: {
    type: mongoose.Schema.Types.ObjectId
  },
  resourceDetails: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },

  // Action performed
  action: {
    type: String,
    enum: Object.values(AUDIT_ACTIONS),
    required: true
  },

  // Why it was accessed
  accessReason: {
    type: String,
    enum: Object.values(ACCESS_REASONS),
    default: ACCESS_REASONS.DIRECT_ACCESS
  },

  // Context
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'NurseBooking'
  },
  accessTokenId: String,

  // Request details
  ipAddress: String,
  userAgent: String,
  endpoint: String,
  method: {
    type: String,
    enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
  },

  // Request/Response metadata
  requestBody: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },
  responseStatus: Number,

  // Outcome
  success: {
    type: Boolean,
    default: true
  },
  errorMessage: String,
  errorCode: String,

  // Timestamp (separate from createdAt for when the access actually occurred)
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },

  // Retention (for TTL cleanup if needed)
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000) // 7 years retention
  }
}, {
  timestamps: true,
  capped: false // Don't cap - need full audit history
});

// Indexes for audit queries
HealthDataAccessLogSchema.index({ patient: 1, timestamp: -1 }); // Patient access history
HealthDataAccessLogSchema.index({ 'accessor.userId': 1, timestamp: -1 }); // Who accessed what
HealthDataAccessLogSchema.index({ resourceType: 1, action: 1, timestamp: -1 }); // Access patterns
HealthDataAccessLogSchema.index({ bookingId: 1 }); // Booking-related access
HealthDataAccessLogSchema.index({ accessTokenId: 1 }); // Token usage tracking
HealthDataAccessLogSchema.index({ timestamp: -1 }); // Recent access
HealthDataAccessLogSchema.index({ success: 1, timestamp: -1 }); // Failed access attempts

// Static: Log an access event
HealthDataAccessLogSchema.statics.logAccess = async function(accessData) {
  const {
    accessor,
    patient,
    resourceType,
    resourceId,
    action,
    accessReason,
    bookingId,
    accessTokenId,
    ipAddress,
    userAgent,
    endpoint,
    method,
    success = true,
    errorMessage,
    resourceDetails
  } = accessData;

  return this.create({
    accessor,
    patient,
    resourceType,
    resourceId,
    resourceDetails,
    action,
    accessReason,
    bookingId,
    accessTokenId,
    ipAddress,
    userAgent,
    endpoint,
    method,
    success,
    errorMessage
  });
};

// Static: Get patient access history
HealthDataAccessLogSchema.statics.getPatientAccessHistory = async function(patientId, options = {}) {
  const { page = 1, limit = 50, startDate, endDate, accessorId, action, resourceType } = options;
  const skip = (page - 1) * limit;

  const query = { patient: patientId };

  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(endDate);
  }

  if (accessorId) {
    query['accessor.userId'] = accessorId;
  }

  if (action) {
    query.action = action;
  }

  if (resourceType) {
    query.resourceType = resourceType;
  }

  const logs = await this.find(query)
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await this.countDocuments(query);

  return {
    logs,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

// Static: Get accessor's access history
HealthDataAccessLogSchema.statics.getAccessorHistory = async function(userId, options = {}) {
  const { page = 1, limit = 50, startDate, endDate, patientId } = options;
  const skip = (page - 1) * limit;

  const query = { 'accessor.userId': userId };

  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(endDate);
  }

  if (patientId) {
    query.patient = patientId;
  }

  const logs = await this.find(query)
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit)
    .populate('patient', 'name email')
    .lean();

  const total = await this.countDocuments(query);

  return {
    logs,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

// Static: Get access summary for a patient
HealthDataAccessLogSchema.statics.getPatientAccessSummary = async function(patientId, days = 30) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const summary = await this.aggregate([
    {
      $match: {
        patient: new mongoose.Types.ObjectId(patientId),
        timestamp: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          accessorId: '$accessor.userId',
          accessorName: '$accessor.name',
          accessorType: '$accessor.userType'
        },
        accessCount: { $sum: 1 },
        lastAccess: { $max: '$timestamp' },
        resourceTypes: { $addToSet: '$resourceType' },
        actions: { $addToSet: '$action' }
      }
    },
    {
      $sort: { accessCount: -1 }
    }
  ]);

  return {
    period: { days, startDate },
    accessors: summary.map(s => ({
      userId: s._id.accessorId,
      name: s._id.accessorName,
      userType: s._id.accessorType,
      accessCount: s.accessCount,
      lastAccess: s.lastAccess,
      resourceTypes: s.resourceTypes,
      actions: s.actions
    }))
  };
};

// Static: Get failed access attempts
HealthDataAccessLogSchema.statics.getFailedAttempts = async function(options = {}) {
  const { page = 1, limit = 50, patientId, hours = 24 } = options;
  const skip = (page - 1) * limit;
  const startDate = new Date(Date.now() - hours * 60 * 60 * 1000);

  const query = {
    success: false,
    timestamp: { $gte: startDate }
  };

  if (patientId) {
    query.patient = patientId;
  }

  const logs = await this.find(query)
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit)
    .populate('patient', 'name email')
    .lean();

  const total = await this.countDocuments(query);

  return {
    logs,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

// Static: Get access statistics for admin dashboard
HealthDataAccessLogSchema.statics.getAccessStats = async function(days = 7) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const stats = await this.aggregate([
    {
      $match: { timestamp: { $gte: startDate } }
    },
    {
      $facet: {
        byAction: [
          { $group: { _id: '$action', count: { $sum: 1 } } }
        ],
        byResourceType: [
          { $group: { _id: '$resourceType', count: { $sum: 1 } } }
        ],
        byUserType: [
          { $group: { _id: '$accessor.userType', count: { $sum: 1 } } }
        ],
        bySuccess: [
          { $group: { _id: '$success', count: { $sum: 1 } } }
        ],
        total: [
          { $count: 'count' }
        ],
        byDay: [
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
              count: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } }
        ]
      }
    }
  ]);

  const result = stats[0];

  return {
    period: { days, startDate },
    total: result.total[0]?.count || 0,
    byAction: Object.fromEntries(result.byAction.map(a => [a._id, a.count])),
    byResourceType: Object.fromEntries(result.byResourceType.map(r => [r._id, r.count])),
    byUserType: Object.fromEntries(result.byUserType.map(u => [u._id, u.count])),
    successRate: result.bySuccess.find(s => s._id === true)?.count /
                 (result.total[0]?.count || 1) * 100,
    byDay: result.byDay
  };
};

const HealthDataAccessLog = mongoose.model('HealthDataAccessLog', HealthDataAccessLogSchema);

module.exports = HealthDataAccessLog;
