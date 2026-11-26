const mongoose = require('mongoose');

/**
 * One-time password reset link. Only the SHA-256 hash of the token is stored;
 * documents expire automatically (TTL) shortly after the link does.
 */
const PasswordResetTokenSchema = new mongoose.Schema({
  accountType: { type: String, enum: ['patient', 'user'], required: true },
  account: { type: mongoose.Schema.Types.ObjectId, required: true },
  tokenHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
  requestIp: String
}, { timestamps: { createdAt: true, updatedAt: false } });

PasswordResetTokenSchema.index({ tokenHash: 1 }, { unique: true });
PasswordResetTokenSchema.index({ account: 1, createdAt: -1 });
// Keep a day after expiry for audit, then delete.
PasswordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 24 * 3600 });

module.exports = mongoose.models.PasswordResetToken || mongoose.model('PasswordResetToken', PasswordResetTokenSchema);
