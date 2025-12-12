/**
 * Notification Service
 *
 * Business logic layer for notification operations
 * Handles creating, fetching, and managing notifications
 */

const Notification = require('../models/notification');
const logger = require('../utils/logger');
const { HTTP_STATUS } = require('../constants');

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
    const notification = await Notification.createNotification(notificationData);

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
      actionUrl: `/roles/patient/payments-dashboard.html`,
      actionLabel: 'View Payments',
      priority: status === 'SUCCESS' ? 'MEDIUM' : 'HIGH',
      channels: { inApp: true, email: true }
    };

    return this.createNotification(notificationData);
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
