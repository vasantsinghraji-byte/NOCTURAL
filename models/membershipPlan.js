/**
 * MembershipPlan: a Nabz Plus plan the admin panel sells (e.g. monthly,
 * quarterly). While the collection is empty the plan in config/revenue.js is
 * used; the admin panel copies it here the first time it opens, after which
 * these documents are the source of truth.
 *
 * The code never changes (memberships keep it); price and length changes apply
 * to new checkouts only, because each membership stores what it was sold at.
 */

const mongoose = require('mongoose');

const CODE = /^[A-Z][A-Z0-9_]{2,29}$/;

const MembershipPlanSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true, match: CODE },
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 40 },
  price: { type: Number, required: true, min: 1, max: 100000 },
  days: { type: Number, required: true, min: 1, max: 366 },
  // Short line under the price, e.g. "Best value".
  note: { type: String, trim: true, maxlength: 60 },
  active: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0, min: 0, max: 999 },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

MembershipPlanSchema.index({ active: 1, sortOrder: 1 });
MembershipPlanSchema.statics.CODE = CODE;

module.exports = mongoose.models.MembershipPlan || mongoose.model('MembershipPlan', MembershipPlanSchema);
