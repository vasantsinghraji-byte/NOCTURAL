const mongoose = require('mongoose');

const DutySchema = new mongoose.Schema({
  // Basic Information
  title: {
    type: String,
    required: true
  },
  hospital: {
    type: String,
    required: true
  },
  hospitalName: {
    type: String,
    required: true
  },

  // Department & Specialty
  department: {
    type: String,
    enum: ['Emergency', 'ICU', 'OPD', 'Surgery', 'General Ward', 'Maternity', 'Pediatrics', 'Psychiatry', 'Other'],
    required: true
  },
  specialty: {
    type: String,
    enum: [
      'Internal Medicine',
      'Emergency Medicine',
      'General Surgery',
      'Anaesthesiology',
      'Intensive Care / Critical Care Medicine',
      'Obstetrics & Gynaecology',
      'Orthopaedics',
      'Urology',
      'Neurosurgery',
      'ENT (Otolaryngology)',
      'Cardiothoracic Surgery',
      'General Paediatrics',
      'Neonatology',
      'General Psychiatry',
      'Radiology',
      'Pathology / Laboratory Medicine',
      'Palliative Medicine',
      'General Medicine',
      'Other'
    ],
    required: true
  },

  description: {
    type: String,
    required: true
  },

  // Date & Time
  date: {
    type: Date,
    required: true
  },
  startTime: {
    type: String,
    required: true
  },
  endTime: {
    type: String,
    required: true
  },
  duration: {
    type: Number, // in hours
    required: true
  },

  // Compensation
  hourlyRate: {
    type: Number,
    required: true
  },
  overtimeRate: {
    type: Number
  },
  totalCompensation: {
    type: Number
  },
  platformFee: {
    type: Number, // Platform commission (%)
    default: 5
  },
  netPayment: {
    type: Number // Payment after platform fee
  },

  // Requirements
  requirements: {
    minimumExperience: {
      type: String,
      enum: ['0-2 years', '2-5 years', '5+ years', 'Any'],
      default: 'Any'
    },
    requiredSkills: [{
      type: String
    }],
    expectedPatientLoad: {
      type: String,
      enum: ['Light', 'Moderate', 'Heavy'],
      default: 'Moderate'
    },
    specialRequirements: String
  },

  // Location
  location: {
    type: String,
    required: true
  },
  coordinates: {
    lat: Number,
    lng: Number
  },
  reportingLocation: String,

  // Facilities & Benefits
  facilities: {
    mealsProvided: {
      breakfast: { type: Boolean, default: false },
      lunch: { type: Boolean, default: false },
      dinner: { type: Boolean, default: false }
    },
    parking: { type: Boolean, default: false },
    scrubsProvided: { type: Boolean, default: false },
    lockerFacility: { type: Boolean, default: false },
    wifi: { type: Boolean, default: false },
    doctorsLounge: { type: Boolean, default: false }
  },

  // Instructions
  instructions: {
    reportingLocation: String,
    contactPerson: String,
    contactNumber: String,
    specialInstructions: String,
    documentsToCarry: [{
      type: String
    }]
  },

  // Photos
  facilityPhotos: [{
    url: String,
    publicId: String,
    uploadedAt: Date
  }],

  // Status & Management
  urgency: {
    type: String,
    enum: ['NORMAL', 'URGENT', 'EMERGENCY'],
    default: 'NORMAL'
  },
  status: {
    type: String,
    enum: ['OPEN', 'FILLED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
    default: 'OPEN'
  },

  // Number of positions
  positionsNeeded: {
    type: Number,
    default: 1,
    min: 1
  },
  positionsFilled: {
    type: Number,
    default: 0
  },

  // Assigned doctors
  assignedDoctors: [{
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    assignedAt: Date,
    status: {
      type: String,
      enum: ['CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'NO_SHOW'],
      default: 'CONFIRMED'
    }
  }],

  postedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Applications
  applicationsCount: {
    type: Number,
    default: 0
  },

  // Shift completion tracking
  actualStartTime: Date,
  actualEndTime: Date,
  actualDuration: Number,

  // Payment
  paymentStatus: {
    type: String,
    enum: ['PENDING', 'PROCESSING', 'PAID', 'FAILED'],
    default: 'PENDING'
  },
  paymentDate: Date,
  paymentTimeline: {
    type: String,
    enum: ['Immediate', '48 hours', '7 days', '15 days'],
    default: '48 hours'
  },

  // Cancellation
  cancellationPolicy: {
    type: String,
    default: 'Free cancellation >24 hours before shift. 6-24 hours: 50% penalty. <6 hours: 100% penalty'
  },
  cancelledAt: Date,
  cancellationReason: String,

  // Analytics
  viewCount: {
    type: Number,
    default: 0
  },
  averageMatchScore: Number,

  // Recurring shift info
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurringShiftId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ShiftSeries'
  }

}, {
  timestamps: true
});

// Calculate total compensation, duration, and net payment
DutySchema.pre('save', function(next) {
  // Calculate duration if not set
  if (this.startTime && this.endTime && !this.duration) {
    const start = parseInt(this.startTime.split(':')[0]);
    const end = parseInt(this.endTime.split(':')[0]);
    let duration = end - start;

    if (duration < 0) {
      duration += 24;
    }

    this.duration = duration;
  }

  // Calculate total compensation
  if (this.duration && this.hourlyRate) {
    this.totalCompensation = this.duration * this.hourlyRate;
  }

  // Calculate net payment after platform fee
  if (this.totalCompensation && this.platformFee) {
    const feeAmount = (this.totalCompensation * this.platformFee) / 100;
    this.netPayment = this.totalCompensation - feeAmount;
  }

  next();
});

// Method to calculate match score for a doctor
DutySchema.methods.calculateMatchScore = function(doctor) {
  let score = 0;

  if (!doctor || !doctor.professional) return 0;

  // Specialty match (40 points)
  if (doctor.professional.primarySpecialization === this.specialty) {
    score += 40;
  } else if (doctor.professional.secondarySpecializations &&
             doctor.professional.secondarySpecializations.includes(this.specialty)) {
    score += 25;
  }

  // Skills match (30 points)
  if (this.requirements && this.requirements.requiredSkills && this.requirements.requiredSkills.length > 0) {
    const doctorSkills = doctor.professional.proceduralSkills || [];
    const matchedSkills = this.requirements.requiredSkills.filter(skill =>
      doctorSkills.includes(skill)
    );
    const skillMatchPercentage = (matchedSkills.length / this.requirements.requiredSkills.length) * 100;
    score += (skillMatchPercentage / 100) * 30;
  } else {
    score += 30; // If no specific skills required, give full points
  }

  // Experience match (20 points)
  if (this.requirements && this.requirements.minimumExperience && doctor.professional.yearsOfExperience) {
    const experience = doctor.professional.yearsOfExperience;
    if (this.requirements.minimumExperience === '0-2 years') {
      score += 20;
    } else if (this.requirements.minimumExperience === '2-5 years' && experience >= 2) {
      score += 20;
    } else if (this.requirements.minimumExperience === '5+ years' && experience >= 5) {
      score += 20;
    } else if (this.requirements.minimumExperience === 'Any') {
      score += 20;
    } else {
      score += 10; // Partial points if experience doesn't match perfectly
    }
  } else {
    score += 20; // Default if no experience requirement
  }

  // Rating bonus (10 points)
  if (doctor.rating >= 4.5) {
    score += 10;
  } else if (doctor.rating >= 4.0) {
    score += 7;
  } else if (doctor.rating >= 3.5) {
    score += 5;
  }

  return Math.min(Math.round(score), 100);
};

// Database Indexes for Performance
DutySchema.index({ specialty: 1, date: 1 }); // Finding duties by specialty and date (most common search)
DutySchema.index({ hospital: 1, status: 1 }); // Hospital's duty management
DutySchema.index({ status: 1, date: 1 }); // Active duties by date (for listings)
DutySchema.index({ location: 1, specialty: 1 }); // Location-based duty search
DutySchema.index({ date: 1, startTime: 1 }); // Chronological duty sorting
DutySchema.index({ postedBy: 1, createdAt: -1 }); // Hospital's posting history
DutySchema.index({ urgency: 1, status: 1 }); // Urgent/emergency duty filtering
DutySchema.index({ 'assignedDoctors.doctor': 1 }); // Doctor's assigned duties lookup

module.exports = mongoose.models.Duty || mongoose.model('Duty', DutySchema);