/**
 * Coupon: a discount code made in the admin panel ("Plans & coupons").
 *
 * Nabz pays for the discount: it comes off the customer's bill, never off what
 * a store or professional earns (services/couponService.js, settlement
 * COUPON_DISCOUNT). Each use is a CouponRedemption tied to one order, so the
 * limits hold even when two customers apply the last use at the same moment.
 */

const mongoose = require('mongoose');

const CODE = /^[A-Z0-9]{3,20}$/;
// Where a code can be used.
const COUPON_SERVICES = ['PHARMACY', 'CARE_VISIT', 'LAB', 'CARE_PLAN', 'MEMBERSHIP'];

const CouponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true, match: CODE },
  // Shown to the customer when the code is applied, e.g. "20% off your first medicine order".
  description: { type: String, required: true, trim: true, minlength: 3, maxlength: 120 },
  kind: { type: String, enum: ['PERCENT', 'FLAT'], required: true },
  // PERCENT: 1-100 (%). FLAT: rupees.
  value: { type: Number, required: true, min: 1, max: 100000 },
  // Most a PERCENT code can take off (₹); empty = no cap.
  maxDiscount: { type: Number, min: 1, max: 100000 },
  // The order (before fees) must be at least this much (₹).
  minOrder: { type: Number, default: 0, min: 0, max: 1000000 },
  services: { type: [{ type: String, enum: COUPON_SERVICES }], validate: [(v) => Array.isArray(v) && v.length > 0, 'Pick at least one service'] },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true },
  // Uses across all customers; empty = unlimited.
  totalLimit: { type: Number, min: 1, max: 1000000 },
  perCustomerLimit: { type: Number, default: 1, min: 1, max: 100 },
  // Only for a customer's first order of that service on Nabz.
  firstOrderOnly: { type: Boolean, default: false },
  // Only customers whose mobile number is verified (OTP). One number = one
  // account, so one person can't collect the offer on many email accounts.
  // Always applies to first-order codes.
  requireVerifiedPhone: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
  // Live uses (reserved or used); a cancelled order gives its use back.
  usedCount: { type: Number, default: 0, min: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

CouponSchema.index({ active: 1, endsAt: 1 });
CouponSchema.statics.CODE = CODE;
CouponSchema.statics.SERVICES = COUPON_SERVICES;

module.exports = mongoose.models.Coupon || mongoose.model('Coupon', CouponSchema);
