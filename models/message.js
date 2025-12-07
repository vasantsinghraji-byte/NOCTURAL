const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    conversation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    messageType: {
        type: String,
        enum: ['TEXT', 'FILE', 'VOICE', 'SYSTEM', 'TEMPLATE'],
        default: 'TEXT'
    },
    content: {
        type: String,
        required: true
    },
    templateType: {
        type: String,
        enum: [
            'THANK_YOU',
            'APPLICATION_ACCEPTED',
            'DISCUSS_SHIFT',
            'RESCHEDULE_REQUEST',
            'PAYMENT_REMINDER',
            'REVIEW_REQUEST',
            'CUSTOM'
        ]
    },
    attachments: [{
        type: {
            type: String,
            enum: ['DOCUMENT', 'IMAGE', 'PDF', 'OTHER']
        },
        url: String,
        filename: String,
        size: Number,
        uploadedAt: Date
    }],
    voiceNote: {
        url: String,
        duration: Number, // in seconds
        transcription: String
    },
    readStatus: {
        isRead: { type: Boolean, default: false },
        readAt: Date
    },
    deliveryStatus: {
        type: String,
        enum: ['SENT', 'DELIVERED', 'READ', 'FAILED'],
        default: 'SENT'
    },
    relatedDuty: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Duty'
    },
    priority: {
        type: String,
        enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'],
        default: 'NORMAL'
    },
    metadata: {
        deviceType: String,
        ipAddress: String,
        language: String
    }
}, {
    timestamps: true
});

// Indexes
messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ recipient: 1, 'readStatus.isRead': 1 });

// Conversation schema to group messages
const conversationSchema = new mongoose.Schema({
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }],
    dutyRelated: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Duty'
    },
    lastMessage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    },
    lastMessageAt: {
        type: Date,
        default: Date.now
    },
    unreadCount: {
        type: Map,
        of: Number,
        default: {}
    },
    archived: {
        type: Map,
        of: Boolean,
        default: {}
    },
    muted: {
        type: Map,
        of: Boolean,
        default: {}
    },
    status: {
        type: String,
        enum: ['ACTIVE', 'ARCHIVED', 'DELETED'],
        default: 'ACTIVE'
    }
}, {
    timestamps: true
});

// Indexes
conversationSchema.index({ participants: 1 });
conversationSchema.index({ lastMessageAt: -1 });
conversationSchema.index({ dutyRelated: 1 });

// Method to mark messages as read
messageSchema.statics.markAsRead = async function(conversationId, userId) {
    await this.updateMany(
        {
            conversation: conversationId,
            recipient: userId,
            'readStatus.isRead': false
        },
        {
            'readStatus.isRead': true,
            'readStatus.readAt': new Date(),
            deliveryStatus: 'READ'
        }
    );
};

// Method to get unread count
conversationSchema.methods.getUnreadCount = function(userId) {
    return this.unreadCount.get(userId.toString()) || 0;
};

// Method to increment unread count
conversationSchema.methods.incrementUnread = async function(userId) {
    const userIdStr = userId.toString();
    const currentCount = this.unreadCount.get(userIdStr) || 0;
    this.unreadCount.set(userIdStr, currentCount + 1);
    await this.save();
};

// Method to reset unread count
conversationSchema.methods.resetUnread = async function(userId) {
    this.unreadCount.set(userId.toString(), 0);
    await this.save();
};

const Message = mongoose.model('Message', messageSchema);
const Conversation = mongoose.model('Conversation', conversationSchema);

module.exports = { Message, Conversation };
