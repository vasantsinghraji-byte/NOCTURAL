/**
 * Rate Card Item Model
 *
 * One line of a care shop's menu: a catalog service at this shop's price, at
 * the clinic and/or at home. One row per (store, service), like the pharmacy's
 * VendorInventory. `version` goes up on every price change, so a quote made
 * from an older price is caught at booking time.
 */
const mongoose = require('mongoose');

const RateCardItemSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'CareStore', required: true },
  service: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceCatalog', required: true },
  kind: { type: String, required: true }, // the store's kind, denormalised for search

  clinic: {
    enabled: { type: Boolean, default: false },
    price: { type: Number, min: 0, max: 1000000 }
  },
  home: {
    enabled: { type: Boolean, default: false },
    price: { type: Number, min: 0, max: 1000000 }
  },
  // Session or shift length (home care shifts up to 24 h).
  durationMinutes: { type: Number, default: 45, min: 10, max: 1440 },
  // Live-in home care: the caregiver stays, so travel is charged once per booking.
  liveIn: { type: Boolean, default: false },

  // "10% off from 10 sessions" — only for plans paid upfront.
  sessionDiscounts: [{
    _id: false,
    minSessions: { type: Number, required: true, min: 2, max: 100 },
    percent: { type: Number, required: true, min: 1, max: 30 }
  }],

  // Labs
  lab: {
    reportHours: { type: Number, min: 1, max: 720 },
    homeCollection: { type: Boolean, default: false }
  },

  // Offer badge, funded by the shop: % off a new customer's first session,
  // capped. Live only after an admin approves it (docs/product/ADMIN_AND_ADS_GUIDE.md).
  offer: {
    percent: { type: Number, min: 5, max: 50 },
    maxDiscount: { type: Number, min: 1, max: 5000 },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'] },
    reason: { type: String, maxlength: 200 },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date
  },

  // An admin may allow a price outside the catalog's floor/ceiling (e.g. a senior sports physio).
  priceApproval: {
    min: Number,
    max: Number,
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date
  },

  isActive: { type: Boolean, default: true },
  version: { type: Number, default: 1 }
}, { timestamps: true });

RateCardItemSchema.index({ store: 1, service: 1 }, { unique: true });
RateCardItemSchema.index({ service: 1, isActive: 1, kind: 1 });

/** Price for a mode, or null when this shop doesn't offer the service there. */
RateCardItemSchema.methods.priceFor = function priceFor(mode) {
  const side = mode === 'HOME' ? this.home : this.clinic;
  return side && side.enabled && Number.isFinite(side.price) ? side.price : null;
};

module.exports = mongoose.models.RateCardItem || mongoose.model('RateCardItem', RateCardItemSchema);
