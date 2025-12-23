/**
 * Nurse/Physiotherapist Booking Model
 *
 * Represents service bookings from patients
 * Migrated from monolith to patient-booking-service
 */

const mongoose = require('mongoose');

const NurseBookingSchema = new mongoose.Schema({
  // Patient Details
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },

  // Service Provider (Nurse/Physiotherapist)
  serviceProvider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Links to User model with role 'nurse'
    required: false // Can be null if not assigned yet
  },

  // Service Type
  serviceType: {
    type: String,
    enum: [
      // Nursing Services
      'INJECTION',
      'IV_DRIP',
      'WOUND_DRESSING',
      'CATHETER_CARE',
      'BED_SORE_CARE',
      'POST_SURGERY_CARE',
      'ELDERLY_CARE',
      'BABY_CARE',
      'NEBULIZATION',
      'BLOOD_PRESSURE_CHECK',
      'BLOOD_SUGAR_CHECK',
      'GENERAL_NURSING',

      // Physiotherapy Services
      'PHYSIOTHERAPY_SESSION',
      'POST_SURGERY_REHAB',
      'SPORTS_INJURY',
      'BACK_PAIN_THERAPY',
      'KNEE_PAIN_THERAPY',
      'STROKE_REHAB',
      'GERIATRIC_PHYSIO',
      'PEDIATRIC_PHYSIO',
      'NEUROLOGICAL_REHAB',

      // Packages
      'ELDERLY_CARE_PACKAGE', // 30 days
      'POST_SURGERY_PACKAGE', // 14 days
      'PHYSIO_PACKAGE_10', // 10 sessions
      'OTHER'
    ],
    required: true
  },

  // Service Details
  serviceDetails: {
    description: String, // What exactly is needed
    duration: Number, // Expected duration in minutes
    frequency: String, // One-time, Daily, Alternate days, Weekly
    totalSessions: Number, // For packages
    completedSessions: Number, // Track progress
    specialInstructions: String,

    // For specific services
    injectionType: String, // IM, IV, SC
    medicineToBeAdministered: String,
    prescriptionImage: String, // URL to uploaded prescription

    // For physiotherapy
    bodyPart: String, // Back, Knee, Shoulder, etc.
    painLevel: Number, // 1-10 scale
    previousTreatment: String
  },

  // Scheduling
  scheduledDate: {
    type: Date,
    required: true
  },
  scheduledTime: {
    type: String, // "09:00 AM", "02:30 PM"
    required: true
  },
  estimatedDuration: {
    type: Number, // in minutes
    default: 60
  },

  // For recurring services
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurrencePattern: {
    type: String,
    enum: ['DAILY', 'ALTERNATE_DAYS', 'WEEKLY', 'CUSTOM']
  },
  recurringDates: [Date], // For custom patterns

  // Location
  serviceLocation: {
    type: {
      type: String,
      enum: ['HOME', 'CLINIC', 'HOSPITAL'],
      default: 'HOME'
    },
    address: {
      street: String,
      landmark: String,
      city: String,
      state: String,
      pincode: String,
      coordinates: {
        lat: Number,
        lng: Number
      }
    },
    contactPerson: String,
    contactPhone: String,
    floorNumber: String,
    additionalDirections: String
  },

  // Patient Condition
  patientCondition: {
    age: Number,
    mobility: {
      type: String,
      enum: ['MOBILE', 'WHEELCHAIR', 'BEDRIDDEN']
    },
    consciousness: {
      type: String,
      enum: ['CONSCIOUS', 'SEMI_CONSCIOUS', 'UNCONSCIOUS']
    },
    urgency: {
      type: String,
      enum: ['ROUTINE', 'URGENT', 'EMERGENCY'],
      default: 'ROUTINE'
    }
  },

  // Pricing
  pricing: {
    basePrice: Number, // Service charge
    platformFee: Number, // Our commission
    gst: Number,
    discount: Number,
    totalAmount: Number,
    payableAmount: Number
  },

  // Payment
  payment: {
    method: {
      type: String,
      enum: ['ONLINE', 'CASH', 'INSURANCE']
    },
    status: {
      type: String,
      enum: ['PENDING', 'PAID', 'FAILED', 'REFUNDED'],
      default: 'PENDING'
    },
    transactionId: String,
    paidAt: Date,
    refundedAt: Date,
    refundAmount: Number,
    refundReason: String
  },

  // Status Flow
  status: {
    type: String,
    enum: [
      'REQUESTED', // Patient created booking
      'SEARCHING', // System searching for nurse
      'ASSIGNED', // Nurse assigned
      'CONFIRMED', // Nurse accepted
      'EN_ROUTE', // Nurse on the way
      'IN_PROGRESS', // Service started
      'COMPLETED', // Service finished
      'CANCELLED', // Cancelled by patient/nurse/system
      'NO_SHOW', // Nurse didn't show up
      'FAILED' // Couldn't assign nurse
    ],
    default: 'REQUESTED'
  },

  // Timestamps for status tracking
  statusTimestamps: {
    requestedAt: Date,
    assignedAt: Date,
    confirmedAt: Date,
    enRouteAt: Date,
    startedAt: Date,
    completedAt: Date,
    cancelledAt: Date
  },

  // Actual Service Time
  actualService: {
    startTime: Date,
    endTime: Date,
    duration: Number, // in minutes

    // Service Report (filled by nurse after completion)
    serviceReport: {
      vitalsChecked: {
        bloodPressure: String,
        heartRate: Number,
        temperature: Number,
        oxygenLevel: Number,
        bloodSugar: Number
      },
      proceduresDone: [String],
      medicinesAdministered: [{
        name: String,
        dosage: String,
        time: Date,
        route: String // Oral, IV, IM
      }],
      observations: String,
      patientResponse: String,
      recommendations: String,
      followUpRequired: Boolean,
      followUpDate: Date,

      // Photos (wound dressing, exercise form, etc.)
      photos: [{
        url: String,
        caption: String,
        uploadedAt: Date
      }]
    }
  },

  // Cancellation
  cancellation: {
    cancelledBy: {
      type: String,
      enum: ['PATIENT', 'NURSE', 'ADMIN', 'SYSTEM']
    },
    reason: String,
    cancelledAt: Date,
    refundEligible: Boolean,
    refundAmount: Number,
    cancellationFee: Number
  },

  // Rating & Review (after service completion)
  rating: {
    stars: {
      type: Number,
      min: 1,
      max: 5
    },
    review: String,
    ratedAt: Date,

    // Detailed ratings
    punctuality: Number,
    professionalism: Number,
    skillLevel: Number,
    communication: Number,

    // Response from nurse
    nurseResponse: String,
    nurseRespondedAt: Date
  },

  // Tracking & Notifications
  tracking: {
    nurseLocation: {
      lat: Number,
      lng: Number,
      lastUpdated: Date
    },
    estimatedArrival: Date,
    notificationsSent: {
      bookingConfirmed: Boolean,
      nurseAssigned: Boolean,
      nurseEnRoute: Boolean,
      serviceCompleted: Boolean,
      ratingReminder: Boolean
    }
  },

  // Communication
  messages: [{
    from: {
      type: String,
      enum: ['PATIENT', 'NURSE', 'ADMIN']
    },
    message: String,
    timestamp: Date,
    read: Boolean
  }],

  // Admin Notes
  adminNotes: String,
  flagged: Boolean,
  flagReason: String,

  // Equipment/Supplies Required
  equipmentRequired: [{
    item: String,
    providedBy: String, // Patient, Nurse, Platform
    notes: String
  }]

}, {
  timestamps: true
});

// Indexes for performance
NurseBookingSchema.index({ patient: 1, createdAt: -1 });
NurseBookingSchema.index({ serviceProvider: 1, scheduledDate: 1 });
NurseBookingSchema.index({ status: 1, scheduledDate: 1 });
NurseBookingSchema.index({ 'serviceLocation.address.pincode': 1, serviceType: 1 });
NurseBookingSchema.index({ scheduledDate: 1, scheduledTime: 1 });
NurseBookingSchema.index({ 'payment.status': 1 });
NurseBookingSchema.index({ createdAt: -1 });

// Pre-save hook to set timestamps
NurseBookingSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    const now = new Date();
    switch(this.status) {
      case 'REQUESTED':
        this.statusTimestamps.requestedAt = now;
        break;
      case 'ASSIGNED':
        this.statusTimestamps.assignedAt = now;
        break;
      case 'CONFIRMED':
        this.statusTimestamps.confirmedAt = now;
        break;
      case 'EN_ROUTE':
        this.statusTimestamps.enRouteAt = now;
        break;
      case 'IN_PROGRESS':
        this.statusTimestamps.startedAt = now;
        break;
      case 'COMPLETED':
        this.statusTimestamps.completedAt = now;
        break;
      case 'CANCELLED':
        this.statusTimestamps.cancelledAt = now;
        break;
    }
  }
  next();
});

// Method to calculate total amount
NurseBookingSchema.methods.calculateTotalAmount = function() {
  const basePrice = this.pricing.basePrice || 0;
  const platformFee = basePrice * 0.15; // 15% commission
  const gst = (basePrice + platformFee) * 0.18; // 18% GST
  const discount = this.pricing.discount || 0;

  this.pricing.platformFee = platformFee;
  this.pricing.gst = gst;
  this.pricing.totalAmount = basePrice + platformFee + gst;
  this.pricing.payableAmount = this.pricing.totalAmount - discount;

  return this.pricing.payableAmount;
};

module.exports = mongoose.models.NurseBooking || mongoose.model('NurseBooking', NurseBookingSchema);
