/**
 * Notification Service
 *
 * Business logic layer for notification operations
 * Handles creating, fetching, and managing notifications
 */

const Notification = require('../models/notification');
const sanitizeHtml = require('sanitize-html');
const logger = require('../utils/logger');
const { HTTP_STATUS } = require('../constants');
const pushNotificationService = require('./pushNotificationService');

const INTERNAL_ACTION_BASE = 'https://internal.invalid';
const ALLOWED_ACTION_PATH_PREFIXES = ['/roles/', '/patient/', '/doctor/', '/admin/'];

class NotificationService {
  /**
   * Get notifications for a user with pagination
   * @param {String} userId - User ID
   * @param {Object} options - Pagination and filter options
   * @returns {Promise<Object>} Paginated notifications
   */
  async getNotifications(userId, options = {}) {
    const { page = 1, limit = 20, unreadOnly = false } = options;
    const skip = (page - 1) * limit;

    const query = { user: userId };
    if (unreadOnly) {
      query.read = false;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('relatedDuty', 'title hospital date specialty')
        .populate('relatedApplication', 'status')
        .lean(),
      Notification.countDocuments(query),
      Notification.getUnreadCount(userId)
    ]);

    return {
      notifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      unreadCount
    };
  }

  /**
   * Get unread notification count
   * @param {String} userId - User ID
   * @returns {Promise<Number>} Unread count
   */
  async getUnreadCount(userId) {
    return await Notification.getUnreadCount(userId);
  }

  /**
   * Mark a notification as read
   * @param {String} notificationId - Notification ID
   * @param {String} userId - User ID
   * @returns {Promise<Object>} Updated notification
   */
  async markAsRead(notificationId, userId) {
    const notification = await Notification.findOne({
      _id: notificationId,
      user: userId
    });

    if (!notification) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'Notification not found'
      };
    }

    await notification.markAsRead();

    logger.info('Notification marked as read', { notificationId, userId });

    return notification;
  }

  /**
   * Mark all notifications as read for a user
   * @param {String} userId - User ID
   * @returns {Promise<void>}
   */
  async markAllAsRead(userId) {
    await Notification.markAllAsRead(userId);
    logger.info('All notifications marked as read', { userId });
  }

  /**
   * Delete a notification
   * @param {String} notificationId - Notification ID
   * @param {String} userId - User ID
   * @returns {Promise<Object>} Deleted notification
   */
  async deleteNotification(notificationId, userId) {
    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      user: userId
    });

    if (!notification) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'Notification not found'
      };
    }

    logger.info('Notification deleted', { notificationId, userId });

    return notification;
  }

  /**
   * Clear all read notifications for a user
   * @param {String} userId - User ID
   * @returns {Promise<Number>} Number of deleted notifications
   */
  async clearReadNotifications(userId) {
    const result = await Notification.deleteMany({
      user: userId,
      read: true
    });

    logger.info('Read notifications cleared', { userId, count: result.deletedCount });

    return result.deletedCount;
  }

  /**
   * Create a notification
   * @param {Object} notificationData - Notification data
   * @returns {Promise<Object>} Created notification
   */
  async createNotification(notificationData) {
    const VALID_RECIPIENT_MODELS = ['User', 'Patient'];

    if (notificationData.recipientModel && !VALID_RECIPIENT_MODELS.includes(notificationData.recipientModel)) {
      throw {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: `Invalid recipientModel: "${notificationData.recipientModel}". Must be one of: ${VALID_RECIPIENT_MODELS.join(', ')}`
      };
    }

    // Normalize: callers may pass 'recipient' instead of 'user'
    if (notificationData.recipient && !notificationData.user) {
      notificationData.user = notificationData.recipient;
    }

    if (!notificationData.user) {
      throw {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: 'Notification recipient (user) is required'
      };
    }

    if (!notificationData.type) {
      throw {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: 'Notification type is required'
      };
    }

    // Defense-in-depth: neutralize markup in free-text fields and reject external
    // action URLs so a notification cannot carry XSS or open-redirect payloads into
    // any renderer, regardless of how the client displays it.
    notificationData.title = this.sanitizeText(notificationData.title);
    notificationData.message = this.sanitizeText(notificationData.message);
    notificationData.actionUrl = this.sanitizeActionUrl(notificationData.actionUrl);

    const notification = await Notification.createNotification(notificationData);

    if (notificationData.channels?.push) {
      try {
        const delivery = await pushNotificationService.sendToOwner({
          owner: notificationData.user,
          userType: notificationData.recipientModel === 'Patient' ? 'patient' : 'provider',
          title: notificationData.title,
          body: notificationData.message,
          data: {
            notificationId: notification._id,
            type: notificationData.type,
            actionUrl: notificationData.actionUrl
          }
        });
        notification.deliveryStatus.push.sent = delivery.sentCount > 0;
        notification.deliveryStatus.push.sentAt = delivery.sentCount > 0 ? new Date() : undefined;
        notification.deliveryStatus.push.error = delivery.error || undefined;
        await notification.save();
      } catch (error) {
        notification.deliveryStatus.push.sent = false;
        notification.deliveryStatus.push.error = error.message;
        await notification.save();
        logger.error('Push notification delivery failed', {
          notificationId: notification._id,
          error: error.message
        });
      }
    }

    logger.info('Notification created', {
      notificationId: notification._id,
      userId: notificationData.user,
      type: notificationData.type
    });

    return notification;
  }

  /**
   * Create notification for duty application
   * @param {Object} params - Parameters
   * @returns {Promise<Object>} Created notification
   */
  async notifyDutyApplication(params) {
    const { userId, duty, application, type } = params;

    const notificationData = {
      user: userId,
      type: type || 'APPLICATION_UPDATE',
      title: this.getApplicationTitle(type),
      message: this.getApplicationMessage(type, duty),
      relatedDuty: duty._id,
      relatedApplication: application._id,
      actionUrl: `/roles/doctor/my-applications.html?id=${application._id}`,
      actionLabel: 'View Application',
      priority: 'HIGH',
      channels: { inApp: true, email: true }
    };

    return this.createNotification(notificationData);
  }

  /**
   * Create notification for duty update
   * @param {Object} params - Parameters
   * @returns {Promise<Object>} Created notification
   */
  async notifyDutyUpdate(params) {
    const { userId, duty, updateType } = params;

    const notificationData = {
      user: userId,
      type: 'DUTY_UPDATE',
      title: `Duty Updated: ${duty.title}`,
      message: `The duty "${duty.title}" has been ${updateType}.`,
      relatedDuty: duty._id,
      actionUrl: `/roles/doctor/duty-details.html?id=${duty._id}`,
      actionLabel: 'View Duty',
      priority: 'MEDIUM',
      channels: { inApp: true }
    };

    return this.createNotification(notificationData);
  }

  /**
   * Create notification for payment
   * @param {Object} params - Parameters
   * @returns {Promise<Object>} Created notification
   */
  async notifyPayment(params) {
    const { userId, amount, bookingId, status } = params;

    const notificationData = {
      user: userId,
      type: status === 'SUCCESS' ? 'PAYMENT_RECEIVED' : 'PAYMENT_FAILED',
      title: status === 'SUCCESS' ? 'Payment Received' : 'Payment Failed',
      message: status === 'SUCCESS'
        ? `Payment of ₹${amount} received successfully.`
        : `Payment of ₹${amount} failed. Please try again.`,
      actionUrl: `/roles/patient/patient-dashboard.html`,
      actionLabel: 'View Dashboard',
      priority: status === 'SUCCESS' ? 'MEDIUM' : 'HIGH',
      channels: { inApp: true, email: true }
    };

    return this.createNotification(notificationData);
  }

  /**
   * Strip HTML tags and null bytes from free-text fields.
   * Tags are removed (not entity-encoded) so the value stays safe in both the
   * hardened textContent renderer and any future non-hardened renderer.
   * @private
   */
  sanitizeText(value) {
    if (typeof value !== 'string') {
      return value;
    }

    return sanitizeHtml(value.replace(/\0/g, ''), {
      allowedTags: [],
      allowedAttributes: {}
    }).trim();
  }

  /**
   * Allow only canonical internal paths used by application workflows.
   * @private
   */
  sanitizeActionUrl(actionUrl) {
    if (typeof actionUrl !== 'string' || actionUrl === '') {
      return undefined;
    }

    try {
      const parsed = new URL(actionUrl, INTERNAL_ACTION_BASE);
      const decodedPath = decodeURIComponent(parsed.pathname);
      const allowedPath = ALLOWED_ACTION_PATH_PREFIXES.some(
        prefix => parsed.pathname.startsWith(prefix)
      );

      if (
        parsed.origin !== INTERNAL_ACTION_BASE ||
        decodedPath.startsWith('//') ||
        decodedPath.includes('\\') ||
        !allowedPath
      ) {
        throw new Error('Action URL is not an allowlisted internal path');
      }

      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch (_error) {
      logger.warn('Rejected non-internal notification actionUrl', { actionUrl });
      return undefined;
    }
  }

  /**
   * Get application notification title
   * @private
   */
  getApplicationTitle(type) {
    const titles = {
      'APPLICATION_SUBMITTED': 'Application Submitted',
      'APPLICATION_ACCEPTED': 'Application Accepted!',
      'APPLICATION_REJECTED': 'Application Update',
      'APPLICATION_WITHDRAWN': 'Application Withdrawn'
    };
    return titles[type] || 'Application Update';
  }

  /**
   * Get application notification message
   * @private
   */
  getApplicationMessage(type, duty) {
    const messages = {
      'APPLICATION_SUBMITTED': `Your application for "${duty.title}" has been submitted.`,
      'APPLICATION_ACCEPTED': `Congratulations! Your application for "${duty.title}" has been accepted.`,
      'APPLICATION_REJECTED': `Your application for "${duty.title}" was not selected this time.`,
      'APPLICATION_WITHDRAWN': `Your application for "${duty.title}" has been withdrawn.`
    };
    return messages[type] || `Application status updated for "${duty.title}".`;
  }
}

module.exports = new NotificationService();
