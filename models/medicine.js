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

const norm = (value) => String(value || '').toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9.%/+-]/g, '');

/**
 * "paracetamol:650mg|tablet" — ingredients sorted so "A + B" and "B + A" match.
 * Falls back to genericName + strength when composition isn't filled in.
 */
function deriveSaltKey(med) {
  const parts = (med.composition || [])
    .filter((c) => c && c.ingredient)
    .map((c) => `${norm(c.ingredient)}:${norm(c.strength)}`)
    .sort();
  let salts = parts.join('+');
  if (!salts && med.genericName) salts = `${norm(med.genericName)}:${norm(med.strength)}`;
  if (!salts) return undefined;
  return `${salts}|${norm(med.form || 'OTHER')}`;
}

/**
 * Why this product can't be sold online (null when it can). Schedule X
 * (narcotic/psychotropic) needs special records and in-person dispensing.
 */
function onlineSaleBlockReason(med) {
  if (!med) return 'NOT_FOUND';
  if (med.isActive === false) return 'INACTIVE';
  if (med.isBanned) return 'BANNED';
  if (med.isDiscontinued) return 'DISCONTINUED';
  if (med.scheduleType === 'SCHEDULE_X') return 'SCHEDULE_X';
  return null;
}

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
  requiresPrescription: { type: Boolean, default: false },

  // Same active ingredient(s) + strength + form = interchangeable brands
  // ("Dolo 650" and "Calpol 650" share one key). Derived on validate; used to
  // offer substitutes, never to swap silently.
  saltKey: { type: String, index: true },
  // Units in one sellable pack (15 for a strip of 15) for per-unit price compare.
  packUnits: { type: Number, min: 1 },
  barcodes: [{ type: String, trim: true }],
  // Needs 2-8°C storage (insulin, some vaccines): only stores with a fridge.
  coldChain: { type: Boolean, default: false },
  // Government-banned (e.g. banned fixed-dose combinations) or withdrawn by
  // the maker: never sold, delisted everywhere at once.
  isBanned: { type: Boolean, default: false },
  isDiscontinued: { type: Boolean, default: false },
  // Per-order cap for habit-forming / misuse-prone products (codeine syrups…).
  maxQtyPerOrder: { type: Number, min: 1 },
  // Per-patient cap across all stores in a rolling 30 days.
  maxQtyPerMonth: { type: Number, min: 1 },
  // Misuse-prone (sedatives, codeine, pregabalin…): orders get risk checks.
  habitForming: { type: Boolean, default: false },
  // Set when an admin folds this duplicate into another product.
  mergedInto: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' }
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
  const key = deriveSaltKey(this);
  if (key) this.saltKey = key;
});

MedicineSchema.index({ name: 'text', genericName: 'text', brand: 'text' });
MedicineSchema.index({ category: 1, isActive: 1 });
MedicineSchema.index({ scheduleType: 1 });

MedicineSchema.index({ barcodes: 1 }, { sparse: true });

const Medicine = mongoose.models.Medicine || mongoose.model('Medicine', MedicineSchema);
Medicine.deriveSaltKey = deriveSaltKey;
Medicine.onlineSaleBlockReason = onlineSaleBlockReason;
module.exports = Medicine;
