/**
 * Lab Test Model
 *
 * Catalog of available pathology/diagnostic tests with pricing,
 * sample requirements, and preparation instructions.
 */

const mongoose = require('mongoose');
const { LAB_TEST_CATEGORIES } = require('../constants/enums');

const LabTestSchema = new mongoose.Schema({
  // Test Information
  name: {
    type: String,
    required: [true, 'Test name is required'],
    trim: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  testCode: {
    type: String,
    unique: true,
    sparse: true // Allow nulls
  },

  // Classification
  category: {
    type: String,
    enum: LAB_TEST_CATEGORIES,
    required: true
  },
  subCategory: String, // e.g., "Complete Blood Count" under HEMATOLOGY

  // Display
  displayName: String,
  shortDescription: String,
  longDescription: String,
  icon: String,
  image: String,

  // Sample Requirements
  sampleType: {
    type: String,
    enum: ['BLOOD', 'URINE', 'STOOL', 'SPUTUM', 'SWAB', 'SALIVA', 'OTHER'],
    required: true
  },
  sampleVolume: String, // e.g., "5 mL"
  tubeType: String, // e.g., "EDTA (Purple top)", "Serum (Red top)"
  numberOfSamples: {
    type: Number,
    default: 1
  },

  // Pricing
  pricing: {
    mrp: {
      type: Number,
      required: true
    },
    sellingPrice: {
      type: Number,
      required: true
    },
    discountPercentage: Number,
    currency: {
      type: String,
      default: 'INR'
    }
  },

  // Turnaround
  reportTurnaroundHours: {
    type: Number,
    required: true,
    default: 24 // Default 24 hours
  },
  isUrgentAvailable: {
    type: Boolean,
    default: false
  },
  urgentSurcharge: Number, // Extra charge for urgent processing

  // Patient Preparation
  preparation: {
    fastingRequired: {
      type: Boolean,
      default: false
    },
    fastingHours: Number, // e.g., 8-12 hours
    instructions: [String], // ["No alcohol 24 hours before", "Drink water normally"]
    restrictions: [String] // ["Avoid biotin supplements for 48 hours"]
  },

  // Test Components (for panel tests)
  components: [{
    name: String, // e.g., "Hemoglobin", "WBC Count"
    unit: String, // e.g., "g/dL", "cells/mcL"
    normalRange: {
      male: { min: Number, max: Number },
      female: { min: Number, max: Number }
    }
  }],

  // Part of these packages
  includedInPackages: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LabTest'
  }],

  // For health checkup packages
  isPackage: {
    type: Boolean,
    default: false
  },
  packageTests: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LabTest'
  }],
  packageTestCount: Number,

  // Availability
  availability: {
    isActive: {
      type: Boolean,
      default: true
    },
    availableCities: [String],
    homeCollectionAvailable: {
      type: Boolean,
      default: true
    }
  },

  // Partner Lab
  partnerLab: {
    name: String,
    labCode: String,
    accreditation: String // NABL, CAP, etc.
  },

  // Metadata
  isFeatured: {
    type: Boolean,
    default: false
  },
  isPopular: {
    type: Boolean,
    default: false
  },
  sortOrder: Number,

  // Stats
  stats: {
    totalOrders: { type: Number, default: 0 },
    avgRating: { type: Number, default: 0 },
    totalReviews: { type: Number, default: 0 }
  },

  // SEO
  seo: {
    metaTitle: String,
    metaDescription: String,
    keywords: [String]
  }

}, {
  timestamps: true
});

// Indexes
LabTestSchema.index({ category: 1, 'availability.isActive': 1 });
LabTestSchema.index({ 'pricing.sellingPrice': 1 });
LabTestSchema.index({ isPackage: 1, isFeatured: 1 });
LabTestSchema.index({ name: 'text', displayName: 'text', 'seo.keywords': 'text' }); // Text search
LabTestSchema.index({ 'availability.availableCities': 1 });
LabTestSchema.index({ 'stats.totalOrders': -1 });

module.exports = mongoose.models.LabTest || mongoose.model('LabTest', LabTestSchema);
