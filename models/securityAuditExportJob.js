const mongoose = require('mongoose');

const securityAuditExportJobSchema = new mongoose.Schema({
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: {
    type: String,
    enum: ['pending', 'running', 'completed', 'failed', 'cancelled', 'dead_letter', 'quarantined', 'deleted'],
    default: 'pending',
    index: true
  },
  filters: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
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
  quarantineInvestigation: {
    status: {
      type: String,
      enum: ['pending', 'release_requested', 'released', 'deleted'],
      default: 'pending',
      index: true
    },
    resolution: {
      type: String,
      enum: ['released', 'deleted']
    },
    releaseRequestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    releaseRequestedAt: Date,
    releaseApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    releaseApprovedAt: Date,
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: Date,
    history: [{
      action: {
        type: String,
        enum: ['release_requested', 'release_approved', 'delete_confirmed', 'auto_deleted', 'note_added'],
        required: true
      },
      note: {
        type: String,
        trim: true,
        maxlength: 2000
      },
      actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      actorType: {
        type: String,
        enum: ['user', 'system'],
        default: 'user'
      },
      createdAt: {
        type: Date,
        default: Date.now,
        required: true
      }
    }]
  },
  estimatedRows: {
    type: Number,
    default: 0
  },
  rowCount: {
    type: Number,
    default: 0
  },
  progressPercent: {
    type: Number,
    default: 0
  },
  attemptCount: {
    type: Number,
    default: 0
  },
  nextRetryAt: Date,
  lastProgressAt: Date,
  error: String,
  startedAt: Date,
  completedAt: Date,
  expiresAt: {
    type: Date,
    required: true
  }
}, { timestamps: true });

securityAuditExportJobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
securityAuditExportJobSchema.index({
  status: 1,
  'quarantineInvestigation.releaseRequestedBy': 1,
  'quarantineInvestigation.releaseApprovedBy': 1
});

module.exports = mongoose.models.SecurityAuditExportJob ||
  mongoose.model('SecurityAuditExportJob', securityAuditExportJobSchema);
