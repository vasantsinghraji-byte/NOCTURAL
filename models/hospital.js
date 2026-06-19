const mongoose = require('mongoose');

/**
 * Hospital / Org entity.
 *
 * Structured tenant identity that replaces the free-text `hospital` string used
 * across User, Duty, ShiftSeries and Earning. Records carry an optional
 * `hospitalId` reference to this collection, backfilled from their `hospital`
 * string by scripts/migrate-hospitals-to-objectid.js (expand phase). Route
 * scoping continues to use the `hospital` string until the data is migrated in
 * every environment, after which the scoping can be cut over to `hospitalId`.
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
