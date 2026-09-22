/**
 * Lab Test Booking Model
 *
 * Represents a patient's lab test order — from scheduling sample collection
 * through phlebotomist dispatch, sample handoff, and report delivery.
 */

const mongoose = require('mongoose');
const { SAMPLE_STATUSES } = require('../constants/enums');

const LabTestBookingSchema = new mongoose.Schema({
  // Booking Reference
  bookingNumber: {
    type: String,
    unique: true
  },

  // Patient
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },

  // Ordered Tests
  tests: [{
    test: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LabTest',
      required: true
    },
    name: String, // Denormalized for quick display
    sampleType: String,
    price: Number
  }],

  // Prescribed by doctor (optional — null if patient self-ordered)
  prescribedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  prescriptionImage: String, // URL to uploaded prescription
  consultationRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Consultation'
  },

  // Collection Details
  collectionAddress: {
    street: String,
    landmark: String,
    city: String,
    state: String,
    pincode: String,
    coordinates: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0, 0]
      }
    }
  },

  scheduledDate: {
    type: Date,
    required: true
  },
  scheduledSlot: {
    type: String, // "07:00-09:00 AM", "09:00-11:00 AM", etc.
    required: true
  },

  // Phlebotomist Assignment
  phlebotomist: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User' // User with role 'phlebotomist'
  },
  phlebotomistAssignedAt: Date,

  // Sample Tracking
  sampleStatus: {
    type: String,
    enum: SAMPLE_STATUSES,
    default: 'SCHEDULED'
  },
  sampleStatusHistory: [{
    status: {
      type: String,
      enum: SAMPLE_STATUSES
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    notes: String
  }],

  // Sample Details (filled by phlebotomist after collection)
  sampleDetails: {
    collectedAt: Date,
    numberOfTubes: Number,
    barcodeId: String, // Barcode for lab tracking
    temperature: String, // Storage temp during transit
    handoffConfirmed: {
      type: Boolean,
      default: false
    },
    handoffAt: Date,
    handoffTo: String // Lab courier name or ID
  },

  // Report
  report: {
    url: String, // PDF URL
    uploadedAt: Date,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    isAbnormal: {
      type: Boolean,
      default: false
    },
    doctorReviewed: {
      type: Boolean,
      default: false
    },
    doctorNotes: String
  },

  // Pricing
  pricing: {
    subtotal: {
      type: Number,
      required: true
    },
    discount: {
      type: Number,
      default: 0
    },
    collectionCharge: {
      type: Number,
      default: 0 // Home collection fee
    },
    urgentCharge: {
      type: Number,
      default: 0
    },
    totalAmount: {
      type: Number,
      required: true
    },
    currency: {
      type: String,
      default: 'INR'
    }
  },

  // Payment
  paymentStatus: {
    type: String,
    enum: ['PENDING', 'PAID', 'REFUNDED', 'FAILED'],
    default: 'PENDING'
  },
  paymentId: String, // Razorpay payment ID
  paymentMethod: String, // UPI, Card, Wallet, COD

  // Patient Preparation
  preparationChecklist: [{
    instruction: String,
    acknowledged: {
      type: Boolean,
      default: false
    }
  }],

  // Ratings
  rating: {
    score: { type: Number, min: 1, max: 5 },
    review: String,
    ratedAt: Date
  },

  // Cancellation
  cancellation: {
    cancelledAt: Date,
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId
    },
    reason: String,
    refundStatus: {
      type: String,
      enum: ['PENDING', 'PROCESSED', 'DENIED'],
      default: 'PENDING'
    }
  },

  // Flags
  isUrgent: {
    type: Boolean,
    default: false
  },
  isHomeCollection: {
    type: Boolean,
    default: true
  }

}, {
  timestamps: true
});

// Auto-generate booking number
LabTestBookingSchema.pre('save', function() {
  if (!this.bookingNumber) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.bookingNumber = `LT-${timestamp}-${random}`;
  }
});

// Indexes
LabTestBookingSchema.index({ patient: 1, createdAt: -1 });
LabTestBookingSchema.index({ phlebotomist: 1, scheduledDate: 1 });
LabTestBookingSchema.index({ sampleStatus: 1 });
LabTestBookingSchema.index({ paymentStatus: 1 });
LabTestBookingSchema.index({ 'collectionAddress.coordinates': '2dsphere' });
LabTestBookingSchema.index({ bookingNumber: 1 });
LabTestBookingSchema.index({ prescribedBy: 1 });

module.exports = mongoose.models.LabTestBooking || mongoose.model('LabTestBooking', LabTestBookingSchema);
