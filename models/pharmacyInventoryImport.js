/**
 * Pharmacy Inventory Import: one CSV/Excel stock upload from a store's billing
 * software (Marg, GoFrugal, Busy all export CSV).
 *
 * Rows that match a catalogue product exactly (barcode, then exact name +
 * strength) are applied straight away. Rows we can't match confidently wait
 * in NEEDS_REVIEW with candidate products, and the store picks the right one
 * or skips it. We never guess a match for a medicine.
 */

const mongoose = require('mongoose');

const ImportRowSchema = new mongoose.Schema({
  line: { type: Number, required: true },
  raw: {
    name: String,
    barcode: String,
    mrp: Number,
    sellingPrice: Number,
    stock: Number,
    batchNumber: String,
    expiryDate: Date
  },
  status: { type: String, enum: ['APPLIED', 'NEEDS_REVIEW', 'ERROR', 'SKIPPED'], required: true },
  matchedBy: { type: String, enum: ['BARCODE', 'NAME', 'REVIEW'] },
  medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' },
  candidates: [{
    medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' },
    name: String,
    packSize: String,
    manufacturer: String
  }],
  error: { type: String, maxlength: 300 }
});

const PharmacyInventoryImportSchema = new mongoose.Schema({
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'PharmacyVendor', required: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rows: [ImportRowSchema],
  counts: {
    total: { type: Number, default: 0 },
    applied: { type: Number, default: 0 },
    needsReview: { type: Number, default: 0 },
    errors: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

PharmacyInventoryImportSchema.index({ vendor: 1, createdAt: -1 });

module.exports = mongoose.models.PharmacyInventoryImport
  || mongoose.model('PharmacyInventoryImport', PharmacyInventoryImportSchema);
