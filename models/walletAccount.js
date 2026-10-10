/**
 * Wallet Account Model: the customer's current Nabz credit balance. Changed
 * only with conditional $inc (never below zero), alongside a WalletEntry row.
 */
const mongoose = require('mongoose');

const WalletAccountSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  balance: { type: Number, default: 0, min: 0 }
}, { timestamps: true });

WalletAccountSchema.index({ patient: 1 }, { unique: true });

module.exports = mongoose.models.WalletAccount || mongoose.model('WalletAccount', WalletAccountSchema);
