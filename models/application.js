const mongoose = require('mongoose');

const ApplicationSchema = new mongoose.Schema({
  duty: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Duty',
    required: true
  },
  applicant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  coverLetter: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'],
    default: 'PENDING'
  },
  appliedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Database Indexes for Performance
ApplicationSchema.index({ duty: 1, applicant: 1 }, { unique: true }); // Prevent duplicate applications
ApplicationSchema.index({ applicant: 1, status: 1 }); // Doctor's application history by status
ApplicationSchema.index({ duty: 1, status: 1 }); // Duty's applications by status (for hospital)
ApplicationSchema.index({ status: 1, appliedAt: -1 }); // Recent applications by status
ApplicationSchema.index({ applicant: 1, createdAt: -1 }); // Doctor's chronological application history
ApplicationSchema.index({ duty: 1, createdAt: 1 }); // Duty applications sorted by time (first-come-first-served)

module.exports = mongoose.models.Application || mongoose.model('Application', ApplicationSchema);