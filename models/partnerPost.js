/**
 * PartnerPost: a photo or short video a partner (nurse, physio, caregiver, lab,
 * pharmacy, clinic) shares on their profile or shop page: their clinic, kit,
 * certificates, a session (with consent). Only partners can post; customers see
 * visible posts. Admins can hide a post (kept for the record, never shown).
 */

const mongoose = require('mongoose');

const PartnerPostSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorRole: { type: String, required: true },
  kind: { type: String, enum: ['IMAGE', 'VIDEO'], required: true },
  key: { type: String, required: true }, // storage key (private bucket)
  mime: { type: String, required: true },
  size: { type: Number, required: true, min: 0 },
  caption: { type: String, trim: true, maxlength: 300 },
  status: { type: String, enum: ['VISIBLE', 'HIDDEN'], default: 'VISIBLE' },
  hiddenReason: { type: String, maxlength: 200 },
  hiddenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  hiddenAt: Date
}, { timestamps: true });

PartnerPostSchema.index({ author: 1, status: 1, createdAt: -1 });
PartnerPostSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.models.PartnerPost || mongoose.model('PartnerPost', PartnerPostSchema);
