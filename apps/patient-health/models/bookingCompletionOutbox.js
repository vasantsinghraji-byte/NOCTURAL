const mongoose = require('mongoose');

const bookingCompletionOutboxSchema = new mongoose.Schema({
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'NurseBooking',
    required: true
  },
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'RETRY_PENDING', 'DEAD_LETTER'],
    default: 'PENDING',
    index: true
  },
  attemptCount: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now, index: true },
  lockedAt: Date,
  completedAt: Date,
  lastError: String
}, {
  timestamps: true
});

bookingCompletionOutboxSchema.index({ status: 1, nextAttemptAt: 1 });
bookingCompletionOutboxSchema.index(
  { booking: 1 },
  { unique: true, name: 'booking_completion_outbox_unique_idx' }
);

module.exports = mongoose.models.BookingCompletionOutbox ||
  mongoose.model('BookingCompletionOutbox', bookingCompletionOutboxSchema);
