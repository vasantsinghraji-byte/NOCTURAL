const mongoose = require('mongoose');

const HospitalWaitlistSchema = new mongoose.Schema({
  organizationName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 160
  },
  contactName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    maxlength: 160,
    match: [/^[\w.+-]+@([\w-]+\.)+[\w-]{2,}$/, 'Please provide a valid email']
  },
  phone: {
    type: String,
    required: true,
    trim: true,
    maxlength: 20
  },
  city: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  facilityType: {
    type: String,
    required: true,
    enum: ['hospital', 'tertiary-care-centre', 'clinic-network', 'care-centre']
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  source: {
    type: String,
    trim: true,
    maxlength: 80,
    default: 'public-funnel'
  },
  status: {
    type: String,
    enum: ['new', 'contacted', 'qualified', 'closed'],
    default: 'new'
  }
}, {
  timestamps: true
});

HospitalWaitlistSchema.index({ email: 1, createdAt: -1 });
HospitalWaitlistSchema.index({ facilityType: 1, city: 1 });

module.exports = mongoose.models.HospitalWaitlist || mongoose.model('HospitalWaitlist', HospitalWaitlistSchema);
