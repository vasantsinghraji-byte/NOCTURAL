/**
 * Family Link Model ("Care Circle")
 *
 * A son or daughter (the helper) helps manage a parent's care (the member):
 * they see the parent's upcoming visits, plans and lab bookings, get every
 * visit update, and book for them. The member must accept first, and either
 * side can end the link. Lab reports stay private to the member.
 */
const mongoose = require('mongoose');

const FamilyLinkSchema = new mongoose.Schema({
  helper: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  member: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  relation: { type: String, maxlength: 40 }, // as the helper describes the member: "Mother"
  status: { type: String, enum: ['PENDING', 'ACTIVE', 'DECLINED', 'REMOVED'], default: 'PENDING', index: true },
  respondedAt: Date,
  removedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient' }
}, { timestamps: true });

// One live link (pending or active) per pair.
FamilyLinkSchema.index({ helper: 1, member: 1 }, { unique: true, partialFilterExpression: { status: { $in: ['PENDING', 'ACTIVE'] } } });
FamilyLinkSchema.index({ member: 1, status: 1 });

module.exports = mongoose.models.FamilyLink || mongoose.model('FamilyLink', FamilyLinkSchema);
