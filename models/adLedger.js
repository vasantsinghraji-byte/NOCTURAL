/**
 * Ads money and counters.
 *
 * AdWallet       an advertiser's prepaid balance (never below zero) and trust flag
 * AdWalletEntry  every top-up, spend and refund (idempotent by ref)
 * AdStatDaily    views, clicks, spend and bookings per campaign per day
 * AdViewerMark   per viewer + campaign + day: views shown (frequency cap) and
 *                whether a click was already charged; also the 7-day click
 *                memory for booking attribution (TTL)
 */
const mongoose = require('mongoose');

const AdWalletSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  balance: { type: Number, default: 0, min: 0 },
  trusted: { type: Boolean, default: false }, // new campaigns go live without review
  blocked: { type: Boolean, default: false }
}, { timestamps: true });
AdWalletSchema.index({ owner: 1 }, { unique: true });

const AdWalletEntrySchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['TOPUP', 'SPEND', 'REFUND', 'ADJUST'], required: true },
  amount: { type: Number, required: true },
  campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'AdCampaign' },
  ref: { type: String, required: true, maxlength: 160 },
  note: { type: String, maxlength: 200 },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
AdWalletEntrySchema.index({ owner: 1, ref: 1 }, { unique: true });
AdWalletEntrySchema.index({ owner: 1, createdAt: -1 });

const AdStatDailySchema = new mongoose.Schema({
  campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'AdCampaign', required: true },
  date: { type: String, required: true },
  placement: { type: String, required: true },
  city: { type: String, default: '' },
  impressions: { type: Number, default: 0 },
  clicks: { type: Number, default: 0 },
  spend: { type: Number, default: 0 },
  bookings: { type: Number, default: 0 },
  invalidClicks: { type: Number, default: 0 }
}, { timestamps: true });
AdStatDailySchema.index({ campaign: 1, date: 1, placement: 1, city: 1 }, { unique: true });
AdStatDailySchema.index({ date: 1 });

const AdViewerMarkSchema = new mongoose.Schema({
  key: { type: String, required: true }, // viewer|campaign|date
  viewer: { type: String, required: true },
  campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'AdCampaign', required: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'CareStore' },
  views: { type: Number, default: 0 },
  clickedAt: Date,
  attributed: { type: Boolean, default: false },
  expiresAt: { type: Date, required: true }
});
AdViewerMarkSchema.index({ key: 1 }, { unique: true });
AdViewerMarkSchema.index({ viewer: 1, store: 1, clickedAt: -1 });
AdViewerMarkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = {
  AdWallet: mongoose.models.AdWallet || mongoose.model('AdWallet', AdWalletSchema),
  AdWalletEntry: mongoose.models.AdWalletEntry || mongoose.model('AdWalletEntry', AdWalletEntrySchema),
  AdStatDaily: mongoose.models.AdStatDaily || mongoose.model('AdStatDaily', AdStatDailySchema),
  AdViewerMark: mongoose.models.AdViewerMark || mongoose.model('AdViewerMark', AdViewerMarkSchema)
};
