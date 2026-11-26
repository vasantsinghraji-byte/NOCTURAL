/**
 * PartnerDocument: one verification document of a partner (Aadhaar, council
 * registration, drug licence, police clearance...). The file lives in private
 * storage (S3); only the owner's upload flow and audited admin views reach it.
 * A partner can re-submit, so older rows stay as history (`superseded`).
 */

const mongoose = require('mongoose');
const { DOCUMENT_KINDS } = require('../config/partnerDocuments');

const STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'];

const PartnerDocumentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  kind: { type: String, enum: DOCUMENT_KINDS, required: true },
  status: { type: String, enum: STATUSES, default: 'PENDING' },
  source: { type: String, enum: ['UPLOAD', 'DIGILOCKER'], default: 'UPLOAD' },
  // Registration / licence number. For Aadhaar: the last 4 digits only.
  number: { type: String, trim: true, maxlength: 40 },
  expiresAt: Date,
  file: {
    key: { type: String, maxlength: 512 },
    mimeType: String,
    size: Number,
    originalName: { type: String, maxlength: 200 }
  },
  // Data from DigiLocker's signed eAadhaar (no Aadhaar number, no photo).
  digilocker: {
    name: String,
    dob: String,
    gender: String,
    nameMatches: Boolean,
    fetchedAt: Date
  },
  review: {
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    at: Date,
    note: { type: String, maxlength: 300 },
    auto: Boolean,
    // Two-person rule: the first of two admin approvals.
    firstBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    firstAt: Date
  },
  reminderSentAt: Date,
  superseded: { type: Boolean, default: false }
}, { timestamps: true });

PartnerDocumentSchema.index({ user: 1, kind: 1, superseded: 1 });
PartnerDocumentSchema.index({ status: 1, superseded: 1, createdAt: 1 });
PartnerDocumentSchema.index({ status: 1, expiresAt: 1 });

PartnerDocumentSchema.statics.STATUSES = STATUSES;

module.exports = mongoose.models.PartnerDocument || mongoose.model('PartnerDocument', PartnerDocumentSchema);
