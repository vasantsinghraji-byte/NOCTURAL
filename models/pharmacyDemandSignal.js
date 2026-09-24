/**
 * Pharmacy Demand Signal — "people near here wanted X and no store had it".
 *
 * One counter per (medicine, ~5 km geohash cell, day). Feeds a "what to stock"
 * list for stores and ops (Blinkit/Zepto plan dark-store assortment from local
 * demand; for a marketplace of independent chemists this is the lever).
 */

const mongoose = require('mongoose');

const PharmacyDemandSignalSchema = new mongoose.Schema({
  medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
  geohash: { type: String, required: true }, // 5 chars ≈ 4.9 km × 4.9 km
  day: { type: String, required: true }, // YYYY-MM-DD (UTC)
  unmet: { type: Number, default: 0 } // lookups with no nearby store in stock
}, {
  timestamps: true
});

PharmacyDemandSignalSchema.index({ medicine: 1, geohash: 1, day: 1 }, { unique: true });
PharmacyDemandSignalSchema.index({ geohash: 1, day: -1, unmet: -1 });

module.exports = mongoose.models.PharmacyDemandSignal
  || mongoose.model('PharmacyDemandSignal', PharmacyDemandSignalSchema);
