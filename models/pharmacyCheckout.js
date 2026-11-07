/**
 * Pharmacy Checkout: one customer checkout that became orders at more than one
 * store (a cart no single store could fill). Each child PharmacyOrder runs its
 * own store turn, SLA and delivery; this groups them for the customer and for
 * all-or-nothing creation.
 */

const mongoose = require('mongoose');

const PharmacyCheckoutSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  orders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PharmacyOrder' }],
  paymentMode: { type: String, enum: ['PREPAID', 'COD'], default: 'COD' },
  total: { type: Number, min: 0, default: 0 },
  // CREATING while child orders are placed; FAILED if any child failed (the
  // others were cancelled and restocked); PLACED once all exist.
  status: { type: String, enum: ['CREATING', 'PLACED', 'FAILED'], default: 'CREATING' },
  failureReason: { type: String, maxlength: 300 }
}, {
  timestamps: true
});

PharmacyCheckoutSchema.index({ patient: 1, createdAt: -1 });

module.exports = mongoose.models.PharmacyCheckout
  || mongoose.model('PharmacyCheckout', PharmacyCheckoutSchema);
