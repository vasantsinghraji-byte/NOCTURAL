/**
 * Campaign: an offer or announcement written in the admin panel.
 *
 * Customers and partners see live campaigns in their "Offers & updates" feed
 * (app and website). When push is on, the tick also sends it as a push
 * notification once, at `sendAt` (services/campaignService.js).
 */

const mongoose = require('mongoose');

const AUDIENCES = ['CUSTOMERS', 'PARTNERS', 'MEDICAL_STAFF', 'PHARMACIES'];
const PUSH_STATUSES = ['OFF', 'PENDING', 'SENDING', 'DONE', 'SKIPPED', 'FAILED'];

const CampaignSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 80 },
  body: { type: String, required: true, trim: true, maxlength: 300 },
  // In-app link only (a path like /pharmacy or /nursing?service=PHYSIOTHERAPY).
  cta: {
    label: { type: String, trim: true, maxlength: 24 },
    path: { type: String, trim: true, maxlength: 120, match: /^\/[A-Za-z0-9\-/_?=&.]*$/ }
  },
  offerCode: { type: String, trim: true, uppercase: true, maxlength: 20 },
  audience: { type: String, enum: AUDIENCES, required: true },
  sendAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  push: {
    status: { type: String, enum: PUSH_STATUSES, default: 'OFF' },
    targeted: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    note: { type: String, maxlength: 200 },
    doneAt: Date
  },
  opens: { type: Number, default: 0 },
  cancelledAt: Date,
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

CampaignSchema.index({ audience: 1, sendAt: -1, expiresAt: 1 });
CampaignSchema.index({ 'push.status': 1, sendAt: 1 });
CampaignSchema.index({ createdAt: -1 });

CampaignSchema.statics.AUDIENCES = AUDIENCES;

module.exports = mongoose.models.Campaign || mongoose.model('Campaign', CampaignSchema);
