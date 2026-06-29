const mongoose = require('mongoose');

/**
 * Hospital / Org entity.
 *
 * Structured tenant identity for hospital-scoped data. User, Duty, ShiftSeries
 * and Earning records use `hospitalId` for tenant scoping after the hospital
 * string backfill/cutover.
 */
const hospitalSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  location: {
    type: String
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.models.Hospital || mongoose.model('Hospital', hospitalSchema);
