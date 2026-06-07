const mongoose = require('mongoose');

const refundOutboxSchema = new mongoose.Schema({
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'NurseBooking',
    required: true,
    index: true
  },
  paymentId: {
    type: String,
    required: true,
    index: true
  },
  gatewayRefundId: {
    type: String,
    index: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'INR'
  },
  status: {
    type: String,
    enum: [
      'REQUESTED',
      'GATEWAY_CONFIRMED',
      'PROCESSING',
      'RETRY_PENDING',
      'COMPLETED',
      'GATEWAY_FAILED',
      'DEAD_LETTER'
    ],
    default: 'REQUESTED',
    index: true
  },
  gatewayStatus: String,
  gatewayResponse: mongoose.Schema.Types.Mixed,
  refundReason: String,
  attemptCount: {
    type: Number,
    default: 0
  },
  maxAttempts: {
    type: Number,
    default: 10
  },
  nextAttemptAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  lockedAt: Date,
  completedAt: Date,
  lastError: String
}, {
  timestamps: true
});

refundOutboxSchema.index({ status: 1, nextAttemptAt: 1 });
refundOutboxSchema.index(
  { booking: 1, paymentId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: {
        $in: ['REQUESTED', 'GATEWAY_CONFIRMED', 'PROCESSING', 'RETRY_PENDING']
      }
    }
  }
);

module.exports = mongoose.models.RefundOutbox || mongoose.model('RefundOutbox', refundOutboxSchema);
