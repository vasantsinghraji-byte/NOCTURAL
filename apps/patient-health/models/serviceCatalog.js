/**
 * Service Catalog Model
 *
 * Defines all available nursing and physiotherapy services with pricing
 */

const mongoose = require('mongoose');
const { CARE_SUPPLY_SOURCES } = require('../constants/enums');

const ServiceCatalogSchema = new mongoose.Schema({
  // Service Information
  name: {
    type: String,
    required: true,
    unique: true
  },
  slug: {
    type: String,
    required: true,
    unique: true
  },
  category: {
    type: String,
    enum: ['NURSING', 'PHYSIOTHERAPY', 'PACKAGE'],
    required: true
  },
  subCategory: String, // Injection Services, Wound Care, Pain Management, etc.

  // Display Information
  displayName: String,
  shortDescription: String,
  longDescription: String,
  icon: String, // Icon name or URL
  image: String, // Service image URL

  // Pricing
  pricing: {
    basePrice: {
      type: Number,
      required: true
    },
    currency: {
      type: String,
      default: 'INR'
    },
    // For packages
    packageDetails: {
      sessions: Number,
      duration: Number, // days
      pricePerSession: Number,
      totalPrice: Number
    },
    // Dynamic pricing
    surgePricing: {
      enabled: Boolean,
      surgeMultiplier: Number, // 1.5x during high demand
      surgeHours: [{
        start: String, // "18:00"
        end: String    // "22:00"
      }]
    }
  },

  // Service Details
  serviceDetails: {
    duration: {
      type: Number, // in minutes
      default: 60
    },
    equipmentRequired: [String],
    suppliesNeeded: [String],
    skillLevel: {
      type: String,
      enum: ['BASIC', 'INTERMEDIATE', 'ADVANCED', 'SPECIALIST'],
      default: 'BASIC'
    },
    certificationRequired: [String]
  },

  // Availability
  availability: {
    isActive: {
      type: Boolean,
      default: true
    },
    availableCities: [String],
    availableHours: {
      start: String, // "06:00"
      end: String    // "22:00"
    },
    availableDays: [String] // Mon, Tue, Wed, etc.
  },

  // Requirements
  requirements: {
    prescriptionRequired: {
      type: Boolean,
      default: false
    },
    advanceBookingHours: {
      type: Number,
      default: 2 // Minimum 2 hours advance booking
    },
    minAge: Number,
    maxAge: Number,
    contraindications: [String] // Conditions where service shouldn't be provided
  },

  // Supplies the visit needs, each linked to a pharmacy catalog product so the
  // customer can choose "I already have it" or "staff brings it" (bought from a
  // nearby partner pharmacy and collected by the staff on the way).
  supplies: [{
    _id: false,
    key: { type: String, required: true }, // stable id within this service, e.g. 'syringe'
    name: { type: String, required: true },
    medicineSlug: String, // Medicine.slug that fulfils it; none = staff kit only
    quantity: { type: Number, default: 1, min: 1 },
    kind: { type: String, enum: ['MEDICINE', 'CONSUMABLE'], default: 'CONSUMABLE' },
    defaultSource: { type: String, enum: CARE_SUPPLY_SOURCES, default: 'STAFF_BRINGS' },
    note: String
  }],

  // What's Included
  included: [String],
  notIncluded: [String],

  // FAQ
  faqs: [{
    question: String,
    answer: String
  }],

  // Instructions for Patient
  patientInstructions: {
    beforeService: [String],
    duringService: [String],
    afterService: [String]
  },

  // Instructions for Provider
  providerInstructions: [String],

  // Analytics
  stats: {
    totalBookings: {
      type: Number,
      default: 0
    },
    totalRevenue: {
      type: Number,
      default: 0
    },
    avgRating: {
      type: Number,
      default: 0
    },
    totalReviews: {
      type: Number,
      default: 0
    },
    completionRate: {
      type: Number,
      default: 100
    }
  },

  // SEO
  seo: {
    metaTitle: String,
    metaDescription: String,
    keywords: [String]
  },

  // Featured/Popular
  isFeatured: {
    type: Boolean,
    default: false
  },
  isPopular: {
    type: Boolean,
    default: false
  },
  sortOrder: Number

}, {
  timestamps: true
});

// Indexes
// Note: slug already indexed via unique: true in schema
ServiceCatalogSchema.index({ category: 1, 'availability.isActive': 1 });
ServiceCatalogSchema.index({ 'availability.availableCities': 1 });
ServiceCatalogSchema.index({ isFeatured: 1, isPopular: 1 });
ServiceCatalogSchema.index({ 'stats.totalBookings': -1 });

module.exports = mongoose.models.ServiceCatalog || mongoose.model('ServiceCatalog', ServiceCatalogSchema);
