/**
 * Short-lived DigiLocker sign-in attempt: ties the OAuth `state` we send to
 * the partner who started it, and keeps the PKCE verifier on the server.
 * Only a hash of the state is stored; rows expire after 10 minutes.
 */

const mongoose = require('mongoose');

const DigilockerSessionSchema = new mongoose.Schema({
  stateHash: { type: String, required: true, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  codeVerifier: { type: String, required: true },
  returnTo: { type: String, enum: ['web', 'app'], default: 'web' },
  expiresAt: { type: Date, required: true }
});

DigilockerSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.DigilockerSession || mongoose.model('DigilockerSession', DigilockerSessionSchema);
