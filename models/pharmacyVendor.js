/**
 * Pharmacy Vendor Model
 *
 * A local pharmacy store that fulfils medicine orders on the MedRush
 * marketplace (aggregator model — the store owns its own inventory).
 *
 * The store's login account is a User with role 'pharmacy_vendor' whose
 * `pharmacyVendor` field references this document (mirrors how staff users
 * reference a `hospital`).
 */

const mongoose = require('mongoose');
const { PHARMACY_VENDOR_STATUSES } = require('../constants/enums');
const { geohashForPoint } = require('../utils/geohash');

const OperatingHoursSchema = new mongoose.Schema({
  day: {
    type: String,
    enum: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
    required: true
  },
  open: String, // "09:00"
  close: String, // "22:00"
  isClosed: { type: Boolean, default: false }
}, { _id: false });

const PharmacyVendorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide the pharmacy name'],
    trim: true,
    maxlength: [150, 'Name cannot be more than 150 characters']
  },
  slug: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true
  },

  // Owner / primary login account (role: pharmacy_vendor)
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Contact
  contactPhone: {
    type: String,
    match: [/^[6-9]\d{9}$/, 'Please provide a valid Indian mobile number']
  },
  contactEmail: {
    type: String,
    lowercase: true,
    trim: true
  },

  // Compliance / KYC
  drugLicenseNumber: { type: String, trim: true },
  gstin: { type: String, trim: true, uppercase: true },
  documents: [{
    type: { type: String }, // DRUG_LICENSE, GST_CERTIFICATE, etc.
    url: String,
    uploadedAt: { type: Date, default: Date.now }
  }],

  // Location
  address: {
    line1: String,
    line2: String,
    city: String,
    state: String,
    pincode: String
  },
  // No `default` on `type`: a default creates a partial { type:'Point' } with no
  // coordinates on vendors without a location, which a 2dsphere index rejects.
  // Writers set `type` + `coordinates` together (or omit the field entirely).
  location: {
    type: {
      type: String,
      enum: ['Point']
    },
    coordinates: {
      type: [Number] // [lng, lat]
    }
  },
  // Store's own max delivery distance; the zone's stress multiplier and
  // last-mile cap can shrink it further (services/serviceabilityService.js).
  serviceRadiusKm: {
    type: Number,
    default: 5,
    min: 0.5,
    max: 50
  },
  // Delivery zone the store sits in (optional until ops draws zones).
  zone: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceZone' },
  // Derived from `location` (precision 7 ≈ 150 m cell) for cache keys and
  // supply/demand analytics. Never set by hand.
  geohash: { type: String },

  // Availability
  operatingHours: [OperatingHoursSchema],
  isOpen: { type: Boolean, default: true }, // manual open/closed toggle by vendor
  acceptsPrescriptionOrders: { type: Boolean, default: true },
  minOrderValue: { type: Number, default: 0 },
  deliveryFee: { type: Number, default: 0 },
  avgPreparationMinutes: { type: Number, default: 15 },

  // Lifecycle
  status: {
    type: String,
    enum: PHARMACY_VENDOR_STATUSES,
    default: 'PENDING'
  },
  verifiedAt: Date,
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Payouts (settlement tracked off-platform for MVP)
  payout: {
    accountName: String,
    accountNumber: { type: String, select: false },
    ifsc: String,
    upiId: String,
    commissionPercentage: { type: Number, default: 10 }
  },

  // Ratings
  rating: {
    average: { type: Number, default: 0, min: 0, max: 5 },
    count: { type: Number, default: 0 }
  },

  stats: {
    totalOrders: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    fulfilmentRate: { type: Number, default: 100 }
  },

  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

// Geospatial queries for "vendors near me"
PharmacyVendorSchema.index({ location: '2dsphere' });
PharmacyVendorSchema.index({ status: 1, isActive: 1, isOpen: 1 });
PharmacyVendorSchema.index({ 'address.city': 1, 'address.pincode': 1 });
PharmacyVendorSchema.index({ zone: 1, status: 1 });
PharmacyVendorSchema.index({ geohash: 1 });

// Keep geohash in sync with location. pre('validate') (not 'save') so it
// also runs for insertMany in the seed scripts. No-arg hook (see bug #2).
PharmacyVendorSchema.pre('validate', function deriveGeohash() {
  if (this.isModified('location') || (this.location && !this.geohash)) {
    this.geohash = geohashForPoint(this.location);
  }
});

// Convenience virtual: is the vendor currently orderable?
PharmacyVendorSchema.virtual('isOrderable').get(function isOrderable() {
  return this.isActive && this.isOpen && this.status === 'APPROVED';
});

module.exports = mongoose.models.PharmacyVendor
  || mongoose.model('PharmacyVendor', PharmacyVendorSchema);
