/**
 * Plan Proposal Model
 *
 * After a visit the professional suggests a treatment plan ("10 sessions of
 * neuro rehab at home"). Nothing is booked until the customer accepts, picks
 * the days and pays; prices always come from the shop's rate card.
 */
const mongoose = require('mongoose');

const PlanProposalSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'CareStore', required: true },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  fromBooking: { type: mongoose.Schema.Types.ObjectId, ref: 'NurseBooking', required: true },
  proposedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  service: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceCatalog', required: true },
  serviceName: String,
  mode: { type: String, enum: ['HOME', 'CLINIC'], required: true },
  sessions: { type: Number, required: true, min: 1, max: 100 },
  sessionsPerWeek: { type: Number, min: 1, max: 7 },
  note: { type: String, maxlength: 500 },
  status: { type: String, enum: ['PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED'], default: 'PENDING' },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'CarePlan' },
  expiresAt: { type: Date, required: true },
  respondedAt: Date
}, { timestamps: true });

PlanProposalSchema.index({ patient: 1, status: 1, createdAt: -1 });
PlanProposalSchema.index({ store: 1, createdAt: -1 });
// One open proposal per visit.
PlanProposalSchema.index({ fromBooking: 1 }, { unique: true, partialFilterExpression: { status: 'PENDING' } });

module.exports = mongoose.models.PlanProposal || mongoose.model('PlanProposal', PlanProposalSchema);
