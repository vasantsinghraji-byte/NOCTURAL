/**
 * Job Lease: "only one server runs this job right now".
 *
 * The scheduled tick (services/cronService.js) takes a short lease before
 * running the background sweeps, so two App Runner instances never run them
 * at the same time. The document also records the last run for monitoring.
 */

const mongoose = require('mongoose');

const JobLeaseSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  owner: String,
  until: Date,
  lastRunAt: Date,
  lastDurationMs: Number,
  lastResult: mongoose.Schema.Types.Mixed,
  lastError: String
}, {
  timestamps: true
});

module.exports = mongoose.models.JobLease || mongoose.model('JobLease', JobLeaseSchema);
