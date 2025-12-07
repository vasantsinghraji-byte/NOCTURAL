const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const Notification = require('../models/notification');

// Get all notifications for logged-in user
router.get('/', protect, async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly = false } = req.query;
    const skip = (page - 1) * limit;

    const query = { user: req.user._id };
    if (unreadOnly === 'true') {
      query.read = false;
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('relatedDuty', 'title hospital date specialty')
      .populate('relatedApplication', 'status')
      .lean();

    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.getUnreadCount(req.user._id);

    res.json({
      success: true,
      data: {
        notifications,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        },
        unreadCount
      }
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ success: false, message: 'Error fetching notifications', error: error.message });
  }
});

// Get unread notification count
router.get('/unread-count', protect, async (req, res) => {
  try {
    const count = await Notification.getUnreadCount(req.user._id);

    res.json({
      success: true,
      data: { unreadCount: count }
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Error fetching count', error: error.message });
  }
});

// Mark notification as read
router.put('/:id/read', protect, async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    await notification.markAsRead();

    res.json({
      success: true,
      message: 'Notification marked as read',
      data: notification
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Error updating notification', error: error.message });
  }
});

// Mark all notifications as read
router.put('/read-all', protect, async (req, res) => {
  try {
    await Notification.markAllAsRead(req.user._id);

    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Error updating notifications', error: error.message });
  }
});

// Delete notification
router.delete('/:id', protect, async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id
    });

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Error deleting notification', error: error.message });
  }
});

// Clear all read notifications
router.delete('/clear/read', protect, async (req, res) => {
  try {
    await Notification.deleteMany({
      user: req.user._id,
      read: true
    });

    res.json({
      success: true,
      message: 'Read notifications cleared successfully'
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Error clearing notifications', error: error.message });
  }
});

// Create notification (for testing or admin use)
router.post('/', protect, async (req, res) => {
  try {
    const { userId, type, title, message, actionUrl, actionLabel, priority, channels } = req.body;

    const notification = await Notification.createNotification({
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
    res.status(500).json({ success: false, message: 'Error creating notification', error: error.message });
  }
});

module.exports = router;
