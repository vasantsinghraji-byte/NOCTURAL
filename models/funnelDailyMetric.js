const mongoose = require('mongoose');

const FunnelDailyMetricSchema = new mongoose.Schema({
  day: {
    type: String,
    required: true,
    match: [/^\d{4}-\d{2}-\d{2}$/, 'Day must be YYYY-MM-DD']
  },
  event: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80
  },
  path: {
    type: String,
    required: true,
    trim: true,
    maxlength: 300
  },
  target: {
    type: String,
    default: '',
    trim: true,
    maxlength: 300
  },
  count: {
    type: Number,
    default: 0,
    min: 0
  },
  lastSeenAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

FunnelDailyMetricSchema.index({ day: 1, event: 1, path: 1, target: 1 }, { unique: true });
FunnelDailyMetricSchema.index({ day: -1, event: 1 });

module.exports = mongoose.model('FunnelDailyMetric', FunnelDailyMetricSchema);
