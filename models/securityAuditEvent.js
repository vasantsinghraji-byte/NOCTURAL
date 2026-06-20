const mongoose = require('mongoose');

const securityAuditEventSchema = new mongoose.Schema({
  event: { type: String, required: true, index: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, index: true },
  actorType: {
    type: String,
    enum: ['user', 'patient', 'system'],
    default: 'system'
  },
  targetType: String,
  targetId: String,
  outcome: {
    type: String,
    enum: ['success', 'failure', 'warning'],
    required: true
  },
  ipAddress: String,
  userAgent: String,
  metadata: mongoose.Schema.Types.Mixed
}, {
  timestamps: true
});

securityAuditEventSchema.index({ createdAt: -1 });
securityAuditEventSchema.index({ actorId: 1, createdAt: -1 });

module.exports = mongoose.models.SecurityAuditEvent ||
  mongoose.model('SecurityAuditEvent', securityAuditEventSchema);
