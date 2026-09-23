/**
 * SettlementEntry: append-only revenue ledger.
 *
 * One row per (source, type): who earns what from a delivered pharmacy order, a
 * completed home-care visit or a membership purchase. Payout rows (VENDOR_PAYOUT,
 * PROVIDER_PAYOUT) start PENDING and are settled in weekly payout runs; platform
 * rows (COMMISSION, DELIVERY_FEE, PLATFORM_FEE, MEMBERSHIP_FEE) are revenue.
 *
 * The unique index makes recording idempotent: replays of the same event insert nothing.
 */

const mongoose = require('mongoose');

const SOURCE_KINDS = ['PHARMACY_ORDER', 'CARE_BOOKING', 'MEMBERSHIP'];
const PARTY_KINDS = ['PLATFORM', 'VENDOR', 'PROVIDER'];
const ENTRY_TYPES = ['VENDOR_PAYOUT', 'PROVIDER_PAYOUT', 'COMMISSION', 'DELIVERY_FEE', 'PLATFORM_FEE', 'MEMBERSHIP_FEE'];
const ENTRY_STATUSES = ['PENDING', 'PAID', 'VOID'];

const SettlementEntrySchema = new mongoose.Schema({
  source: {
    kind: { type: String, enum: SOURCE_KINDS, required: true },
    id: { type: mongoose.Schema.Types.ObjectId, required: true },
    ref: String // human reference: order number, booking id, plan code
  },
  party: {
    kind: { type: String, enum: PARTY_KINDS, required: true },
    id: mongoose.Schema.Types.ObjectId // vendor / provider; empty for PLATFORM
  },
  type: { type: String, enum: ENTRY_TYPES, required: true },
  amount: { type: Number, required: true, min: 0 },
  basis: Number, // the value the rate applied to (items subtotal, visit base price)
  rate: Number,
  currency: { type: String, default: 'INR' },
  status: { type: String, enum: ENTRY_STATUSES, default: 'PENDING' },
  paidAt: Date,
  payoutRef: String,
  occurredAt: { type: Date, required: true }
}, { timestamps: { createdAt: true, updatedAt: true } });

SettlementEntrySchema.index({ 'source.kind': 1, 'source.id': 1, type: 1 }, { unique: true });
SettlementEntrySchema.index({ occurredAt: -1, type: 1 });
SettlementEntrySchema.index({ 'party.kind': 1, 'party.id': 1, status: 1, occurredAt: -1 });

SettlementEntrySchema.statics.SOURCE_KINDS = SOURCE_KINDS;
SettlementEntrySchema.statics.ENTRY_TYPES = ENTRY_TYPES;

module.exports = mongoose.models.SettlementEntry || mongoose.model('SettlementEntry', SettlementEntrySchema);
