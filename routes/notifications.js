const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const notificationService = require('../services/notificationService');

// Get all notifications for logged-in user
router.get('/', protect, async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly = false } = req.query;

    const result = await notificationService.getNotifications(req.user._id, {
      page,
      limit,
      unreadOnly: unreadOnly === 'true'
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Error fetching notifications'
    });
  }
});

// Get unread notification count
router.get('/unread-count', protect, async (req, res) => {
  try {
    const count = await notificationService.getUnreadCount(req.user._id);

    res.json({
      success: true,
      data: { unreadCount: count }
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Error fetching count'
    });
  }
});

// Mark notification as read
router.put('/:id/read', protect, async (req, res) => {
  try {
    const notification = await notificationService.markAsRead(req.params.id, req.user._id);

    res.json({
      success: true,
      message: 'Notification marked as read',
      data: notification
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Error updating notification'
    });
  }
});

// Mark all notifications as read
router.put('/read-all', protect, async (req, res) => {
  try {
    await notificationService.markAllAsRead(req.user._id);

    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Error updating notifications'
    });
  }
});

// Delete notification
router.delete('/:id', protect, async (req, res) => {
  try {
    await notificationService.deleteNotification(req.params.id, req.user._id);

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Error deleting notification'
    });
  }
});

// Clear all read notifications
router.delete('/clear/read', protect, async (req, res) => {
  try {
    await notificationService.clearReadNotifications(req.user._id);

    res.json({
      success: true,
      message: 'Read notifications cleared successfully'
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Error clearing notifications'
    });
  }
});

// Create notification (for testing or admin use)
router.post('/', protect, async (req, res) => {
  try {
    const { userId, type, title, message, actionUrl, actionLabel, priority, channels } = req.body;

    const notification = await notificationService.createNotification({
      user: userId || req.user._id,
      type,
      title,
      message,
      actionUrl,
      actionLabel,
      priority: priority || 'MEDIUM',
      channels: channels || { inApp: true }
    });

    res.status(201).json({
      success: true,
      message: 'Notification created successfully',
      data: notification
    });
  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Error creating notification'
    });
  }
});

module.exports = router;
