const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { Message, Conversation } = require('../models/message');
const { paginate, paginateCursor, paginationMiddleware, sendPaginatedResponse } = require('../utils/pagination');

// Apply pagination middleware
router.use(paginationMiddleware);

// @route   GET /api/messages/conversations
// @desc    Get user's conversations with pagination
// @access  Private
router.get('/conversations', protect, async (req, res) => {
    try {
        const result = await paginate(
            Conversation,
            {
                participants: req.user._id,
                status: 'ACTIVE'
            },
            {
                ...req.pagination,
                sort: req.pagination.sort || { lastMessageAt: -1 },
                populate: 'participants:name email role hospital lastMessage dutyRelated:title hospital date'
            }
        );

        // Add unread counts to each conversation
        const conversationsWithUnread = result.data.map(conv => ({
            ...conv.toObject(),
            unreadCount: conv.getUnreadCount(req.user._id)
        }));

        res.json({
            success: true,
            data: conversationsWithUnread,
            pagination: result.pagination
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching conversations',
            error: error.message
        });
    }
});

// @route   GET /api/messages/conversation/:conversationId
// @desc    Get messages in a conversation with cursor pagination
// @access  Private
router.get('/conversation/:conversationId', protect, async (req, res) => {
    try {
        const conversation = await Conversation.findOne({
            _id: req.params.conversationId,
            participants: req.user._id
        });

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found'
            });
        }

        // Use cursor-based pagination for messages (better for chat)
        const query = { conversation: req.params.conversationId };
        if (req.query.before) {
            query.createdAt = { $lt: new Date(req.query.before) };
        }

        const result = await paginateCursor(
            Message,
            query,
            {
                limit: parseInt(req.query.limit) || 50,
                sort: { createdAt: -1 },
                cursorField: '_id',
                populate: 'sender:name role hospital recipient:name role'
            }
        );

        // Mark messages as read
        await Message.markAsRead(req.params.conversationId, req.user._id);
        await conversation.resetUnread(req.user._id);

        res.json({
            success: true,
            data: result.data.reverse(), // Reverse for chronological order
            pagination: result.pagination
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching messages',
            error: error.message
        });
    }
});

// @route   POST /api/messages/send
// @desc    Send a message
// @access  Private
router.post('/send', protect, async (req, res) => {
    try {
        const { recipientId, content, messageType, templateType, dutyId } = req.body;

        // Find or create conversation
        let conversation = await Conversation.findOne({
            participants: { $all: [req.user._id, recipientId] }
        });

        if (!conversation) {
            conversation = new Conversation({
                participants: [req.user._id, recipientId],
                dutyRelated: dutyId || null
            });
            await conversation.save();
        }

        // Create message
        const message = new Message({
            conversation: conversation._id,
            sender: req.user._id,
            recipient: recipientId,
            content,
            messageType: messageType || 'TEXT',
            templateType,
            relatedDuty: dutyId || null
        });

        await message.save();

        // Update conversation
        conversation.lastMessage = message._id;
        conversation.lastMessageAt = new Date();
        await conversation.incrementUnread(recipientId);

        await conversation.save();

        // Populate sender info
        await message.populate('sender', 'name role hospital');

        res.status(201).json({
            success: true,
            data: message,
            message: 'Message sent successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Error sending message',
            error: error.message
        });
    }
});

// @route   GET /api/messages/templates
// @desc    Get message templates
// @access  Private
router.get('/templates', protect, async (req, res) => {
    try {
        const templates = {
            THANK_YOU: "Thank you for accepting my application. Looking forward to working with you!",
            APPLICATION_ACCEPTED: "Your application has been accepted. We look forward to having you on our team!",
            DISCUSS_SHIFT: "I would like to discuss the shift details. Can we schedule a call?",
            RESCHEDULE_REQUEST: "I need to reschedule due to an emergency. Could we discuss alternative dates?",
            PAYMENT_REMINDER: "This is a friendly reminder about the pending payment for the shift completed on {date}.",
            REVIEW_REQUEST: "Thank you for completing the shift. We would appreciate your feedback!"
        };

        res.json({
            success: true,
            data: templates
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching templates',
            error: error.message
        });
    }
});

// @route   GET /api/messages/unread-count
// @desc    Get total unread messages count
// @access  Private
router.get('/unread-count', protect, async (req, res) => {
    try {
        const count = await Message.countDocuments({
            recipient: req.user._id,
            'readStatus.isRead': false
        });

        res.json({
            success: true,
            data: { count }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching unread count',
            error: error.message
        });
    }
});

module.exports = router;
