/**
 * Patient Model
 *
 * Represents end-users (consumers) who book healthcare services
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const PatientSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: [true, 'Please provide a name'],
    trim: true
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
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  phone: {
    type: String,
    required: [true, 'Please provide a phone number'],
    unique: true,
    match: [/^[6-9]\d{9}$/, 'Please provide a valid Indian mobile number']
  },

  // Personal Details
  dateOfBirth: Date,
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other']
  },
  bloodGroup: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
  },

  // Profile Photo
  profilePhoto: {
    url: String,
    publicId: String,
    uploadedAt: Date
  },

  // Primary Address
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

  // Additional Addresses (for multi-location bookings)
  savedAddresses: [{
    label: String, // Home, Office, Parents' Home
    street: String,
    landmark: String,
    city: String,
    state: String,
    pincode: String,
    coordinates: {
      lat: Number,
      lng: Number
    },
    isDefault: Boolean
  }],

  // Medical History
  medicalHistory: {
    // Chronic Conditions
    conditions: [{
      name: String, // Diabetes, Hypertension, Asthma
      diagnosedDate: Date,
      severity: String, // Mild, Moderate, Severe
      notes: String
    }],

    // Allergies
    allergies: [{
      allergen: String, // Peanuts, Penicillin, Dust
      reaction: String, // Rash, Breathing difficulty
      severity: String
    }],

    // Current Medications
    currentMedications: [{
      name: String,
      dosage: String,
      frequency: String,
      startDate: Date,
      prescribedBy: String
    }],

    // Past Surgeries
    surgeries: [{
      name: String,
      date: Date,
      hospital: String,
      surgeon: String,
      complications: String
    }],

    // Family History
    familyHistory: [{
      relation: String, // Father, Mother, Sibling
      condition: String,
      notes: String
    }],

    // Habits
    habits: {
      smoking: { type: Boolean, default: false },
      alcohol: { type: Boolean, default: false },
      exercise: String, // Never, Rarely, Regularly
      diet: String // Vegetarian, Non-vegetarian, Vegan
    }
  },

  // Emergency Contact
  emergencyContact: {
    name: String,
    relation: String,
    phone: String,
    email: String
  },

  // Insurance Details
  insurance: {
    hasInsurance: { type: Boolean, default: false },
    provider: String,
    policyNumber: String,
    policyType: String, // Individual, Family Floater
    coverageAmount: Number,
    validFrom: Date,
    validUpto: Date,
    tpa: String, // Third Party Administrator
    policyDocument: String // URL
  },

  // Payment Methods
  savedPaymentMethods: [{
    type: String, // UPI, Card, NetBanking
    details: String, // Last 4 digits, UPI ID
    isDefault: Boolean
  }],

  // Preferences
  preferences: {
    language: { type: String, default: 'English' },
    gender: String, // Prefer male/female nurse
    notificationChannels: {
      sms: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
      whatsapp: { type: Boolean, default: false },
      push: { type: Boolean, default: true }
    }
  },

  // Account Status
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  phoneVerified: {
    type: Boolean,
    default: false
  },
  emailVerified: {
    type: Boolean,
    default: false
  },

  // Stats
  totalBookings: {
    type: Number,
    default: 0
  },
  totalSpent: {
    type: Number,
    default: 0
  },

  // Referral
  referralCode: String,
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient'
  },

  // Timestamps
  lastActive: Date,
  deletedAt: Date // Soft delete

}, {
  timestamps: true
});

// Hash password before saving
PatientSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

// Compare password method
PatientSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// Generate referral code
PatientSchema.pre('save', function(next) {
  if (!this.referralCode) {
    this.referralCode = 'PAT' + Math.random().toString(36).substring(2, 8).toUpperCase();
  }
  next();
});

// Indexes
// Note: email and phone already indexed via unique: true in schema
PatientSchema.index({ referralCode: 1 });
PatientSchema.index({ 'address.city': 1, 'address.pincode': 1 });
PatientSchema.index({ isActive: 1, isVerified: 1 });
PatientSchema.index({ createdAt: -1 });

module.exports = mongoose.models.Patient || mongoose.model('Patient', PatientSchema);
