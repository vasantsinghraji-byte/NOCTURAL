/**
 * Inventory Movement Model (append-only stock ledger)
 *
 * Every change to a vendor's stock is recorded here: order reservations,
 * releases (cancel/reject/payment expiry), and manual vendor adjustments.
 *
 *   - Source of truth for *current* stock stays VendorInventory.stockQty
 *     (changed with atomic $inc). This ledger is the audit trail that lets
 *     ops explain every unit — "why is paracetamol at 0?" — and reconcile.
 *   - Pharmacy compliance: movements link order → patient → prescription, the
 *     raw material for the Schedule H1 register (drug, quantity, patient,
 *     prescriber, date) Indian pharmacies must maintain.
 *
 * Never update or delete rows; correct mistakes with a new ADJUSTMENT.
 */

const mongoose = require('mongoose');
const { INVENTORY_MOVEMENT_TYPES } = require('../constants/enums');

const InventoryMovementSchema = new mongoose.Schema({
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'PharmacyVendor', required: true },
  medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
  type: { type: String, enum: INVENTORY_MOVEMENT_TYPES, required: true },
  // Signed change in on-hand units: negative = out of stock, positive = back in.
  delta: { type: Number, required: true },
  // Stock after this movement when known (atomic ops return it).
  balanceAfter: { type: Number, min: 0 },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'PharmacyOrder' },
  actor: {
    kind: { type: String, enum: ['PATIENT', 'VENDOR', 'ADMIN', 'SYSTEM'], default: 'SYSTEM' },
    id: mongoose.Schema.Types.ObjectId
  },
  reason: { type: String, maxlength: 300 }
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

InventoryMovementSchema.index({ vendor: 1, medicine: 1, createdAt: -1 });
InventoryMovementSchema.index({ order: 1 }, { sparse: true });
InventoryMovementSchema.index({ vendor: 1, type: 1, createdAt: -1 });

module.exports = mongoose.models.InventoryMovement
  || mongoose.model('InventoryMovement', InventoryMovementSchema);
