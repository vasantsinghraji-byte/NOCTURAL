/**
 * Health Access Token Model
 *
 * Time-limited access tokens for doctor access to patient health data.
 * Access is granted by admin and can be revoked by admin or patient.
 */

const mongoose = require('mongoose');
const crypto = require('crypto');
const { ACCESS_LEVELS, ALLOWED_RESOURCES } = require('../constants/healthConstants');

const HealthAccessTokenSchema = new mongoose.Schema({
  // Token (stored as hash)
  tokenHash: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  // Who has access
  grantedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  grantedToRole: {
    type: String,
    enum: ['doctor', 'nurse', 'physiotherapist'],
    required: true
  },
  grantedToName: String, // Denormalized for quick display

  // Whose data is accessible
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
    index: true
  },
  patientName: String, // Denormalized for quick display

  // Associated booking (if any)
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'NurseBooking',
    index: true
  },

  // Access scope
  accessLevel: {
    type: String,
    enum: Object.values(ACCESS_LEVELS),
    default: ACCESS_LEVELS.READ_ONLY
  },
  allowedResources: [{
    type: String,
    enum: Object.values(ALLOWED_RESOURCES)
  }],

  // Who granted access
  grantedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  grantedByName: String,
  grantReason: String,

  // Validity
  createdAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: Date, // null = no expiry (until manually revoked)

  // Revocation
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  revokedAt: Date,
  revokedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  revokedByType: {
    type: String,
    enum: ['ADMIN', 'PATIENT', 'SYSTEM']
  },
  revocationReason: String,

  // Usage tracking
  usageCount: {
    type: Number,
    default: 0
  },
  maxUsage: Number, // Optional limit on number of uses
  lastUsedAt: Date,
  lastUsedFrom: String // IP address
}, {
  timestamps: true
});

// Compound indexes
HealthAccessTokenSchema.index({ patient: 1, grantedTo: 1, isActive: 1 });
HealthAccessTokenSchema.index({ grantedTo: 1, isActive: 1 });
// Note: booking field already has index: true in schema definition
HealthAccessTokenSchema.index({ isActive: 1, expiresAt: 1 });

// Static: Generate a new access token
HealthAccessTokenSchema.statics.generateToken = async function(data) {
  const {
    grantedTo,
    grantedToRole,
    grantedToName,
    patient,
    patientName,
    booking,
    accessLevel = ACCESS_LEVELS.READ_ONLY,
    allowedResources = [ALLOWED_RESOURCES.HEALTH_RECORD, ALLOWED_RESOURCES.HEALTH_METRIC],
    grantedBy,
    grantedByName,
    grantReason,
    expiresAt,
    maxUsage
  } = data;

  // Generate secure random token
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  // Check if token already exists for this patient-provider pair
  const existingToken = await this.findOne({
    patient,
    grantedTo,
    isActive: true
  });

  if (existingToken) {
    // Revoke existing and create new
    existingToken.isActive = false;
    existingToken.revokedAt = new Date();
    existingToken.revokedBy = grantedBy;
    existingToken.revokedByType = 'SYSTEM';
    existingToken.revocationReason = 'Replaced by new token';
    await existingToken.save();
  }

  // Create new token
  const accessToken = await this.create({
    tokenHash,
    grantedTo,
    grantedToRole,
    grantedToName,
    patient,
    patientName,
    booking,
    accessLevel,
    allowedResources,
    grantedBy,
    grantedByName,
    grantReason,
    expiresAt,
    maxUsage
  });

  // Return the plain token (only shown once)
  return {
    token,
    tokenId: accessToken._id,
    expiresAt: accessToken.expiresAt,
    accessLevel: accessToken.accessLevel,
    allowedResources: accessToken.allowedResources
  };
};

// Static: Validate a token
HealthAccessTokenSchema.statics.validateToken = async function(token) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const accessToken = await this.findOne({
    tokenHash,
    isActive: true
  });

  if (!accessToken) {
    return { valid: false, reason: 'TOKEN_NOT_FOUND' };
  }

  // Check expiry
  if (accessToken.expiresAt && new Date() > accessToken.expiresAt) {
    return { valid: false, reason: 'TOKEN_EXPIRED' };
  }

  // Check usage limit
  if (accessToken.maxUsage && accessToken.usageCount >= accessToken.maxUsage) {
    return { valid: false, reason: 'USAGE_LIMIT_EXCEEDED' };
  }

  return {
    valid: true,
    accessToken
  };
};

// Static: Find token by hash
HealthAccessTokenSchema.statics.findByToken = async function(token) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  return this.findOne({ tokenHash, isActive: true });
};

// Static: Check if doctor has access to patient
HealthAccessTokenSchema.statics.hasAccess = async function(doctorId, patientId) {
  const token = await this.findOne({
    grantedTo: doctorId,
    patient: patientId,
    isActive: true
  });

  if (!token) {
    return null;
  }

  // Check expiry
  if (token.expiresAt && new Date() > token.expiresAt) {
    return null;
  }

  // Check usage limit
  if (token.maxUsage && token.usageCount >= token.maxUsage) {
    return null;
  }

  return token;
};

// Instance method: Record usage
HealthAccessTokenSchema.methods.recordUsage = async function(ipAddress) {
  this.usageCount = (this.usageCount || 0) + 1;
  this.lastUsedAt = new Date();
  this.lastUsedFrom = ipAddress;
  return this.save();
};

// Instance method: Revoke token
HealthAccessTokenSchema.methods.revoke = async function(revokedBy, revokedByType, reason) {
  this.isActive = false;
  this.revokedAt = new Date();
  this.revokedBy = revokedBy;
  this.revokedByType = revokedByType;
  this.revocationReason = reason;
  return this.save();
};

// Static: Get patient's active access tokens (who has access to their data)
HealthAccessTokenSchema.statics.getPatientAccessTokens = async function(patientId) {
  return this.find({
    patient: patientId,
    isActive: true
  })
    .populate('grantedTo', 'name email professional.primarySpecialization')
    .populate('grantedBy', 'name')
    .sort({ createdAt: -1 })
    .lean();
};

// Static: Get doctor's active access tokens
HealthAccessTokenSchema.statics.getDoctorAccessTokens = async function(doctorId) {
  return this.find({
    grantedTo: doctorId,
    isActive: true
  })
    .populate('patient', 'name phone')
    .populate('booking', 'scheduledDate serviceType')
    .sort({ createdAt: -1 })
    .lean();
};

// Static: Revoke all tokens for a booking
HealthAccessTokenSchema.statics.revokeBookingTokens = async function(bookingId, revokedBy) {
  return this.updateMany(
    { booking: bookingId, isActive: true },
    {
      isActive: false,
      revokedAt: new Date(),
      revokedBy,
      revokedByType: 'SYSTEM',
      revocationReason: 'Booking completed or cancelled'
    }
  );
};

// Static: Revoke all patient tokens (e.g., on patient request)
HealthAccessTokenSchema.statics.revokeAllPatientTokens = async function(patientId, revokedBy, reason) {
  return this.updateMany(
    { patient: patientId, isActive: true },
    {
      isActive: false,
      revokedAt: new Date(),
      revokedBy,
      revokedByType: 'PATIENT',
      revocationReason: reason || 'Revoked by patient'
    }
  );
};

// Static: Get token statistics for admin
HealthAccessTokenSchema.statics.getTokenStats = async function() {
  const stats = await this.aggregate([
    {
      $facet: {
        total: [{ $count: 'count' }],
        active: [
          { $match: { isActive: true } },
          { $count: 'count' }
        ],
        byRole: [
          { $match: { isActive: true } },
          { $group: { _id: '$grantedToRole', count: { $sum: 1 } } }
        ],
        expiringSoon: [
          {
            $match: {
              isActive: true,
              expiresAt: {
                $lte: new Date(Date.now() + 24 * 60 * 60 * 1000) // Next 24 hours
              }
            }
          },
          { $count: 'count' }
        ],
        recentlyRevoked: [
          {
            $match: {
              isActive: false,
              revokedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
            }
          },
          { $count: 'count' }
        ]
      }
    }
  ]);

  const result = stats[0];

  return {
    total: result.total[0]?.count || 0,
    active: result.active[0]?.count || 0,
    byRole: Object.fromEntries(result.byRole.map(r => [r._id, r.count])),
    expiringSoon: result.expiringSoon[0]?.count || 0,
    recentlyRevoked: result.recentlyRevoked[0]?.count || 0
  };
};

const HealthAccessToken = mongoose.model('HealthAccessToken', HealthAccessTokenSchema);

module.exports = HealthAccessToken;
