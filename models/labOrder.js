/**
 * Lab Order Model
 *
 * A customer's tests from ONE path lab (the samples go to one lab), collected
 * at home or at the lab, then tracked to the report. Prices are the lab's rate
 * card at booking time. See docs/product/PROVIDER_MARKETPLACE_PLAN.md.
 *
 *   SCHEDULED → COLLECTED → AT_LAB → PROCESSING → REPORT_READY
 *            ↘ CANCELLED          ↘ SAMPLE_REJECTED (free re-collection order)
 */
const mongoose = require('mongoose');

const LAB_ORDER_STATUSES = ['SCHEDULED', 'COLLECTED', 'AT_LAB', 'PROCESSING', 'REPORT_READY', 'SAMPLE_REJECTED', 'CANCELLED'];

const LabOrderSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'CareStore', required: true },
  items: [{
    _id: false,
    rateCardItem: { type: mongoose.Schema.Types.ObjectId, ref: 'RateCardItem', required: true },
    service: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceCatalog', required: true },
    name: String,
    price: Number,
    sampleType: String,
    fastingHours: Number,
    reportHours: Number
  }],
  mode: { type: String, enum: ['HOME', 'CLINIC'], required: true }, // CLINIC = walk-in at the lab
  slot: {
    date: String, // YYYY-MM-DD IST
    time: String // HH:MM IST
  },
  slotKeys: [{ type: String }],
  // patient|lab|date|time|person while booked: a double tap can't book twice.
  dedupeKey: { type: String, select: false },
  address: {
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
  // Tests that legally need a prescription / consent form.
  prescriptionKey: String,
  consentAt: Date,

  amounts: {
    testsSubtotal: Number,
    collectionFee: { type: Number, default: 0 },
    collectionWaived: { type: Boolean, default: false },
    offer: { type: Number, default: 0 },
    credit: { type: Number, default: 0 }, // Nabz wallet used
    platformFee: { type: Number, default: 0 },
    gst: { type: Number, default: 0 },
    total: Number
  },
  payment: {
    mode: { type: String, enum: ['PREPAID', 'PAY_AT_COLLECTION'], default: 'PAY_AT_COLLECTION' },
    status: { type: String, enum: ['PENDING', 'PAID', 'REFUND_PENDING', 'REFUNDED'], default: 'PENDING' },
    method: { type: String, enum: ['ONLINE', 'CASH', 'UPI'] },
    amount: Number,
    orderId: String,
    paymentId: String,
    paidAt: Date,
    collectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    holdUntil: Date
  },

  status: { type: String, enum: LAB_ORDER_STATUSES, default: 'SCHEDULED' },
  // Who collects (a phlebotomist of the lab).
  phlebotomist: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // Shared by the customer at collection (like the visit code). Never sent to the lab.
  collectionOtp: {
    code: { type: String, select: false },
    failedAttempts: { type: Number, default: 0 },
    verifiedAt: Date
  },
  collectedAt: Date,
  reportDueAt: Date, // collection + the slowest test's report time
  report: {
    key: { type: String, select: false },
    mimeType: String,
    fileName: String,
    uploadedAt: Date,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  rejection: {
    reason: String,
    at: Date,
    recollectionOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'LabOrder' }
  },
  // Free re-collection after a rejected sample points back to the original.
  recollectionOf: { type: mongoose.Schema.Types.ObjectId, ref: 'LabOrder' },
  lateCredit: { amount: Number, at: Date }, // report later than promised
  cancellation: { by: String, reason: String, at: Date },
  timeline: [{ _id: false, status: String, at: { type: Date, default: Date.now }, by: String, note: String }],
  settledAt: Date
}, { timestamps: true });

LabOrderSchema.index({ patient: 1, createdAt: -1 });
LabOrderSchema.index({ store: 1, 'slot.date': 1, status: 1 });
LabOrderSchema.index({ status: 1, reportDueAt: 1 });
LabOrderSchema.index({ 'payment.status': 1, 'payment.holdUntil': 1 });
LabOrderSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });

LabOrderSchema.statics.STATUSES = LAB_ORDER_STATUSES;

module.exports = mongoose.models.LabOrder || mongoose.model('LabOrder', LabOrderSchema);
