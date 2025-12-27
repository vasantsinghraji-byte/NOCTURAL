/**
 * Emergency Summary Model
 *
 * Pre-computed critical health information for emergency access.
 * Accessible via QR code with time-limited token for emergency responders.
 */

const mongoose = require('mongoose');
const crypto = require('crypto');
const { ALLERGY_SEVERITY, QR_TOKEN_CONFIG } = require('../constants/healthConstants');

// Critical condition sub-schema
const CriticalConditionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  severity: {
    type: String,
    enum: ['MILD', 'MODERATE', 'SEVERE', 'LIFE_THREATENING'],
    default: 'MODERATE'
  },
  notes: String,
  managementNotes: String // How to manage in emergency
}, { _id: false });

// Critical allergy sub-schema
const CriticalAllergySchema = new mongoose.Schema({
  allergen: {
    type: String,
    required: true,
    trim: true
  },
  reaction: {
    type: String,
    required: true
  },
  severity: {
    type: String,
    enum: Object.values(ALLERGY_SEVERITY),
    required: true
  },
  isDrugAllergy: {
    type: Boolean,
    default: false
  },
  avoidMedications: [String] // Specific drugs to avoid
}, { _id: false });

// Current medication sub-schema
const CurrentMedicationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  dosage: String,
  frequency: String,
  purpose: String
}, { _id: false });

// Emergency contact sub-schema
const EmergencyContactSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  relation: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true
  },
  alternatePhone: String,
  isPrimary: {
    type: Boolean,
    default: false
  }
}, { _id: false });

// Primary physician sub-schema
const PrimaryPhysicianSchema = new mongoose.Schema({
  name: String,
  phone: String,
  hospital: String,
  specialization: String
}, { _id: false });

// Insurance quick-access sub-schema
const InsuranceSchema = new mongoose.Schema({
  provider: String,
  policyNumber: String,
  validUpto: Date,
  tpaName: String,
  tpaPhone: String
}, { _id: false });

const EmergencySummarySchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
    unique: true,
    index: true
  },

  // Basic identifiers
  patientName: {
    type: String,
    required: true
  },
  bloodGroup: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN']
  },
  dateOfBirth: Date,
  age: Number, // Computed field
  gender: {
    type: String,
    enum: ['MALE', 'FEMALE', 'OTHER']
  },

  // Critical health information
  criticalConditions: [CriticalConditionSchema],
  criticalAllergies: [CriticalAllergySchema],
  currentMedications: [CurrentMedicationSchema],

  // Contact information
  emergencyContacts: [EmergencyContactSchema],
  primaryPhysician: PrimaryPhysicianSchema,

  // Insurance
  insurance: InsuranceSchema,

  // Special instructions
  specialInstructions: String,
  dnrStatus: {
    type: Boolean,
    default: false
  },
  organDonor: {
    type: Boolean,
    default: false
  },

  // QR token for public access
  qrToken: {
    type: String,
    index: true
  },
  qrTokenHash: {
    type: String,
    index: true
  },
  qrTokenExpiry: Date,
  qrTokenCreatedAt: Date,

  // Tracking
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  sourceHealthRecord: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'HealthRecord'
  },

  // Access tracking
  accessCount: {
    type: Number,
    default: 0
  },
  lastAccessedAt: Date,
  lastAccessedFrom: String // IP address
}, {
  timestamps: true
});

// Compound indexes
EmergencySummarySchema.index({ qrTokenHash: 1, qrTokenExpiry: 1 });

// Pre-save: Compute age from DOB
EmergencySummarySchema.pre('save', function(next) {
  if (this.dateOfBirth) {
    const today = new Date();
    const birthDate = new Date(this.dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    this.age = age;
  }
  next();
});

// Instance method: Generate QR token
EmergencySummarySchema.methods.generateQRToken = function(expiryHours = QR_TOKEN_CONFIG.DEFAULT_EXPIRY_HOURS) {
  // Validate expiry hours
  const hours = Math.min(
    Math.max(expiryHours, QR_TOKEN_CONFIG.MIN_EXPIRY_HOURS),
    QR_TOKEN_CONFIG.MAX_EXPIRY_HOURS
  );

  // Generate secure random token
  const token = crypto.randomBytes(32).toString('hex');

  // Hash for storage (we only store hash, return plain token)
  this.qrTokenHash = crypto.createHash('sha256').update(token).digest('hex');
  this.qrTokenExpiry = new Date(Date.now() + hours * 60 * 60 * 1000);
  this.qrTokenCreatedAt = new Date();

  // Clear plain token (we don't store it)
  this.qrToken = undefined;

  return {
    token,
    expiresAt: this.qrTokenExpiry,
    url: `/api/v1/emergency/${token}`
  };
};

// Instance method: Validate QR token
EmergencySummarySchema.methods.validateToken = function(token) {
  if (!this.qrTokenHash || !this.qrTokenExpiry) {
    return { valid: false, reason: 'NO_TOKEN' };
  }

  if (new Date() > this.qrTokenExpiry) {
    return { valid: false, reason: 'EXPIRED' };
  }

  const hash = crypto.createHash('sha256').update(token).digest('hex');
  if (hash !== this.qrTokenHash) {
    return { valid: false, reason: 'INVALID' };
  }

  return { valid: true };
};

// Instance method: Record access
EmergencySummarySchema.methods.recordAccess = function(ipAddress) {
  this.accessCount = (this.accessCount || 0) + 1;
  this.lastAccessedAt = new Date();
  this.lastAccessedFrom = ipAddress;
  return this.save();
};

// Instance method: Revoke QR token
EmergencySummarySchema.methods.revokeToken = function() {
  this.qrToken = undefined;
  this.qrTokenHash = undefined;
  this.qrTokenExpiry = undefined;
  this.qrTokenCreatedAt = undefined;
  return this.save();
};

// Static: Find by QR token
EmergencySummarySchema.statics.findByToken = async function(token) {
  const hash = crypto.createHash('sha256').update(token).digest('hex');

  return this.findOne({
    qrTokenHash: hash,
    qrTokenExpiry: { $gt: new Date() }
  });
};

// Static: Update from health record
EmergencySummarySchema.statics.updateFromHealthRecord = async function(patientId, healthRecord, patientData) {
  const snapshot = healthRecord.healthSnapshot || {};

  // Extract critical conditions (severe/life-threatening)
  const criticalConditions = (snapshot.conditions || [])
    .filter(c => c.isActive && ['SEVERE', 'CHRONIC'].includes(c.severity))
    .map(c => ({
      name: c.name,
      severity: c.severity === 'CHRONIC' ? 'MODERATE' : 'SEVERE',
      notes: c.notes
    }));

  // Extract critical allergies (moderate and above)
  const criticalAllergies = (snapshot.allergies || [])
    .filter(a => a.isActive && ['MODERATE', 'SEVERE', 'LIFE_THREATENING'].includes(a.severity))
    .map(a => ({
      allergen: a.allergen,
      reaction: a.reaction,
      severity: a.severity,
      isDrugAllergy: a.isDrugAllergy
    }));

  // Extract current medications
  const currentMedications = (snapshot.currentMedications || [])
    .filter(m => m.isActive)
    .map(m => ({
      name: m.name,
      dosage: m.dosage,
      frequency: m.frequency,
      purpose: m.reason
    }));

  // Build emergency contacts from patient data
  const emergencyContacts = [];
  if (patientData.emergencyContact) {
    emergencyContacts.push({
      name: patientData.emergencyContact.name,
      relation: patientData.emergencyContact.relation,
      phone: patientData.emergencyContact.phone,
      isPrimary: true
    });
  }

  // Build insurance from patient data
  const insurance = patientData.insurance?.hasInsurance ? {
    provider: patientData.insurance.provider,
    policyNumber: patientData.insurance.policyNumber,
    validUpto: patientData.insurance.validUpto,
    tpaName: patientData.insurance.tpa
  } : undefined;

  // Upsert emergency summary
  return this.findOneAndUpdate(
    { patient: patientId },
    {
      patient: patientId,
      patientName: patientData.name,
      bloodGroup: patientData.bloodGroup || 'UNKNOWN',
      dateOfBirth: patientData.dateOfBirth,
      gender: patientData.gender?.toUpperCase(),
      criticalConditions,
      criticalAllergies,
      currentMedications,
      emergencyContacts,
      insurance,
      lastUpdated: new Date(),
      sourceHealthRecord: healthRecord._id
    },
    { upsert: true, new: true }
  );
};

// Static: Get public emergency data (limited fields for QR access)
EmergencySummarySchema.statics.getPublicEmergencyData = async function(token) {
  const summary = await this.findByToken(token);

  if (!summary) {
    return null;
  }

  // Record access
  await summary.recordAccess();

  // Return only essential emergency fields
  return {
    patientName: summary.patientName,
    bloodGroup: summary.bloodGroup,
    age: summary.age,
    gender: summary.gender,
    criticalConditions: summary.criticalConditions,
    criticalAllergies: summary.criticalAllergies,
    currentMedications: summary.currentMedications,
    emergencyContacts: summary.emergencyContacts,
    primaryPhysician: summary.primaryPhysician,
    specialInstructions: summary.specialInstructions,
    dnrStatus: summary.dnrStatus,
    organDonor: summary.organDonor,
    insurance: summary.insurance ? {
      provider: summary.insurance.provider,
      policyNumber: summary.insurance.policyNumber
    } : undefined,
    lastUpdated: summary.lastUpdated
  };
};

const EmergencySummary = mongoose.model('EmergencySummary', EmergencySummarySchema);

module.exports = EmergencySummary;
