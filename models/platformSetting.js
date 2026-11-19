/**
 * Platform settings the admin panel changes without a redeploy.
 *
 * PlatformSetting  the live value per key ('revenue' overrides, 'ads' placements)
 * SettingChange    a proposed change: one admin proposes, another approves
 *                  (maker-checker; a single-admin team may approve its own,
 *                  which is logged). Applied changes stay as the history.
 */
const mongoose = require('mongoose');

const PlatformSettingSchema = new mongoose.Schema({
  key: { type: String, required: true, enum: ['revenue', 'ads'] },
  value: { type: mongoose.Schema.Types.Mixed, default: {} },
  version: { type: Number, default: 1 },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true, minimize: false });
PlatformSettingSchema.index({ key: 1 }, { unique: true });

const SettingChangeSchema = new mongoose.Schema({
  key: { type: String, required: true, enum: ['revenue', 'ads'] },
  // [{ path: 'care.customerFeeRate', value: 0.12, previous: 0.15 }]
  changes: [{ _id: false, path: String, value: mongoose.Schema.Types.Mixed, previous: mongoose.Schema.Types.Mixed }],
  reason: { type: String, required: true, maxlength: 300 },
  status: { type: String, enum: ['PENDING', 'APPLIED', 'REJECTED'], default: 'PENDING' },
  proposedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  reviewNote: { type: String, maxlength: 300 },
  selfApproved: { type: Boolean, default: false }
}, { timestamps: true, minimize: false });
SettingChangeSchema.index({ status: 1, createdAt: -1 });

module.exports = {
  PlatformSetting: mongoose.models.PlatformSetting || mongoose.model('PlatformSetting', PlatformSettingSchema),
  SettingChange: mongoose.models.SettingChange || mongoose.model('SettingChange', SettingChangeSchema)
};
