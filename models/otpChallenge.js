/**
 * OtpChallenge: one-time sign-in code sent to a phone number.
 * Only a hash of the code is stored; challenges expire and lock after a few
 * wrong attempts. TTL index removes them automatically.
 */

const mongoose = require('mongoose');

const OtpChallengeSchema = new mongoose.Schema({
  phone: { type: String, required: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  consumedAt: Date,
  expiresAt: { type: Date, required: true },
  requestIp: String
}, { timestamps: { createdAt: true, updatedAt: false } });

OtpChallengeSchema.index({ phone: 1, createdAt: -1 });
OtpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

module.exports = mongoose.models.OtpChallenge || mongoose.model('OtpChallenge', OtpChallengeSchema);
