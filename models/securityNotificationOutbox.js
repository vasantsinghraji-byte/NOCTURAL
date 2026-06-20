const mongoose = require('mongoose');

const securityNotificationOutboxSchema = new mongoose.Schema({
  identityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  identityType: { type: String, enum: ['user', 'patient'], required: true },
  event: { type: String, required: true },
  payloadEncrypted: { type: String, select: true },
  // Legacy field kept so pre-encryption queued rows can drain during rollout.
  payload: { type: mongoose.Schema.Types.Mixed, select: false },
  status: {
    type: String,
    enum: ['PENDING', 'PROCESSING', 'RETRY_PENDING', 'COMPLETED', 'DEAD_LETTER'],
    default: 'PENDING',
    index: true
  },
  attemptCount: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 10 },
  nextAttemptAt: { type: Date, default: Date.now, index: true },
  lockedAt: Date,
  completedAt: Date,
  lastError: String,
  purgeAfter: Date
}, { timestamps: true });

securityNotificationOutboxSchema.index({ status: 1, nextAttemptAt: 1 });
securityNotificationOutboxSchema.index({ purgeAfter: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.SecurityNotificationOutbox ||
  mongoose.model('SecurityNotificationOutbox', securityNotificationOutboxSchema);
