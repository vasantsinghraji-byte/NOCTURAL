/**
 * Medicine Refill Model
 *
 * Regular medicines (BP, diabetes, thyroid…) every N days from the same
 * order. Two days before they run out the customer (and their Care Circle)
 * gets a reminder; one tap refills the cart at the same store. Ordering still
 * goes through normal checkout, so stock, prices, prescriptions and payment
 * are always checked again.
 */
const mongoose = require('mongoose');

const MedicineRefillSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'PharmacyVendor', required: true },
  fromOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'PharmacyOrder', required: true },
  items: [{
    _id: false,
    medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
    name: String,
    quantity: { type: Number, min: 1, max: 100, required: true }
  }],
  everyDays: { type: Number, enum: [15, 30, 60, 90], default: 30 },
  nextDue: { type: Date, required: true },
  status: { type: String, enum: ['ACTIVE', 'PAUSED', 'CANCELLED'], default: 'ACTIVE', index: true },
  lastOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'PharmacyOrder' },
  // The due date we already reminded about (one reminder per cycle).
  remindedFor: Date
}, { timestamps: true });

MedicineRefillSchema.index({ status: 1, nextDue: 1 });
// One live refill per order.
MedicineRefillSchema.index({ fromOrder: 1 }, { unique: true, partialFilterExpression: { status: { $in: ['ACTIVE', 'PAUSED'] } } });

module.exports = mongoose.models.MedicineRefill || mongoose.model('MedicineRefill', MedicineRefillSchema);
