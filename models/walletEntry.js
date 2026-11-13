/**
 * Wallet Entry Model: the customer's Nabz credit, as an append-only ledger.
 *
 * CREDIT  compensation (a professional didn't come, a late lab report) or goodwill
 * DEBIT   credit spent on a booking (restored by a REVERSAL if that booking is
 *         cancelled before anything was delivered)
 * Balance = sum(amount). `ref` makes each event idempotent (unique per patient).
 */
const mongoose = require('mongoose');

const WalletEntrySchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  type: { type: String, enum: ['CREDIT', 'DEBIT', 'REVERSAL'], required: true },
  amount: { type: Number, required: true }, // + for CREDIT/REVERSAL, − for DEBIT
  reason: { type: String, maxlength: 200 },
  ref: { type: String, required: true, maxlength: 120 }, // e.g. "noshow:<bookingId>", "plan:<planId>"
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // admin for goodwill credits
  expiresAt: Date
}, { timestamps: true });

WalletEntrySchema.index({ patient: 1, ref: 1 }, { unique: true });
WalletEntrySchema.index({ patient: 1, createdAt: -1 });

module.exports = mongoose.models.WalletEntry || mongoose.model('WalletEntry', WalletEntrySchema);
