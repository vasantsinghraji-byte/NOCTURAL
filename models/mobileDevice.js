const mongoose = require('mongoose');

const mobileDeviceSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  ownerType: {
    type: String,
    enum: ['patient', 'provider'],
    required: true,
    index: true
  },
  token: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  platform: {
    type: String,
    enum: ['android', 'ios'],
    required: true
  },
  enabled: {
    type: Boolean,
    default: true
  },
  lastSeenAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

mobileDeviceSchema.index({ owner: 1, ownerType: 1, enabled: 1 });

module.exports = mongoose.models.MobileDevice || mongoose.model('MobileDevice', mobileDeviceSchema);
