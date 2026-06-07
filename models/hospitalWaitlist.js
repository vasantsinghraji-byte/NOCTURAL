const mongoose = require('mongoose');

const normalizeKey = (value) => String(value || '').trim().toLowerCase();

const HospitalWaitlistSchema = new mongoose.Schema({
  facilityName: {
    type: String,
    required: [true, 'Facility name is required'],
    trim: true,
    minlength: 2,
    maxlength: 180
  },
  facilityType: {
    type: String,
    required: [true, 'Facility type is required'],
    enum: ['hospital', 'tertiary_care', 'clinic', 'care_centre', 'other']
  },
  contactName: {
    type: String,
    required: [true, 'Contact name is required'],
    trim: true,
    minlength: 2,
    maxlength: 120
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true,
    maxlength: 160
  },
  emailKey: {
    type: String,
    required: true,
    index: true
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    maxlength: 25
  },
  city: {
    type: String,
    required: [true, 'City is required'],
    trim: true,
    maxlength: 100
  },
  state: {
    type: String,
    trim: true,
    maxlength: 100
  },
  expectedNeed: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  organizationKey: {
    type: String,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['new', 'contacted', 'qualified', 'closed'],
    default: 'new',
    index: true
  },
  contactedAt: Date,
  contactedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  sourcePath: {
    type: String,
    default: '',
    trim: true,
    maxlength: 300
  },
  userAgent: {
    type: String,
    default: '',
    trim: true,
    maxlength: 500
  },
  ipAddress: {
    type: String,
    default: '',
    trim: true,
    maxlength: 80
  }
}, {
  timestamps: true
});

HospitalWaitlistSchema.pre('validate', function setNormalizedKeys(next) {
  this.emailKey = normalizeKey(this.email);
  this.organizationKey = normalizeKey(`${this.facilityName}|${this.city}`);
  next();
});

HospitalWaitlistSchema.index({ createdAt: -1 });
HospitalWaitlistSchema.index({ facilityType: 1, status: 1 });

module.exports = mongoose.model('HospitalWaitlist', HospitalWaitlistSchema);
