/**
 * ChatMessage: one line in a ChatThread. TEXT from either side, CALL entries
 * that record an in-app voice call (rang, answered, missed, how long), and
 * SYSTEM notes ("Your nurse is on the way").
 */

const mongoose = require('mongoose');

const CALL_STATUSES = ['RINGING', 'ACTIVE', 'ENDED', 'MISSED', 'DECLINED', 'CANCELLED'];

const ChatMessageSchema = new mongoose.Schema({
  thread: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatThread', required: true },
  from: { type: String, enum: ['patient', 'provider', 'system'], required: true },
  type: { type: String, enum: ['TEXT', 'CALL', 'SYSTEM'], default: 'TEXT' },
  text: { type: String, maxlength: 2000 },
  call: {
    status: { type: String, enum: CALL_STATUSES },
    answeredAt: Date,
    endedAt: Date,
    endedBy: { type: String, enum: ['patient', 'provider', 'system'] },
    seconds: { type: Number, min: 0 }
  },
  readAt: Date
}, { timestamps: true });

ChatMessageSchema.index({ thread: 1, createdAt: -1 });
ChatMessageSchema.index({ type: 1, 'call.status': 1, createdAt: 1 });

ChatMessageSchema.statics.CALL_STATUSES = CALL_STATUSES;

module.exports = mongoose.models.ChatMessage || mongoose.model('ChatMessage', ChatMessageSchema);
