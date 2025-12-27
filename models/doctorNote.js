/**
 * Doctor Note Model
 *
 * Professional notes from healthcare providers.
 * Notes can be marked as confidential (hidden from patient).
 * Content is encrypted at rest for HIPAA compliance.
 */

const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../utils/encryption');
const { NOTE_TYPES } = require('../constants/healthConstants');

// Diagnosis sub-schema (ICD-10 compatible)
const DiagnosisSchema = new mongoose.Schema({
  code: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['PRIMARY', 'SECONDARY', 'PROVISIONAL'],
    default: 'PRIMARY'
  }
}, { _id: false });

// Prescription sub-schema
const PrescriptionSchema = new mongoose.Schema({
  medication: {
    type: String,
    required: true,
    trim: true
  },
  dosage: {
    type: String,
    required: true
  },
  frequency: {
    type: String,
    required: true
  },
  duration: String,
  instructions: String,
  refillsAllowed: {
    type: Number,
    default: 0
  }
}, { _id: false });

// Attachment sub-schema
const AttachmentSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['IMAGE', 'PDF', 'LAB_REPORT', 'SCAN', 'OTHER'],
    default: 'OTHER'
  },
  size: Number,
  uploadedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const DoctorNoteSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
    index: true
  },

  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Context links
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'NurseBooking',
    index: true
  },
  healthRecord: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'HealthRecord'
  },

  noteType: {
    type: String,
    enum: Object.values(NOTE_TYPES),
    required: true,
    default: NOTE_TYPES.OBSERVATION
  },

  // Note content
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  content: {
    type: String,
    required: true
  },
  contentEncrypted: {
    type: Boolean,
    default: false
  },

  // Clinical information
  diagnosis: [DiagnosisSchema],
  prescriptions: [PrescriptionSchema],

  // Attachments
  attachments: [AttachmentSchema],

  // Visibility control
  isConfidential: {
    type: Boolean,
    default: false
  },
  confidentialReason: String,

  // Follow-up
  followUpRequired: {
    type: Boolean,
    default: false
  },
  followUpDate: Date,
  followUpNotes: String,

  // Soft delete (notes should never be hard deleted for legal reasons)
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  deletedAt: Date,
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  deletionReason: String
}, {
  timestamps: true
});

// Compound indexes
DoctorNoteSchema.index({ patient: 1, createdAt: -1 });
DoctorNoteSchema.index({ doctor: 1, createdAt: -1 });
DoctorNoteSchema.index({ patient: 1, noteType: 1, createdAt: -1 });
DoctorNoteSchema.index({ patient: 1, isConfidential: 1, isActive: 1 });

// Pre-save: Encrypt content if needed
DoctorNoteSchema.pre('save', function(next) {
  // Encrypt sensitive content for confidential notes
  if (this.isModified('content') && this.isConfidential && !this.contentEncrypted) {
    try {
      this.content = encrypt(this.content);
      this.contentEncrypted = true;
    } catch (err) {
      // If encryption fails, log but continue (content remains unencrypted)
      console.error('Failed to encrypt doctor note content:', err);
    }
  }
  next();
});

// Instance method: Get decrypted content
DoctorNoteSchema.methods.getDecryptedContent = function() {
  if (this.contentEncrypted) {
    try {
      return decrypt(this.content);
    } catch (err) {
      console.error('Failed to decrypt doctor note content:', err);
      return '[Decryption failed]';
    }
  }
  return this.content;
};

// Instance method: Soft delete
DoctorNoteSchema.methods.softDelete = async function(userId, reason) {
  this.isActive = false;
  this.deletedAt = new Date();
  this.deletedBy = userId;
  this.deletionReason = reason;
  return this.save();
};

// Static: Get patient notes (excluding confidential for patient view)
DoctorNoteSchema.statics.getPatientNotes = async function(patientId, options = {}) {
  const { page = 1, limit = 10, includeConfidential = false, noteType } = options;
  const skip = (page - 1) * limit;

  const query = {
    patient: patientId,
    isActive: true
  };

  if (!includeConfidential) {
    query.isConfidential = false;
  }

  if (noteType) {
    query.noteType = noteType;
  }

  const notes = await this.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('doctor', 'name professional.primarySpecialization')
    .lean();

  const total = await this.countDocuments(query);

  // Decrypt content for each note
  for (const note of notes) {
    if (note.contentEncrypted) {
      try {
        note.content = decrypt(note.content);
      } catch (err) {
        note.content = '[Content unavailable]';
      }
    }
  }

  return {
    notes,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

// Static: Get notes by doctor
DoctorNoteSchema.statics.getDoctorNotes = async function(doctorId, options = {}) {
  const { page = 1, limit = 20, patientId } = options;
  const skip = (page - 1) * limit;

  const query = {
    doctor: doctorId,
    isActive: true
  };

  if (patientId) {
    query.patient = patientId;
  }

  const notes = await this.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('patient', 'name phone')
    .lean();

  const total = await this.countDocuments(query);

  return {
    notes,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

// Static: Get notes for a booking
DoctorNoteSchema.statics.getBookingNotes = async function(bookingId) {
  return this.find({
    booking: bookingId,
    isActive: true
  })
    .sort({ createdAt: -1 })
    .populate('doctor', 'name professional.primarySpecialization')
    .lean();
};

// Static: Create intake review note
DoctorNoteSchema.statics.createIntakeReviewNote = async function(patientId, doctorId, healthRecordId, reviewData) {
  return this.create({
    patient: patientId,
    doctor: doctorId,
    healthRecord: healthRecordId,
    noteType: NOTE_TYPES.INTAKE_REVIEW,
    title: 'Health Intake Review',
    content: reviewData.notes || 'Initial health intake reviewed and approved.',
    diagnosis: reviewData.diagnosis || [],
    isConfidential: false
  });
};

const DoctorNote = mongoose.model('DoctorNote', DoctorNoteSchema);

module.exports = DoctorNote;
