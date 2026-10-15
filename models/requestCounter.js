/**
 * RequestCounter: atomic "how many times in this window" counters, e.g. SMS
 * codes requested from one network per hour. Incrementing before checking
 * means parallel requests can't all slip under the limit. Rows expire on
 * their own (TTL on expiresAt).
 */

const mongoose = require('mongoose');

const RequestCounterSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, maxlength: 200 },
  count: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true }
});

RequestCounterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RequestCounter = mongoose.models.RequestCounter || mongoose.model('RequestCounter', RequestCounterSchema);

/** Add one to `key` for the current window and return the new count. */
RequestCounter.hit = async function hit(key, windowMs) {
  const bucket = Math.floor(Date.now() / windowMs);
  const fullKey = `${key}|${bucket}`;
  const expiresAt = new Date((bucket + 1) * windowMs);
  for (let i = 0; i < 2; i += 1) {
    try {
      const doc = await RequestCounter.findOneAndUpdate(
        { key: fullKey },
        { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
        { upsert: true, new: true }
      ).lean();
      return doc.count;
    } catch (err) {
      // Two first hits at once: one upsert wins, the other retries as an update.
      if (!(err && err.code === 11000) || i === 1) throw err;
    }
  }
  return Infinity;
};

module.exports = RequestCounter;
