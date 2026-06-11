const mongoose = require('mongoose');

// How long idempotency records are retained. After this window the key is
// forgotten and a fresh request with the same key is treated as new.
const RETENTION_SECONDS = parseInt(process.env.IDEMPOTENCY_TTL_SECONDS, 10) || 24 * 60 * 60; // 24h

/**
 * Stores the minimum needed to make an approved mutation endpoint idempotent.
 *
 * Privacy: this collection NEVER stores the raw Idempotency-Key, the raw request
 * body, or plaintext PHI. The key is reduced to a scoped SHA-256 fingerprint,
 * the request body to a SHA-256 hash (for payload-mismatch detection), and the
 * replay response is stored encrypted (AES-256-GCM via utils/encryptionV2).
 */
const idempotencyKeySchema = new mongoose.Schema({
  // sha256(identity | method | route | idempotency-key). Unique => atomic claim.
  scope: { type: String, required: true, unique: true },

  // sha256 of the canonicalized request body — to reject the same key reused
  // with a different payload. Not reversible to the original body.
  requestHash: { type: String, required: true },

  status: {
    type: String,
    enum: ['processing', 'completed'],
    default: 'processing',
    required: true
  },

  // Captured only for completed (2xx) responses, so a replay returns the original.
  responseStatus: { type: Number },

  // Encrypted (AES-256-GCM) JSON of the original response body. Never plaintext.
  responseBody: { type: String },

  createdAt: { type: Date, default: Date.now }
}, { minimize: false });

// TTL index — expire records after the retention period.
idempotencyKeySchema.index({ createdAt: 1 }, { expireAfterSeconds: RETENTION_SECONDS });

module.exports = mongoose.model('IdempotencyKey', idempotencyKeySchema);
module.exports.RETENTION_SECONDS = RETENTION_SECONDS;
