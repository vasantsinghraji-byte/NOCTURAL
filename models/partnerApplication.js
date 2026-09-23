/**
 * PartnerApplication: someone asking to join Nabz as medical staff, a pharmacy,
 * a path lab or a delivery partner.
 *
 * Partner roles are never self-assigned: an application is reviewed by a
 * platform admin, and only approval creates the partner account/role.
 */

const mongoose = require('mongoose');

const PARTNER_KINDS = ['MEDICAL_STAFF', 'PHARMACY', 'PATH_LAB', 'DELIVERY'];

const PartnerApplicationSchema = new mongoose.Schema({
  kind: { type: String, enum: PARTNER_KINDS, required: true },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  phone: { type: String, required: true, match: [/^[6-9]\d{9}$/, 'Valid Indian mobile number required'] },
  email: { type: String, trim: true, lowercase: true, maxlength: 160 },
  city: { type: String, trim: true, maxlength: 80, default: 'Jaipur' },
  // Role-specific credentials (checked by ops before approval).
  details: {
    qualification: String, // staff: B.Sc Nursing / GNM / BPT …
    registrationNumber: String, // staff: council reg · pharmacy: drug licence · lab: NABL/registration
    experienceYears: Number,
    businessName: String, // pharmacy / lab
    gstin: String,
    address: String,
    vehicle: String // delivery
  },
  documents: [{ kind: String, key: String, uploadedAt: Date }],
  // Who applied, when signed in (Google / phone / email).
  applicant: {
    kind: { type: String, enum: ['PATIENT', 'USER', 'ANONYMOUS'], default: 'ANONYMOUS' },
    id: mongoose.Schema.Types.ObjectId
  },
  review: {
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    at: Date,
    note: String
  }
}, { timestamps: true });

PartnerApplicationSchema.index({ status: 1, kind: 1, createdAt: -1 });
PartnerApplicationSchema.index({ phone: 1, kind: 1 });

PartnerApplicationSchema.statics.PARTNER_KINDS = PARTNER_KINDS;

module.exports = mongoose.models.PartnerApplication || mongoose.model('PartnerApplication', PartnerApplicationSchema);
