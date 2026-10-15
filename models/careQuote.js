/**
 * Care Quote Model
 *
 * The bill a customer sees before booking a marketplace plan, locked for a few
 * minutes. Booking uses the quote, never prices sent by the app; if the shop's
 * prices changed since (rate card version), the customer confirms again.
 * Single use. Old quotes are removed by a TTL index a day after expiry.
 */
const mongoose = require('mongoose');
const { CARE_MODES, PLAN_PAYMENT_MODES } = require('../constants/marketplace');

const CareQuoteSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'CareStore', required: true },
  rateCardItem: { type: mongoose.Schema.Types.ObjectId, ref: 'RateCardItem', required: true },
  rateCardVersion: { type: Number, required: true },
  storeTravelRate: Number, // ₹/km at quote time
  service: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceCatalog', required: true },
  serviceName: String,
  mode: { type: String, enum: CARE_MODES, required: true },
  sessions: { type: Number, required: true, min: 1 },
  paymentMode: { type: String, enum: PLAN_PAYMENT_MODES, required: true },
  durationMinutes: Number,

  schedule: {
    startDate: String, // YYYY-MM-DD
    weekdays: [Number], // 0 = Sunday
    time: String, // HH:MM (IST)
    dates: [String]
  },

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

  proposal: { type: mongoose.Schema.Types.ObjectId, ref: 'PlanProposal' },
  travel: {
    waived: { type: Boolean, default: false }, // same address and day as another booked session
    liveInOnce: { type: Boolean, default: false }, // live-in care: travel on the first day only
    straightKm: Number,
    roadKm: Number,
    chargedKm: Number,
    ratePerKm: Number,
    perSession: { type: Number, default: 0 }
  },

  amounts: {
    listPricePerSession: Number, // the shop's price for one session
    discountPercent: { type: Number, default: 0 },
    servicePerSession: Number, // after the plan discount
    serviceSubtotal: Number, // list price × sessions
    discount: { type: Number, default: 0 },
    offer: { type: Number, default: 0 }, // shop's new-customer offer, on the first session
    creditAvailable: { type: Number, default: 0 },
    travelTotal: { type: Number, default: 0 },
    platformFee: { type: Number, default: 0 },
    gst: { type: Number, default: 0 },
    total: Number, // whole plan
    perSessionPayable: Number // PER_SESSION: what each visit costs
  },
  // The first session when an offer makes it cheaper than the rest.
  firstSession: {
    servicePrice: Number,
    platformFee: Number,
    gst: Number,
    payable: Number
  },
  memberFeeWaived: { type: Boolean, default: false },
  lines: [{ _id: false, code: String, label: String, amount: Number }],

  expiresAt: { type: Date, required: true },
  usedAt: Date,
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'CarePlan' }
}, { timestamps: true });

CareQuoteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });
CareQuoteSchema.index({ patient: 1, createdAt: -1 });

module.exports = mongoose.models.CareQuote || mongoose.model('CareQuote', CareQuoteSchema);
