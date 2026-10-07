/**
 * Care Store Model
 *
 * A physio, physio clinic or path lab as a "shop" on the care marketplace
 * (docs/product/PROVIDER_MARKETPLACE_PLAN.md). Its prices live on its rate card
 * (RateCardItem, one row per catalog service), like a restaurant's menu.
 *
 * Times are India time ("HH:MM"); a day can have several ranges (a physio who
 * works 08:00–12:00 and 17:00–21:00).
 */
const mongoose = require('mongoose');
const { STORE_KINDS, STORE_FORMATS, STORE_STATUSES, WEEKDAYS } = require('../constants/marketplace');

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const HoursSchema = new mongoose.Schema({
  day: { type: String, enum: WEEKDAYS, required: true },
  open: { type: String, match: TIME, required: true },
  close: { type: String, match: TIME, required: true }
}, { _id: false });

const PointSchema = new mongoose.Schema({
  type: { type: String, enum: ['Point'], default: 'Point' },
  coordinates: { type: [Number], required: true } // [lng, lat]
}, { _id: false });

const CareStoreSchema = new mongoose.Schema({
  kind: { type: String, enum: STORE_KINDS, required: true },
  format: { type: String, enum: STORE_FORMATS, required: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Professionals working here (a clinic's physios, a lab's phlebotomists).
  members: [{
    _id: false,
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['PRACTITIONER', 'MANAGER', 'PHLEBOTOMIST'], default: 'PRACTITIONER' },
    active: { type: Boolean, default: true }
  }],

  // Council registration (physio) or NABL certificate (lab): one shop per number,
  // so one person can't list twice to appear twice in search.
  registration: {
    number: { type: String, trim: true, uppercase: true, maxlength: 60 },
    body: { type: String, trim: true, maxlength: 80 }, // e.g. "Rajasthan Physiotherapy Council", "NABL"
    accredited: { type: Boolean, default: false } // NABL for labs, set by ops
  },

  // Public profile
  bio: { type: String, maxlength: 600 },
  photos: [{ type: String, maxlength: 500 }],
  languages: [{ type: String, maxlength: 30 }],
  gender: { type: String, enum: ['FEMALE', 'MALE', 'OTHER'] }, // solo professionals
  qualification: { type: String, maxlength: 80 },
  experienceYears: { type: Number, min: 0, max: 70 },

  address: {
    line1: { type: String, trim: true, maxlength: 200 },
    line2: { type: String, trim: true, maxlength: 200 },
    city: { type: String, trim: true, maxlength: 80 },
    state: { type: String, trim: true, maxlength: 80 },
    pincode: { type: String, match: /^\d{6}$/ }
  },
  // Clinic / lab position (also where home trips start unless home.base is set).
  location: { type: PointSchema, required: true },

  clinic: {
    enabled: { type: Boolean, default: true },
    // Patients seen at the same time (beds or physios). A solo physio is 1.
    capacity: { type: Number, default: 1, min: 1, max: 20 },
    hours: [HoursSchema]
  },
  home: {
    enabled: { type: Boolean, default: false },
    radiusKm: { type: Number, default: 8, min: 1, max: 100 },
    // Inside the Nabz band (config/revenue.js care.travel); checked by the service.
    ratePerKm: { type: Number, default: 12, min: 0, max: 1000 },
    // Trips start from the clinic, or from this base (a physio working from home).
    base: { type: PointSchema, default: undefined },
    // Minutes kept free after each home visit to reach the next one.
    bufferMinutes: { type: Number, default: 30, min: 0, max: 180 },
    // Home visits at the same time (a clinic with several visiting physios).
    capacity: { type: Number, default: 1, min: 1, max: 20 },
    hours: [HoursSchema]
  },

  // Days off ("YYYY-MM-DD", inclusive). New bookings skip them.
  leave: [{
    from: { type: String, match: /^\d{4}-\d{2}-\d{2}$/, required: true },
    to: { type: String, match: /^\d{4}-\d{2}-\d{2}$/, required: true },
    reason: { type: String, maxlength: 120 }
  }],

  status: { type: String, enum: STORE_STATUSES, default: 'PENDING' },
  statusReason: { type: String, maxlength: 300 },
  // "Not taking new bookings" (like a restaurant closing for the day). Existing bookings stay.
  isPaused: { type: Boolean, default: false },

  rating: {
    avg: { type: Number, default: 0, min: 0, max: 5 },
    count: { type: Number, default: 0, min: 0 }
  },
  // Reliability: no-shows, extra cash asked at the door, etc.
  strikes: [{
    _id: false,
    at: { type: Date, default: Date.now },
    reason: { type: String, maxlength: 200 },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'NurseBooking' }
  }]
}, { timestamps: true });

CareStoreSchema.index({ location: '2dsphere' });
CareStoreSchema.index({ kind: 1, status: 1, isPaused: 1 });
CareStoreSchema.index({ owner: 1, kind: 1 }, { unique: true });
CareStoreSchema.index({ 'members.user': 1 });
CareStoreSchema.index(
  { kind: 1, 'registration.number': 1 },
  { unique: true, partialFilterExpression: { 'registration.number': { $type: 'string' } } }
);

/** Where home trips start: the base if set, else the clinic. */
CareStoreSchema.methods.tripOrigin = function tripOrigin() {
  const point = (this.home && this.home.base && this.home.base.coordinates && this.home.base.coordinates.length === 2)
    ? this.home.base : this.location;
  return { lng: point.coordinates[0], lat: point.coordinates[1] };
};

module.exports = mongoose.models.CareStore || mongoose.model('CareStore', CareStoreSchema);
