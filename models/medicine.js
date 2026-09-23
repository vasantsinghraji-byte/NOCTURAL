/**
 * Medicine Model — global master catalog
 *
 * One document per sellable product (a specific brand/strength/pack).
 * Vendors list their own price & stock for a medicine via VendorInventory,
 * so this master stays canonical and de-duplicated across pharmacies.
 */

const mongoose = require('mongoose');
const {
  MEDICINE_FORMS,
  MEDICINE_SCHEDULE_TYPES,
  MEDICINE_CATEGORIES
} = require('../constants/enums');

const MedicineSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide the medicine name'],
    trim: true,
    maxlength: [200, 'Name cannot be more than 200 characters']
  },
  slug: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true
  },

  genericName: { type: String, trim: true }, // salt/composition, e.g. "Paracetamol 500mg"
  composition: [{
    ingredient: String,
    strength: String // "500mg"
  }],
  brand: { type: String, trim: true },
  manufacturer: { type: String, trim: true },

  form: {
    type: String,
    enum: MEDICINE_FORMS,
    default: 'TABLET'
  },
  strength: String, // "500mg", "5mg/ml"
  packSize: String, // "10 tablets", "100ml"

  scheduleType: {
    type: String,
    enum: MEDICINE_SCHEDULE_TYPES,
    default: 'OTC'
  },
  category: {
    type: String,
    enum: MEDICINE_CATEGORIES,
    default: 'OTHER'
  },

  hsn: String, // HSN tax code
  gstPercentage: { type: Number, default: 12 },

  images: [String],
  description: String,
  usage: String,
  sideEffects: [String],
  warnings: [String],

  // Reference MRP (each vendor sets their own selling price in inventory)
  referenceMrp: { type: Number, min: 0 },

  isActive: { type: Boolean, default: true },
  // A medicine that dispenses only against a valid prescription.
  requiresPrescription: { type: Boolean, default: false }
}, {
  timestamps: true
});

// Keep requiresPrescription in sync with scheduleType.
// NOTE: synchronous (no `next`) hook style — the callback style throws
// "next is not a function" under Model.insertMany() in Mongoose 9.
MedicineSchema.pre('validate', function syncPrescriptionFlag() {
  if (this.scheduleType && this.scheduleType !== 'OTC') {
    this.requiresPrescription = true;
  }
});

MedicineSchema.index({ name: 'text', genericName: 'text', brand: 'text' });
MedicineSchema.index({ category: 1, isActive: 1 });
MedicineSchema.index({ scheduleType: 1 });

module.exports = mongoose.models.Medicine
  || mongoose.model('Medicine', MedicineSchema);
