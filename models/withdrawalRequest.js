/**
 * A partner's request to withdraw their available balance.
 *
 * The request snapshots the ledger entries it settles (earnings minus cash the
 * partner already holds). An admin pays it (UPI / bank transfer today; a
 * payouts API later) and marks it PAID with the transfer reference, which
 * marks those entries PAID. REJECTED releases them for the next request.
 */

const mongoose = require('mongoose');

const WithdrawalRequestSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  party: {
    kind: { type: String, enum: ['PROVIDER', 'VENDOR'], required: true },
    id: { type: mongoose.Schema.Types.ObjectId, required: true }
  },
  amount: { type: Number, required: true, min: 0 },
  entries: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SettlementEntry' }],
  // Where the money goes, masked (full details stay encrypted on the user).
  destination: {
    method: { type: String, enum: ['UPI', 'BANK'], required: true },
    display: { type: String, required: true } // e.g. "asha@okicici" or "HDFC ••••4321"
  },
  status: { type: String, enum: ['REQUESTED', 'PAID', 'REJECTED'], default: 'REQUESTED', index: true },
  utr: { type: String, maxlength: 40 },
  note: { type: String, maxlength: 300 },
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  processedAt: Date
}, { timestamps: true });

// One open request per partner at a time (enforced by the database).
WithdrawalRequestSchema.index({ user: 1 }, { unique: true, partialFilterExpression: { status: 'REQUESTED' }, name: 'one_open_withdrawal' });
WithdrawalRequestSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.models.WithdrawalRequest || mongoose.model('WithdrawalRequest', WithdrawalRequestSchema);
