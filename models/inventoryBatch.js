/**
 * Inventory Batch: a store's units of one product from one manufacturing batch.
 *
 * VendorInventory.stockQty stays the single number checkout reserves against
 * (one atomic $inc). Batches break it down so we can:
 *   - dispense earliest-expiry-first (FEFO) and record the batch on each order line
 *   - pull units that fall inside the minimum shelf life out of sellable stock
 *   - recall a batch everywhere and list the patients who received it
 *
 * Invariant (per store + product, for stores that use batches):
 *   stockQty = Σ qty of ACTIVE batches (units reserved for open orders are
 *   already taken off both).
 */

const mongoose = require('mongoose');

const InventoryBatchSchema = new mongoose.Schema({
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'PharmacyVendor', required: true },
  medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
  batchNumber: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
  expiryDate: { type: Date, required: true },
  qty: { type: Number, required: true, min: 0, default: 0 },
  mrp: { type: Number, min: 0 }, // printed on this batch's packs (MRP can change batch to batch)
  // ACTIVE = sellable · QUARANTINED = too close to expiry · RECALLED = pulled by maker/regulator
  status: { type: String, enum: ['ACTIVE', 'QUARANTINED', 'RECALLED'], default: 'ACTIVE' },
  statusReason: { type: String, maxlength: 200 },
  receivedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

InventoryBatchSchema.index({ vendor: 1, medicine: 1, batchNumber: 1 }, { unique: true });
// FEFO allocation and the quarantine sweep.
InventoryBatchSchema.index({ vendor: 1, medicine: 1, status: 1, expiryDate: 1 });
InventoryBatchSchema.index({ status: 1, expiryDate: 1 });
// Recalls look a batch up across every store.
InventoryBatchSchema.index({ medicine: 1, batchNumber: 1 });

module.exports = mongoose.models.InventoryBatch
  || mongoose.model('InventoryBatch', InventoryBatchSchema);
