/**
 * ChatThread: the conversation between a customer and the provider on one
 * booking (care visit, pharmacy order or lab order). It exists only while the
 * two are connected by that booking; services/chatService.js decides when it
 * is open. One thread per booking.
 */

const mongoose = require('mongoose');

const ChatThreadSchema = new mongoose.Schema({
  kind: { type: String, enum: ['CARE', 'PHARMACY', 'LAB'], required: true },
  ref: { type: mongoose.Schema.Types.ObjectId, required: true }, // the booking / order id
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  provider: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, maxlength: 120 }, // e.g. "Wound dressing · 12 Oct"
  lastMessage: {
    text: { type: String, maxlength: 140 },
    at: Date,
    by: { type: String, enum: ['patient', 'provider', 'system'] }
  },
  unread: {
    patient: { type: Number, default: 0, min: 0 },
    provider: { type: Number, default: 0, min: 0 }
  }
}, { timestamps: true });

ChatThreadSchema.index({ kind: 1, ref: 1 }, { unique: true });
ChatThreadSchema.index({ patient: 1, updatedAt: -1 });
ChatThreadSchema.index({ provider: 1, updatedAt: -1 });

module.exports = mongoose.models.ChatThread || mongoose.model('ChatThread', ChatThreadSchema);
