/**
 * Care Plan Model
 *
 * One marketplace booking of N sessions with one shop (e.g. 10 home physio
 * sessions with Dr. A). Each session is an ordinary visit (NurseBooking) linked
 * by `seriesId`, so tracking, the visit code, completion and reviews work as
 * for any visit. Prices are locked here at booking time.
 *
 * Prepaid plans: the customer pays upfront (multi-session discount); the shop
 * is paid per completed session through the settlement ledger. Unused sessions
 * are refunded at the non-discounted price (see carePlanService.refundDue).
 */
const mongoose = require('mongoose');
const { CARE_MODES, CARE_PLAN_STATUSES, PLAN_PAYMENT_MODES } = require('../constants/marketplace');

const CarePlanSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'CareStore', required: true },
  // Who does the sessions (a solo physio = the shop owner).
  practitioner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rateCardItem: { type: mongoose.Schema.Types.ObjectId, ref: 'RateCardItem', required: true },
  service: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceCatalog', required: true },
  serviceName: String,
  serviceType: String, // the visit's serviceType
  mode: { type: String, enum: CARE_MODES, required: true },
  quote: { type: mongoose.Schema.Types.ObjectId, ref: 'CareQuote' },
  seriesId: { type: String, required: true },

  sessionsTotal: { type: Number, required: true, min: 1 },
  sessionsCompleted: { type: Number, default: 0, min: 0 },
  sessionsCancelled: { type: Number, default: 0, min: 0 },

  price: {
    listPricePerSession: Number,
    discountPercent: { type: Number, default: 0 },
    servicePerSession: Number,
    travelPerSession: { type: Number, default: 0 },
    ratePerKm: Number,
    roadKm: Number,
    platformFeePerSession: { type: Number, default: 0 },
    gstPerSession: { type: Number, default: 0 },
    offer: { type: Number, default: 0 },
    travelWaived: { type: Boolean, default: false },
    total: Number
  },
  creditUsed: { type: Number, default: 0 }, // Nabz credit spent on this plan
  proposal: { type: mongoose.Schema.Types.ObjectId, ref: 'PlanProposal' },

  address: {
    label: String,
    street: String,
    landmark: String,
    city: String,
    state: String,
    pincode: String,
    coordinates: { lat: Number, lng: Number }
  },
  patientDetails: {
    name: String,
    age: Number,
    gender: { type: String, enum: ['Male', 'Female', 'Other'] },
    relation: String
  },

  paymentMode: { type: String, enum: PLAN_PAYMENT_MODES, required: true },
  payment: {
    status: { type: String, enum: ['NOT_REQUIRED', 'PENDING', 'PAID', 'FAILED'], default: 'NOT_REQUIRED' },
    amount: Number,
    orderId: String,
    paymentId: String,
    paidAt: Date,
    holdUntil: Date // prepaid: slots free up if not paid by then
  },
  // Money owed back to the customer (prepaid plans); paid out by ops / Razorpay.
  refund: {
    amount: { type: Number, default: 0 },
    // Credits added along the way (e.g. a cheaper address for a prepaid session).
    credit: { type: Number, default: 0 },
    status: { type: String, enum: ['NONE', 'PENDING', 'PROCESSED'], default: 'NONE' },
    reason: String,
    requestedAt: Date,
    processedAt: Date,
    refundId: String
  },

  status: { type: String, enum: CARE_PLAN_STATUSES, default: 'ACTIVE' },
  expiresAt: { type: Date, required: true },
  extensionUsed: { type: Boolean, default: false },
  cancelledAt: Date,
  cancelReason: String
}, { timestamps: true });

CarePlanSchema.index({ patient: 1, createdAt: -1 });
CarePlanSchema.index({ store: 1, status: 1 });
CarePlanSchema.index({ practitioner: 1, status: 1 });
CarePlanSchema.index({ seriesId: 1 }, { unique: true });
CarePlanSchema.index({ status: 1, 'payment.holdUntil': 1 });
CarePlanSchema.index({ status: 1, expiresAt: 1 });

module.exports = mongoose.models.CarePlan || mongoose.model('CarePlan', CarePlanSchema);
