const mongoose = require('mongoose');

const refreshSessionSchema = new mongoose.Schema({
  tokenHash: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  userType: {
    type: String,
    enum: ['user', 'patient'],
    required: true,
    index: true
  },
  familyId: {
    type: String,
    required: true,
    index: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  revokedAt: {
    type: Date,
    default: null,
    index: true
  },
  replacedByTokenHash: {
    type: String,
    default: null
  },
  revokedReason: String,
  lastUsedAt: {
    type: Date,
    default: Date.now
  },
  reuseDetectedAt: Date,
  ipAddress: String,
  userAgent: String
}, {
  timestamps: true
});

refreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
refreshSessionSchema.index({ userId: 1, userType: 1, revokedAt: 1 });
refreshSessionSchema.index({ familyId: 1, revokedAt: 1 });

module.exports = mongoose.models.RefreshSession || mongoose.model('RefreshSession', refreshSessionSchema);
