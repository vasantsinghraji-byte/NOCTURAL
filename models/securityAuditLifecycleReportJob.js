const mongoose = require('mongoose');

const securityAuditLifecycleReportJobSchema = new mongoose.Schema({
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  exportJob: { type: mongoose.Schema.Types.ObjectId, ref: 'SecurityAuditExportJob', required: true, index: true },
  reportType: {
    type: String,
    enum: ['lifecycle', 'quarantine_approval_history'],
    default: 'lifecycle',
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'running', 'completed', 'failed'],
    default: 'pending',
    index: true
  },
  filePath: String,
  storageProvider: {
    type: String,
    enum: ['local', 'gcs', 's3'],
    default: 'local',
    index: true
  },
  storageKey: String,
  downloadFileName: String,
  encryption: {
    mode: String,
    keyId: String
  },
  checksum: {
    algorithm: String,
    value: String,
    verifiedAt: Date
  },
  rowCount: {
    type: Number,
    default: 0
  },
  error: String,
  startedAt: Date,
  completedAt: Date,
  expiresAt: {
    type: Date,
    required: true
  }
}, { timestamps: true });

securityAuditLifecycleReportJobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
securityAuditLifecycleReportJobSchema.index({ requestedBy: 1, exportJob: 1, reportType: 1, status: 1 });

module.exports = mongoose.models.SecurityAuditLifecycleReportJob ||
  mongoose.model('SecurityAuditLifecycleReportJob', securityAuditLifecycleReportJobSchema);
