/**
 * Nabz credit (customer wallet). Credits come from compensation (a professional
 * didn't come, a lab report was late) or admin goodwill; they are spent
 * automatically on the next marketplace booking or lab order.
 *
 * Every change is idempotent by `ref` (a retried event credits once) and the
 * balance never goes below zero (conditional $inc), so two bookings at once
 * can't spend the same credit.
 */

const WalletAccount = require('../models/walletAccount');
const WalletEntry = require('../models/walletEntry');
const { round2 } = require('./pricingService');
const { ValidationError } = require('../utils/errors');
const logger = require('../utils/logger');

async function balance(patientId) {
  const acc = await WalletAccount.findOne({ patient: patientId }).lean();
  return round2((acc && acc.balance) || 0);
}

async function history(patientId, limit = 50) {
  return WalletEntry.find({ patient: patientId }).sort({ createdAt: -1 }).limit(limit).lean();
}

/** Add credit once per `ref`. Returns the new balance (or the old one for a repeat). */
async function credit(patientId, amount, { reason, ref, by } = {}) {
  const value = round2(amount);
  if (!(value > 0) || value > 50000) throw new ValidationError('Credit must be ₹0.01–₹50,000');
  if (!ref) throw new ValidationError('A credit needs a reference');
  try {
    await WalletEntry.create({ patient: patientId, type: 'CREDIT', amount: value, reason: reason && String(reason).slice(0, 200), ref: String(ref).slice(0, 120), by });
  } catch (err) {
    if (err && err.code === 11000) return balance(patientId); // already credited
    throw err;
  }
  const acc = await WalletAccount.findOneAndUpdate({ patient: patientId }, { $inc: { balance: value } }, { upsert: true, returnDocument: 'after' });
  logger.info('Wallet credited', { patientId: String(patientId), amount: value, ref });
  return round2(acc.balance);
}

/**
 * Spend up to `max` of the balance for `ref`. Returns what was actually used
 * (0 if there's no balance). Safe under concurrency.
 */
async function spend(patientId, max, ref) {
  const want = round2(max);
  if (!(want > 0)) return 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const acc = await WalletAccount.findOne({ patient: patientId }).lean();
    const use = round2(Math.min(want, (acc && acc.balance) || 0));
    if (!(use > 0)) return 0;
    const taken = await WalletAccount.findOneAndUpdate({ patient: patientId, balance: { $gte: use } }, { $inc: { balance: -use } }, { returnDocument: 'after' });
    if (!taken) continue; // someone else spent it first; re-read
    try {
      await WalletEntry.create({ patient: patientId, type: 'DEBIT', amount: -use, reason: 'Used on a booking', ref: `spend:${ref}` });
    } catch (err) {
      // Already spent for this ref (a retry): give the second deduction back.
      await WalletAccount.updateOne({ patient: patientId }, { $inc: { balance: use } });
      if (err && err.code === 11000) {
        const prior = await WalletEntry.findOne({ patient: patientId, ref: `spend:${ref}` }).lean();
        return prior ? round2(-prior.amount) : 0;
      }
      throw err;
    }
    return use;
  }
  return 0;
}

/** Give back what a booking spent (it was cancelled before anything was delivered). Once per ref. */
async function reverse(patientId, ref) {
  const spent = await WalletEntry.findOne({ patient: patientId, ref: `spend:${ref}` }).lean();
  if (!spent) return 0;
  const amount = round2(-spent.amount);
  try {
    await WalletEntry.create({ patient: patientId, type: 'REVERSAL', amount, reason: 'Booking cancelled', ref: `reverse:${ref}` });
  } catch (err) {
    if (err && err.code === 11000) return 0;
    throw err;
  }
  await WalletAccount.updateOne({ patient: patientId }, { $inc: { balance: amount } }, { upsert: true });
  return amount;
}

module.exports = { balance, history, credit, spend, reverse };
