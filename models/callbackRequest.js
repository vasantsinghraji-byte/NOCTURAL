/**
 * Callback Request Model
 *
 * "Call me back": a customer (often an older person, or their family) asks
 * Nabz to phone them about a booking, a visit, medicines or a payment. Ops
 * works the queue in the admin panel. The phone number is copied from the
 * account at request time and shown to an admin only on an audited reveal.
 */
const mongoose = require('mongoose');

const TOPICS = ['BOOKING', 'VISIT', 'MEDICINES', 'LAB', 'PAYMENT', 'OTHER'];
const STATUSES = ['OPEN', 'CALLED', 'CLOSED'];

const CallbackRequestSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  name: { type: String, maxlength: 120 },
  phone: { type: String, required: true, maxlength: 20, select: false },
  topic: { type: String, enum: TOPICS, default: 'OTHER' },
  note: { type: String, maxlength: 300 },
  // Where the customer asked from (a booking, plan or order id) so ops has context.
  context: {
    kind: { type: String, enum: ['VISIT', 'PLAN', 'LAB_ORDER', 'PHARMACY_ORDER'] },
    id: { type: mongoose.Schema.Types.ObjectId }
  },
  language: { type: String, enum: ['en', 'hi'], default: 'en' },
  status: { type: String, enum: STATUSES, default: 'OPEN', index: true },
  outcome: { type: String, maxlength: 300 },
  handledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  handledAt: Date,
  // Every time an admin revealed the number (who and when).
  reveals: [{ by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, at: { type: Date, default: Date.now } }]
}, { timestamps: true });

CallbackRequestSchema.index({ status: 1, createdAt: 1 });
// One open request per customer at a time (a second tap returns the same one).
CallbackRequestSchema.index({ patient: 1 }, { unique: true, partialFilterExpression: { status: 'OPEN' } });

module.exports = mongoose.models.CallbackRequest || mongoose.model('CallbackRequest', CallbackRequestSchema);
module.exports.TOPICS = TOPICS;
module.exports.STATUSES = STATUSES;
