/**
 * Stock Alert: "tell me when a store near me has this again".
 *
 * Fired when a store's count for the medicine goes from 0 to above 0 and the
 * store delivers to the patient's saved point. One notification per alert;
 * alerts lapse after 14 days so nobody gets pinged about a need long gone.
 */

const mongoose = require('mongoose');

const StockAlertSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
  point: {
    type: { type: String, enum: ['Point'], required: true },
    coordinates: { type: [Number], required: true } // [lng, lat]
  },
  status: { type: String, enum: ['ACTIVE', 'NOTIFIED', 'CANCELLED', 'EXPIRED'], default: 'ACTIVE' },
  notifiedAt: Date,
  notifiedVendor: { type: mongoose.Schema.Types.ObjectId, ref: 'PharmacyVendor' },
  expiresAt: { type: Date, required: true }
}, {
  timestamps: true
});

StockAlertSchema.index({ medicine: 1, status: 1, point: '2dsphere' });
StockAlertSchema.index({ patient: 1, medicine: 1, status: 1 });
StockAlertSchema.index({ status: 1, expiresAt: 1 });

module.exports = mongoose.models.StockAlert || mongoose.model('StockAlert', StockAlertSchema);
