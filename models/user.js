const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { encrypt, decrypt } = require('../utils/encryption');

const UserSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: [true, 'Please provide a name'],
    trim: true,
    maxlength: [100, 'Name cannot be more than 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
    lowercase: true,
    match: [/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/, 'Please provide a valid email']
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false
  },
  phone: {
    type: String,
    required: false
  },
  role: {
    type: String,
    enum: ['doctor', 'nurse', 'physiotherapist', 'admin'],
    required: true
  },

  // Firebase Integration
  firebaseUid: {
    type: String,
    sparse: true
  },

  // Profile Photo
  profilePhoto: {
    url: String,
    publicId: String, // For cloud storage (Cloudinary/S3)
    uploadedAt: Date
  },

  // Professional Details (for doctors)
  professional: {
    mciNumber: String,
    stateMedicalCouncil: String,
    primarySpecialization: {
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
        'Other'
      ]
    },
    secondarySpecializations: [{
      type: String
    }], // Max 3
    yearsOfExperience: Number,
    currentEmploymentStatus: {
      type: String,
      enum: ['Full-time', 'Part-time', 'Freelance', 'Between Jobs', 'Student']
    },

    // Skills
    proceduralSkills: [{
      type: String
    }],

    // Preferences
    preferredShiftTimes: [{
      type: String,
      enum: ['Morning', 'Evening', 'Night', 'Weekend', '24hr']
    }],
    serviceRadius: {
      type: Number, // in kilometers
      default: 20
    },
    minimumRate: {
      type: Number, // per hour in rupees
      default: 0
    }
  },

  // Documents (MANDATORY for doctors)
  documents: {
    mciCertificate: {
      url: String,
      publicId: String,
      verified: { type: Boolean, default: false },
      uploadedAt: Date
    },
    photoId: {
      url: String,
      publicId: String,
      verified: { type: Boolean, default: false },
      uploadedAt: Date
    },
    mbbsDegree: {
      url: String,
      publicId: String,
      verified: { type: Boolean, default: false },
      uploadedAt: Date
    },
    additionalCertificates: [{
      name: String,
      url: String,
      publicId: String,
      uploadedAt: Date
    }]
  },

  // Bank Details
  bankDetails: {
    accountHolderName: String,
    accountNumber: String,
    ifscCode: String,
    bankName: String,
    branchName: String,
    panCard: String,
    gstNumber: String,
    verified: { type: Boolean, default: false }
  },

  // Profile Completion
  profileStrength: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },

  onboardingCompleted: {
    type: Boolean,
    default: false
  },

  onboardingStep: {
    type: Number,
    default: 1,
    min: 1,
    max: 4
  },

  // Performance Metrics
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  totalReviews: {
    type: Number,
    default: 0
  },
  completedDuties: {
    type: Number,
    default: 0
  },
  completionRate: {
    type: Number,
    default: 100
  },
  averageResponseTime: {
    type: Number, // in minutes
    default: 0
  },
  rebookingRate: {
    type: Number, // percentage
    default: 0
  },

  // For Hospital/Admin
  hospital: {
    type: String
  },
  hospitalName: String,

  // Location
  location: {
    city: String,
    state: String,
    coordinates: {
      lat: Number,
      lng: Number
    },
    address: String
  },

  // Legacy fields for compatibility
  specialty: {
    type: String
  },
  licenseNumber: String,

  // Account Status
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verifiedAt: Date,

  // Preferences
  notificationSettings: {
    email: { type: Boolean, default: true },
    sms: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
    newShifts: { type: Boolean, default: true },
    applicationStatus: { type: Boolean, default: true },
    payments: { type: Boolean, default: true },
    reviews: { type: Boolean, default: true }
  },

  // Availability
  isAvailableForShifts: {
    type: Boolean,
    default: true
  },

  lastActive: Date

}, {
  timestamps: true
});

// REMOVED - Duplicate pre-save hook moved to line 371 (combined version)

// Method to calculate profile strength
UserSchema.methods.calculateProfileStrength = function() {
  let strength = 0;

  // Basic info (25%)
  if (this.name) strength += 5;
  if (this.email) strength += 5;
  if (this.phone) strength += 5;
  if (this.profilePhoto && this.profilePhoto.url) strength += 10;

  if (this.role === 'doctor') {
    // Professional details (30%)
    if (this.professional) {
      if (this.professional.mciNumber) strength += 10;
      if (this.professional.primarySpecialization) strength += 10;
      if (this.professional.yearsOfExperience) strength += 5;
      if (this.professional.proceduralSkills && this.professional.proceduralSkills.length > 0) strength += 5;
    }

    // Documents (30%)
    if (this.documents) {
      if (this.documents.mciCertificate && this.documents.mciCertificate.url) strength += 10;
      if (this.documents.photoId && this.documents.photoId.url) strength += 10;
      if (this.documents.mbbsDegree && this.documents.mbbsDegree.url) strength += 10;
    }

    // Bank details (10%)
    if (this.bankDetails) {
      if (this.bankDetails.accountNumber && this.bankDetails.ifscCode) strength += 10;
    }

    // Preferences (5%)
    if (this.professional && this.professional.preferredShiftTimes && this.professional.preferredShiftTimes.length > 0) strength += 5;
  }

  this.profileStrength = Math.min(strength, 100);
  return this.profileStrength;
};

// Method to get missing profile fields
UserSchema.methods.getMissingFields = function() {
  const missing = [];

  if (!this.profilePhoto || !this.profilePhoto.url) missing.push('Profile Photo');

  if (this.role === 'doctor') {
    if (!this.professional || !this.professional.mciNumber) missing.push('MCI Registration Number');
    if (!this.professional || !this.professional.primarySpecialization) missing.push('Primary Specialization');
    if (!this.professional || !this.professional.yearsOfExperience) missing.push('Years of Experience');
    if (!this.documents || !this.documents.mciCertificate || !this.documents.mciCertificate.url) missing.push('MCI Certificate');
    if (!this.documents || !this.documents.photoId || !this.documents.photoId.url) missing.push('Photo ID');
    if (!this.documents || !this.documents.mbbsDegree || !this.documents.mbbsDegree.url) missing.push('MBBS Degree');
    if (!this.bankDetails || !this.bankDetails.accountNumber) missing.push('Bank Account Details');
    if (!this.professional || !this.professional.proceduralSkills || this.professional.proceduralSkills.length === 0) missing.push('Procedural Skills');
  }

  return missing;
};

// COMBINED pre-save hook: Handle password hashing AND bank details encryption
UserSchema.pre('save', async function(next) {
  try {
    // 1. Hash password if modified
    if (this.isModified('password')) {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
    }

    // 2. Encrypt bank account number if modified
    if (this.isModified('bankDetails.accountNumber') && this.bankDetails && this.bankDetails.accountNumber) {
      // Only encrypt if not already encrypted (check format)
      if (!this.bankDetails.accountNumber.includes(':')) {
        this.bankDetails.accountNumber = encrypt(this.bankDetails.accountNumber);
      }
    }

    // 3. Encrypt PAN card if modified
    if (this.isModified('bankDetails.panCard') && this.bankDetails && this.bankDetails.panCard) {
      if (!this.bankDetails.panCard.includes(':')) {
        this.bankDetails.panCard = encrypt(this.bankDetails.panCard);
      }
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Method to get decrypted bank details (for authorized access only)
UserSchema.methods.getDecryptedBankDetails = function() {
  if (!this.bankDetails) return null;

  try {
    return {
      accountHolderName: this.bankDetails.accountHolderName,
      accountNumber: this.bankDetails.accountNumber ? decrypt(this.bankDetails.accountNumber) : null,
      ifscCode: this.bankDetails.ifscCode,
      bankName: this.bankDetails.bankName,
      branchName: this.bankDetails.branchName,
      panCard: this.bankDetails.panCard ? decrypt(this.bankDetails.panCard) : null,
      gstNumber: this.bankDetails.gstNumber,
      verified: this.bankDetails.verified
    };
  } catch (error) {
    console.error('Error decrypting bank details:', error);
    return null;
  }
};

// Compare password method
UserSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// Database Indexes for Performance
// Note: email index created automatically by unique: true in schema
UserSchema.index({ role: 1 });
UserSchema.index({ 'professional.primarySpecialization': 1 });
UserSchema.index({ 'professional.mciNumber': 1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ isActive: 1, role: 1 });
// Compound indexes for common query patterns
UserSchema.index({ role: 1, 'professional.primarySpecialization': 1, isActive: 1 }); // Doctor search by specialty
UserSchema.index({ 'location.city': 1, 'location.state': 1, role: 1 }); // Location-based search
UserSchema.index({ role: 1, rating: -1, completedDuties: -1 }); // Top-rated doctors
UserSchema.index({ role: 1, isAvailableForShifts: 1, isActive: 1 }); // Available doctors
// Note: firebaseUid sparse index created automatically by sparse: true in schema (line 39)
UserSchema.index({ lastActive: -1 }); // Recent activity tracking

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);