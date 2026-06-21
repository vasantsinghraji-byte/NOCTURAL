const mongoose = require('mongoose');

const webAuthnRecoveryCodeSchema = new mongoose.Schema({
  identityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  identityType: { type: String, enum: ['user', 'patient'], required: true },
  batchId: { type: String, required: true, index: true },
  codeHash: { type: String, required: true, unique: true },
  usedAt: Date,
  replacedAt: Date,
  expiresAt: { type: Date, required: true }
}, { timestamps: true });

webAuthnRecoveryCodeSchema.index({ identityId: 1, identityType: 1, usedAt: 1, replacedAt: 1 });
webAuthnRecoveryCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.WebAuthnRecoveryCode ||
  mongoose.model('WebAuthnRecoveryCode', webAuthnRecoveryCodeSchema);
