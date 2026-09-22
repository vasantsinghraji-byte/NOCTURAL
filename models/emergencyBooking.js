/**
 * Emergency Booking Model
 *
 * One-tap SOS emergency bookings with automatic nearest-staff dispatch,
 * live location sharing, and emergency contact notifications.
 */

const mongoose = require('mongoose');
const { EMERGENCY_STATUSES, URGENCY_LEVELS } = require('../constants/enums');

const EmergencyBookingSchema = new mongoose.Schema({
  // Emergency Reference
  emergencyNumber: {
    type: String,
    unique: true
  },

  // Patient
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },

  // Emergency Details
  emergencyType: {
    type: String,
    enum: [
      'WOUND_BLEEDING', 'FRACTURE_SUSPECTED', 'BREATHING_DIFFICULTY',
      'CHEST_PAIN', 'ALLERGIC_REACTION', 'BURN_INJURY',
      'FAINTING_UNCONSCIOUS', 'SEIZURE', 'DIABETIC_EMERGENCY',
      'IV_DRIP_URGENT', 'INJECTION_URGENT', 'FIRST_AID',
      'OTHER'
    ],
    required: true
  },
  description: {
    type: String,
    maxlength: 500
  },
  urgencyLevel: {
    type: String,
    enum: URGENCY_LEVELS,
    default: 'EMERGENCY'
  },

  // Patient's Live Location (GeoJSON)
  patientLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    },
    address: String,
    landmark: String,
    accuracy: Number // GPS accuracy in meters
  },

  // Status
  status: {
    type: String,
    enum: EMERGENCY_STATUSES,
    default: 'TRIGGERED'
  },
  statusHistory: [{
    status: {
      type: String,
      enum: EMERGENCY_STATUSES
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    updatedBy: mongoose.Schema.Types.ObjectId,
    notes: String
  }],

  // Assigned Staff
  assignedStaff: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  staffAssignedAt: Date,
  staffAcceptedAt: Date,

  // Staff's location at time of assignment (for ETA calculation)
  staffLocationAtAssignment: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: [Number]
  },
  estimatedArrivalMinutes: Number,
  actualArrivalAt: Date,

  // Dispatch Attempts (if first staff rejects, try next)
  dispatchAttempts: [{
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    sentAt: Date,
    response: {
      type: String,
      enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'TIMED_OUT']
    },
    respondedAt: Date,
    distance: Number // km from patient
  }],

  // Service Performed
  servicePerformed: {
    description: String,
    serviceType: String, // Maps to BOOKING_SERVICE_TYPES
    vitalsRecorded: {
      bloodPressure: String,
      heartRate: Number,
      temperature: Number,
      oxygenSaturation: Number,
      bloodSugar: Number
    },
    medicinesAdministered: [{
      name: String,
      dosage: String,
      route: String // IM, IV, SC, Oral
    }],
    photosDocumentation: [String], // URLs to photos taken during service
    hospitalReferralNeeded: {
      type: Boolean,
      default: false
    },
    referralHospital: String,
    completedAt: Date
  },

  // Emergency Contacts Notified
  contactsNotified: [{
    name: String,
    phone: String,
    notifiedAt: Date,
    method: {
      type: String,
      enum: ['SMS', 'CALL', 'PUSH', 'WHATSAPP']
    },
    acknowledged: {
      type: Boolean,
      default: false
    }
  }],

  // Pricing (post-payment for emergencies)
  pricing: {
    serviceFee: Number,
    emergencySurcharge: Number,
    totalAmount: Number,
    currency: {
      type: String,
      default: 'INR'
    }
  },
  paymentStatus: {
    type: String,
    enum: ['PENDING', 'PAID', 'WAIVED', 'FAILED'],
    default: 'PENDING'
  },
  paymentId: String,

  // Response Time Tracking
  responseMetrics: {
    triggeredAt: {
      type: Date,
      default: Date.now
    },
    firstDispatchAt: Date,
    staffAcceptedAt: Date,
    staffArrivedAt: Date,
    serviceCompletedAt: Date,
    totalResponseMinutes: Number // triggeredAt → staffArrivedAt
  },

  // Rating
  rating: {
    score: { type: Number, min: 1, max: 5 },
    review: String,
    ratedAt: Date
  },

  // Cancellation
  cancelledAt: Date,
  cancelledBy: mongoose.Schema.Types.ObjectId,
  cancellationReason: String,

  // Flags
  isFalseAlarm: {
    type: Boolean,
    default: false
  }

}, {
  timestamps: true
});

// Auto-generate emergency number
EmergencyBookingSchema.pre('save', function() {
  if (!this.emergencyNumber) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.emergencyNumber = `SOS-${timestamp}-${random}`;
  }
});

// Calculate response time on arrival
EmergencyBookingSchema.pre('save', function() {
  if (this.isModified('status') && this.status === 'ARRIVED') {
    this.actualArrivalAt = new Date();
    if (this.responseMetrics && this.responseMetrics.triggeredAt) {
      this.responseMetrics.staffArrivedAt = this.actualArrivalAt;
      this.responseMetrics.totalResponseMinutes = Math.round(
        (this.actualArrivalAt - this.responseMetrics.triggeredAt) / 60000
      );
    }
  }
});

// Indexes
EmergencyBookingSchema.index({ patient: 1, createdAt: -1 });
EmergencyBookingSchema.index({ assignedStaff: 1, status: 1 });
EmergencyBookingSchema.index({ status: 1, createdAt: -1 });
EmergencyBookingSchema.index({ patientLocation: '2dsphere' });
EmergencyBookingSchema.index({ emergencyNumber: 1 });
EmergencyBookingSchema.index({ paymentStatus: 1 });

module.exports = mongoose.models.EmergencyBooking || mongoose.model('EmergencyBooking', EmergencyBookingSchema);
