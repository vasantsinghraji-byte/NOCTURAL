const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  // Recipient
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Notification type
  type: {
    type: String,
    enum: [
      'SHIFT_NEW',
      'SHIFT_MATCH',
      'SHIFT_REMINDER',
      'SHIFT_CANCELLED',
      'APPLICATION_RECEIVED',
      'APPLICATION_VIEWED',
      'APPLICATION_ACCEPTED',
      'APPLICATION_REJECTED',
      'PAYMENT_RECEIVED',
      'PAYMENT_PENDING',
      'PAYMENT_FAILED',
      'REVIEW_RECEIVED',
      'DOCUMENT_VERIFIED',
      'DOCUMENT_REJECTED',
      'PROFILE_INCOMPLETE',
      'MESSAGE_RECEIVED',
      'SYSTEM_ANNOUNCEMENT'
    ],
    required: true
  },

  // Title and message
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },

  // Related entities (optional, depends on type)
  relatedDuty: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Duty'
  },
  relatedApplication: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Application'
  },
  relatedPayment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment'
  },
  relatedReview: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Review'
  },

  // Action link (where to navigate when clicked)
  actionUrl: String,
  actionLabel: String, // e.g., "View Shift", "Review Application"

  // Priority
  priority: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
    default: 'MEDIUM'
  },

  // Status
  read: {
    type: Boolean,
    default: false
  },
  readAt: Date,

  // Delivery channels
  channels: {
    inApp: { type: Boolean, default: true },
    email: { type: Boolean, default: false },
    sms: { type: Boolean, default: false },
    push: { type: Boolean, default: false }
  },

  // Delivery status
  deliveryStatus: {
    email: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
      error: String
    },
    sms: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
      error: String
    },
    push: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
      error: String
    }
  },

  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },

  // Expiry (for auto-cleanup)
  expiresAt: Date

}, {
  timestamps: true
});

// Database Indexes for Performance
notificationSchema.index({ user: 1, createdAt: -1 }); // User's notification feed
notificationSchema.index({ user: 1, read: 1, createdAt: -1 }); // Unread notifications
notificationSchema.index({ type: 1, createdAt: -1 }); // Notifications by type
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // Auto-delete expired notifications
notificationSchema.index({ user: 1, type: 1, read: 1 }); // Filtered notification queries
notificationSchema.index({ user: 1, priority: 1, read: 1 }); // Priority notifications
notificationSchema.index({ relatedDuty: 1 }); // Duty-related notifications lookup
notificationSchema.index({ relatedApplication: 1 }); // Application notifications lookup

// Static method to create notification
notificationSchema.statics.createNotification = async function(data) {
  const notification = await this.create(data);

  // Here you would integrate with email/SMS/push services
  // For now, we'll just mark as sent
  if (data.channels) {
    if (data.channels.email) {
      // TODO: Send email
      notification.deliveryStatus.email.sent = true;
      notification.deliveryStatus.email.sentAt = new Date();
    }
    if (data.channels.sms) {
      // TODO: Send SMS
      notification.deliveryStatus.sms.sent = true;
      notification.deliveryStatus.sms.sentAt = new Date();
    }
    if (data.channels.push) {
      // TODO: Send push notification
      notification.deliveryStatus.push.sent = true;
      notification.deliveryStatus.push.sentAt = new Date();
    }
    await notification.save();
  }

  return notification;
};

// Static method to get unread count
notificationSchema.statics.getUnreadCount = async function(userId) {
  return await this.countDocuments({ user: userId, read: false });
};

// Static method to mark all as read
notificationSchema.statics.markAllAsRead = async function(userId) {
  return await this.updateMany(
    { user: userId, read: false },
    { $set: { read: true, readAt: new Date() } }
  );
};

// Method to mark as read
notificationSchema.methods.markAsRead = async function() {
  this.read = true;
  this.readAt = new Date();
  return await this.save();
};

module.exports = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
