/**
 * Ad Campaign Model (docs/product/ADMIN_AND_ADS_GUIDE.md, Part 2).
 *
 * SPONSORED_LISTING  a shop in a sponsored slot of search / service pages (cost per click)
 * SPOTLIGHT          a tile in the customer home carousel (fixed price per week)
 * CATEGORY_BANNER    a banner at the top of a service page (fixed price per week)
 *
 * House ads (house: true) are Nabz's own cards (Plus, a new city): no wallet,
 * shown when no paid ad qualifies.
 */
const mongoose = require('mongoose');

const AD_PRODUCTS = ['SPONSORED_LISTING', 'SPOTLIGHT', 'CATEGORY_BANNER'];
const AD_STATUSES = ['PENDING_REVIEW', 'ACTIVE', 'PAUSED', 'REJECTED', 'ENDED'];

const AdCampaignSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // advertiser login (or admin for house ads)
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'CareStore' }, // the advertised shop
  house: { type: Boolean, default: false },
  product: { type: String, enum: AD_PRODUCTS, required: true },
  kind: { type: String, enum: ['PHYSIO', 'LAB', 'NURSING', 'HOMECARE'] },
  name: { type: String, required: true, maxlength: 80 },
  target: {
    services: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ServiceCatalog' }], // empty = any of the shop's services
    cities: [{ type: String, maxlength: 60 }] // empty = anywhere the shop serves
  },
  creative: {
    title: { type: String, maxlength: 60 },
    subtitle: { type: String, maxlength: 120 },
    imageUrl: { type: String, maxlength: 500 },
    ctaPath: { type: String, maxlength: 120, match: /^\/[A-Za-z0-9\-/_?=&.]*$/ }
  },
  bidCpc: { type: Number, min: 0, max: 1000 }, // sponsored listings
  weeklyPrice: { type: Number, min: 0, max: 1000000 }, // spotlight / banner
  dailyBudget: { type: Number, min: 0, max: 1000000 },
  totalBudget: { type: Number, min: 0, max: 10000000 },
  startAt: { type: Date, required: true },
  endAt: { type: Date, required: true },
  status: { type: String, enum: AD_STATUSES, default: 'PENDING_REVIEW' },
  review: {
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    at: Date,
    reason: { type: String, maxlength: 300 }
  },
  pausedReason: { type: String, maxlength: 200 },
  spend: {
    total: { type: Number, default: 0 },
    day: String, // YYYY-MM-DD of `today`
    today: { type: Number, default: 0 }
  },
  paidUntil: Date // spotlight / banner: weeks paid for
}, { timestamps: true });

AdCampaignSchema.index({ status: 1, product: 1, kind: 1, startAt: 1, endAt: 1 });
AdCampaignSchema.index({ owner: 1, createdAt: -1 });
AdCampaignSchema.index({ store: 1, status: 1 });

AdCampaignSchema.statics.PRODUCTS = AD_PRODUCTS;
AdCampaignSchema.statics.STATUSES = AD_STATUSES;

module.exports = mongoose.models.AdCampaign || mongoose.model('AdCampaign', AdCampaignSchema);
