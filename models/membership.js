/**
 * Membership: Nabz Plus subscription periods for a patient.
 *
 * One document per paid/trial period; a patient is a member while any ACTIVE
 * period covers "now". Renewals add a new period that starts when the current
 * one ends, so history is kept and refunds are traceable.
 */

const mongoose = require('mongoose');

const MembershipSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  plan: { type: String, required: true }, // e.g. PLUS_MONTHLY (config/revenue.js)
  source: { type: String, enum: ['TRIAL', 'PAID'], required: true },
  // PENDING_PAYMENT = Razorpay checkout opened, not yet verified (never grants benefits).
  status: { type: String, enum: ['PENDING_PAYMENT', 'ACTIVE', 'CANCELLED', 'REFUNDED'], default: 'ACTIVE' },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true },
  amount: { type: Number, default: 0, min: 0 },
  currency: { type: String, default: 'INR' },
  razorpay: {
    orderId: String,
    paymentId: String
  }
}, { timestamps: true });

MembershipSchema.index({ patient: 1, status: 1, endsAt: -1 });
MembershipSchema.index({ 'razorpay.orderId': 1 }, { sparse: true });
// A captured payment can activate at most one period (verify is idempotent).
MembershipSchema.index({ 'razorpay.paymentId': 1 }, { unique: true, partialFilterExpression: { 'razorpay.paymentId': { $type: 'string' } } });
// One free trial per patient, ever.
MembershipSchema.index({ patient: 1, source: 1 }, { unique: true, partialFilterExpression: { source: 'TRIAL' } });

module.exports = mongoose.models.Membership || mongoose.model('Membership', MembershipSchema);
