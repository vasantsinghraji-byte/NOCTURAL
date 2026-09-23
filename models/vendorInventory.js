/**
 * Vendor Inventory Model
 *
 * A pharmacy vendor's own listing of a master Medicine: their price and
 * live stock. One row per (vendor, medicine) pair.
 */

const mongoose = require('mongoose');

const VendorInventorySchema = new mongoose.Schema({
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PharmacyVendor',
    required: true
  },
  medicine: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Medicine',
    required: true
  },

  mrp: { type: Number, required: true, min: 0 },
  sellingPrice: { type: Number, required: true, min: 0 },
  // Convenience denormalised discount %, recomputed on save.
  discountPercentage: { type: Number, default: 0, min: 0, max: 100 },

  // On-hand units. Changed only with atomic $inc (orders) or explicit vendor
  // counts; every change is also written to InventoryMovement.
  stockQty: { type: Number, default: 0, min: 0 },
  lowStockThreshold: { type: Number, default: 5, min: 0 },

  // LISTED flag — the vendor's intent to sell this item. Deliberately separate
  // from stock (Blinkit's listed vs in_stock): running out must not delist,
  // and restocking/cancellations must never re-list an item the vendor
  // switched off. Orderable = isAvailable && stockQty > 0.
  isAvailable: { type: Boolean, default: true },
  batchNumber: String,
  expiryDate: Date
}, {
  timestamps: true
});

// One listing per medicine per vendor.
VendorInventorySchema.index({ vendor: 1, medicine: 1 }, { unique: true });
VendorInventorySchema.index({ vendor: 1, isAvailable: 1 });
VendorInventorySchema.index({ medicine: 1, isAvailable: 1 });

// Synchronous (no `next`) hook — matches the codebase convention; this
// environment's Mongoose does not pass a `next` callback to pre-hooks.
VendorInventorySchema.pre('save', function computeDiscount() {
  if (this.mrp > 0 && this.sellingPrice >= 0 && this.sellingPrice <= this.mrp) {
    this.discountPercentage = Math.round(((this.mrp - this.sellingPrice) / this.mrp) * 100);
  } else {
    this.discountPercentage = 0;
  }
});

VendorInventorySchema.virtual('inStock').get(function inStock() {
  return this.isAvailable && this.stockQty > 0;
});

module.exports = mongoose.models.VendorInventory
  || mongoose.model('VendorInventory', VendorInventorySchema);
