/**
 * CouponRedemption: one use of a coupon on one order.
 *
 * RESERVED  the order was placed with the code (counts against the limits)
 * RELEASED  the order was cancelled, rejected or never paid: the use is given
 *           back (services/couponService.js releases these lazily)
 *
 * The unique index makes a retried order request use a code once.
 */

const mongoose = require('mongoose');

const ORDER_KINDS = ['PHARMACY_ORDER', 'CARE_BOOKING', 'LAB_ORDER', 'CARE_PLAN', 'MEMBERSHIP'];

const CouponRedemptionSchema = new mongoose.Schema({
  coupon: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', required: true },
  code: { type: String, required: true },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  service: { type: String, required: true },
  order: {
    kind: { type: String, enum: ORDER_KINDS, required: true },
    id: { type: mongoose.Schema.Types.ObjectId, required: true }
  },
  // What the order was worth before the discount, and the discount (₹).
  amount: { type: Number, required: true, min: 0 },
  discount: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['RESERVED', 'RELEASED'], default: 'RESERVED' },
  releasedAt: Date,
  releaseReason: { type: String, maxlength: 120 }
}, { timestamps: true });

CouponRedemptionSchema.index({ 'order.kind': 1, 'order.id': 1 }, { unique: true });
CouponRedemptionSchema.index({ coupon: 1, patient: 1, status: 1 });
CouponRedemptionSchema.index({ coupon: 1, status: 1, createdAt: -1 });
CouponRedemptionSchema.statics.ORDER_KINDS = ORDER_KINDS;

module.exports = mongoose.models.CouponRedemption || mongoose.model('CouponRedemption', CouponRedemptionSchema);
