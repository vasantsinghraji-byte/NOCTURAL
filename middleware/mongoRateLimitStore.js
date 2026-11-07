/**
 * express-rate-limit store backed by MongoDB, for the few limiters that
 * protect sign-in and account recovery.
 *
 * Why: without Redis each App Runner instance counts on its own, so "5 login
 * attempts per 15 min" becomes 5 × instances. One atomic document per key
 * (hits + window end) keeps the count shared; a TTL index cleans up.
 *
 * If MongoDB isn't connected or a write fails, it falls back to an in-memory
 * count so sign-in never hard-fails because of the limiter.
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');

/** Per-process fallback with the same interface (used only while MongoDB is unavailable). */
class LocalCounts {
  constructor() { this.map = new Map(); this.windowMs = 60000; }
  init({ windowMs }) { this.windowMs = windowMs; }
  live(key) {
    const row = this.map.get(key);
    if (row && row.resetTime > new Date()) return row;
    this.map.delete(key);
    return undefined;
  }
  get(key) { const row = this.live(key); return row ? { ...row } : undefined; }
  increment(key) {
    const row = this.live(key) || { totalHits: 0, resetTime: new Date(Date.now() + this.windowMs) };
    row.totalHits += 1;
    this.map.set(key, row);
    return { ...row };
  }
  decrement(key) { const row = this.live(key); if (row && row.totalHits > 0) row.totalHits -= 1; }
  resetKey(key) { this.map.delete(key); }
}

const COLLECTION = 'ratelimitcounters';
let indexPromise = null;

function collection() {
  const col = mongoose.connection.db.collection(COLLECTION);
  if (!indexPromise) {
    indexPromise = col.createIndex({ resetAt: 1 }, { expireAfterSeconds: 0 }).catch((err) => {
      indexPromise = null;
      logger.warn('Rate-limit TTL index not created', { error: err.message });
    });
  }
  return col;
}

class MongoRateLimitStore {
  constructor({ prefix = 'rl:' } = {}) {
    this.prefix = prefix;
    this.localKeys = false;
    this.memory = new LocalCounts();
  }

  init(options) {
    this.windowMs = options.windowMs;
    this.memory.init(options);
  }

  ready() {
    return mongoose.connection.readyState === 1 && !!mongoose.connection.db;
  }

  id(key) {
    return `${this.prefix}${key}`;
  }

  async get(key) {
    if (!this.ready()) return this.memory.get(key);
    try {
      const doc = await collection().findOne({ _id: this.id(key) });
      if (!doc || doc.resetAt <= new Date()) return undefined;
      return { totalHits: doc.hits, resetTime: doc.resetAt };
    } catch {
      return this.memory.get(key);
    }
  }

  async increment(key) {
    if (!this.ready()) return this.memory.increment(key);
    const now = new Date();
    const expired = { $lte: [{ $ifNull: ['$resetAt', new Date(0)] }, now] };
    try {
      // One atomic pipeline update: start a new window if the old one ended, else add a hit.
      const doc = await collection().findOneAndUpdate(
        { _id: this.id(key) },
        [{
          $set: {
            hits: { $cond: [expired, 1, { $add: ['$hits', 1] }] },
            resetAt: { $cond: [expired, new Date(now.getTime() + this.windowMs), '$resetAt'] }
          }
        }],
        { upsert: true, returnDocument: 'after' }
      );
      const row = doc && doc.value !== undefined ? doc.value : doc; // driver v5 vs v6 result shape
      return { totalHits: row.hits, resetTime: row.resetAt };
    } catch (err) {
      logger.warn('Rate-limit store fell back to memory', { error: err.message });
      return this.memory.increment(key);
    }
  }

  async decrement(key) {
    if (!this.ready()) return this.memory.decrement(key);
    await collection().updateOne({ _id: this.id(key), hits: { $gt: 0 } }, { $inc: { hits: -1 } }).catch(() => this.memory.decrement(key));
  }

  async resetKey(key) {
    await this.memory.resetKey(key);
    if (this.ready()) await collection().deleteOne({ _id: this.id(key) }).catch(() => undefined);
  }
}

module.exports = { MongoRateLimitStore, COLLECTION };
