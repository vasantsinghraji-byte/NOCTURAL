/**
 * Consultation Model
 *
 * Doctor-patient telemedicine consultations via chat, audio, or video.
 * Doctors can prescribe tests/medicines and link to lab test bookings.
 */

const mongoose = require('mongoose');
const { CONSULTATION_TYPES, CONSULTATION_STATUSES } = require('../constants/enums');

const ConsultationSchema = new mongoose.Schema({
  // Consultation Reference
  consultationNumber: {
    type: String,
    unique: true
  },

  // Participants
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // User with role 'doctor'
    required: false // Null until doctor accepts
  },

  // Type & Status
  type: {
    type: String,
    enum: CONSULTATION_TYPES,
    required: true,
    default: 'CHAT'
  },
  status: {
    type: String,
    enum: CONSULTATION_STATUSES,
    default: 'REQUESTED'
  },

  // Specialization requested
  requestedSpecialization: {
    type: String,
    default: 'General Medicine'
  },

  // Patient's Reason
  chiefComplaint: {
    type: String,
    required: [true, 'Please describe your concern'],
    maxlength: 1000
  },
  symptoms: [String],
  symptomDuration: String, // "2 days", "1 week"
  attachments: [{
    url: String,
    type: { type: String, enum: ['IMAGE', 'PDF', 'VIDEO'] },
    description: String,
    uploadedAt: { type: Date, default: Date.now }
  }],

  // Timing
  requestedAt: {
    type: Date,
    default: Date.now
  },
  acceptedAt: Date,
  startedAt: Date,
  endedAt: Date,
  duration: Number, // In minutes (calculated on completion)

  // For scheduled consultations (not instant)
  isScheduled: {
    type: Boolean,
    default: false
  },
  scheduledAt: Date,

  // Chat/Call Session
  sessionId: String, // Video/audio provider session ID (Daily.co, Agora)
  chatMessages: [{
    sender: {
      type: String,
      enum: ['patient', 'doctor', 'system']
    },
    senderId: mongoose.Schema.Types.ObjectId,
    message: String,
    attachmentUrl: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    readAt: Date
  }],

  // Doctor's Assessment
  assessment: {
    diagnosis: String,
    notes: String, // Private clinical notes
    advice: String, // Shared with patient
    followUpRequired: {
      type: Boolean,
      default: false
    },
    followUpDate: Date,
    referral: {
      needed: { type: Boolean, default: false },
      specialization: String,
      notes: String
    }
  },

  // Prescription
  prescription: {
    medicines: [{
      name: String,
      dosage: String, // "500mg"
      frequency: String, // "1-0-1" or "Twice daily"
      duration: String, // "5 days"
      instructions: String, // "After food"
      isGeneric: Boolean
    }],
    labTests: [{
      test: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabTest'
      },
      testName: String,
      reason: String,
      urgency: {
        type: String,
        enum: ['ROUTINE', 'URGENT'],
        default: 'ROUTINE'
      }
    }],
    generalAdvice: String,
    prescriptionPdfUrl: String,
    issuedAt: Date
  },

  // Linked Lab Bookings (created from prescription)
  linkedLabBookings: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LabTestBooking'
  }],

  // Pricing
  pricing: {
    consultationFee: {
      type: Number,
      required: true,
      default: 0
    },
    platformFee: {
      type: Number,
      default: 0
    },
    totalAmount: {
      type: Number,
      required: true,
      default: 0
    },
    currency: {
      type: String,
      default: 'INR'
    }
  },

  // Payment
  paymentStatus: {
    type: String,
    enum: ['PENDING', 'PAID', 'REFUNDED', 'WAIVED'],
    default: 'PENDING'
  },
  paymentId: String,

  // Rating
  rating: {
    patientRating: { type: Number, min: 1, max: 5 },
    patientReview: String,
    ratedAt: Date
  },

  // Cancellation
  cancellation: {
    cancelledBy: {
      type: String,
      enum: ['patient', 'doctor', 'system']
    },
    reason: String,
    cancelledAt: Date
  }

}, {
  timestamps: true
});

// Auto-generate consultation number
ConsultationSchema.pre('save', function() {
  if (!this.consultationNumber) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.consultationNumber = `CON-${timestamp}-${random}`;
  }
});

// Calculate duration on completion
ConsultationSchema.pre('save', function() {
  if (this.isModified('status') && this.status === 'COMPLETED' && this.startedAt) {
    this.endedAt = this.endedAt || new Date();
    this.duration = Math.round((this.endedAt - this.startedAt) / 60000); // minutes
  }
});

// Indexes
ConsultationSchema.index({ patient: 1, createdAt: -1 });
ConsultationSchema.index({ doctor: 1, status: 1 });
ConsultationSchema.index({ status: 1, requestedAt: -1 }); // Queue for available doctors
ConsultationSchema.index({ requestedSpecialization: 1, status: 1 });
ConsultationSchema.index({ consultationNumber: 1 });
ConsultationSchema.index({ paymentStatus: 1 });

module.exports = mongoose.models.Consultation || mongoose.model('Consultation', ConsultationSchema);
