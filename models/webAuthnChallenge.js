const mongoose = require('mongoose');

const webAuthnChallengeSchema = new mongoose.Schema({
  identityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  identityType: { type: String, enum: ['user', 'patient'], required: true },
  purpose: { type: String, enum: ['REGISTRATION', 'PASSWORD_CHANGE'], required: true },
  challenge: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  recoveryCodeId: { type: mongoose.Schema.Types.ObjectId, ref: 'WebAuthnRecoveryCode' },
  verifiedAt: Date,
  consumedAt: Date
}, { timestamps: true });

webAuthnChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
webAuthnChallengeSchema.index({ identityId: 1, identityType: 1, purpose: 1, consumedAt: 1 });

module.exports = mongoose.models.WebAuthnChallenge ||
  mongoose.model('WebAuthnChallenge', webAuthnChallengeSchema);
