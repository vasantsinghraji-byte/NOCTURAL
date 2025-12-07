const mongoose = require('mongoose');

const calendarEventSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        required: true
    },
    description: String,
    eventType: {
        type: String,
        enum: [
            'SHIFT_ACCEPTED',
            'SHIFT_PENDING',
            'BLACKOUT_DATE',
            'PERSONAL_EVENT',
            'VACATION',
            'TRAINING',
            'MEETING',
            'OTHER'
        ],
        required: true
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    startTime: String, // HH:mm format
    endTime: String,   // HH:mm format
    allDay: {
        type: Boolean,
        default: false
    },
    // Color coding
    color: {
        type: String,
        default: function() {
            const colors = {
                SHIFT_ACCEPTED: '#28a745',    // GREEN
                SHIFT_PENDING: '#ffc107',     // YELLOW
                BLACKOUT_DATE: '#dc3545',     // RED
                PERSONAL_EVENT: '#6c757d',    // GRAY
                VACATION: '#17a2b8',          // BLUE
                TRAINING: '#6f42c1',          // PURPLE
                MEETING: '#fd7e14'            // ORANGE
            };
            return colors[this.eventType] || '#6c757d';
        }
    },
    // Related entities
    duty: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Duty'
    },
    application: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Application'
    },
    // Location and travel information
    location: String,
    distance: Number, // in km
    travelTime: Number, // in minutes
    // Conflict detection
    conflicts: [{
        eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'CalendarEvent' },
        conflictType: {
            type: String,
            enum: ['OVERLAP', 'CLOSE_PROXIMITY', 'TRAVEL_TIME', 'OVER_LIMIT']
        },
        severity: {
            type: String,
            enum: ['LOW', 'MEDIUM', 'HIGH'],
            default: 'MEDIUM'
        },
        message: String,
        detectedAt: Date
    }],
    warnings: [{
        type: {
            type: String,
            enum: [
                'WEEKLY_HOURS_EXCEEDED',
                'LONG_TRAVEL',
                'BACK_TO_BACK_SHIFTS',
                'INSUFFICIENT_REST',
                'CONFLICTING_DUTY',
                'BLACKOUT_VIOLATION'
            ]
        },
        message: String,
        severity: {
            type: String,
            enum: ['INFO', 'WARNING', 'CRITICAL'],
            default: 'WARNING'
        },
        acknowledged: { type: Boolean, default: false }
    }],
    // External calendar integration
    externalCalendar: {
        provider: {
            type: String,
            enum: ['GOOGLE', 'APPLE', 'OUTLOOK', 'NONE'],
            default: 'NONE'
        },
        externalEventId: String,
        syncStatus: {
            type: String,
            enum: ['SYNCED', 'PENDING', 'FAILED', 'NOT_SYNCED'],
            default: 'NOT_SYNCED'
        },
        lastSynced: Date
    },
    // Reminders
    reminders: [{
        type: {
            type: String,
            enum: ['EMAIL', 'SMS', 'PUSH', 'IN_APP']
        },
        minutesBefore: Number,
        sent: { type: Boolean, default: false },
        sentAt: Date
    }],
    // Recurrence for imported personal events
    recurrence: {
        frequency: {
            type: String,
            enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'NONE'],
            default: 'NONE'
        },
        interval: { type: Number, default: 1 },
        endDate: Date,
        daysOfWeek: [Number] // 0-6 for Sunday-Saturday
    },
    status: {
        type: String,
        enum: ['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'],
        default: 'SCHEDULED'
    },
    visibility: {
        type: String,
        enum: ['PRIVATE', 'PUBLIC'],
        default: 'PRIVATE'
    }
}, {
    timestamps: true
});

// Indexes
calendarEventSchema.index({ user: 1, startDate: 1, endDate: 1 });
calendarEventSchema.index({ user: 1, eventType: 1 });
calendarEventSchema.index({ duty: 1 });
calendarEventSchema.index({ startDate: 1, endDate: 1 });

// Method to detect conflicts with other events
calendarEventSchema.methods.detectConflicts = async function() {
    const CalendarEvent = mongoose.model('CalendarEvent');

    // Find overlapping events
    const overlappingEvents = await CalendarEvent.find({
        user: this.user,
        _id: { $ne: this._id },
        status: { $ne: 'CANCELLED' },
        $or: [
            {
                startDate: { $lte: this.endDate },
                endDate: { $gte: this.startDate }
            }
        ]
    });

    this.conflicts = [];

    for (const event of overlappingEvents) {
        // Check for time overlap
        const hasTimeOverlap = this._checkTimeOverlap(event);

        if (hasTimeOverlap) {
            this.conflicts.push({
                eventId: event._id,
                conflictType: 'OVERLAP',
                severity: 'HIGH',
                message: `This shift conflicts with ${event.title} on ${event.startDate.toLocaleDateString()}`,
                detectedAt: new Date()
            });
        }
    }

    await this.save();
    return this.conflicts;
};

// Helper method to check time overlap
calendarEventSchema.methods._checkTimeOverlap = function(otherEvent) {
    // If either event is all-day, check date overlap only
    if (this.allDay || otherEvent.allDay) {
        return this.startDate <= otherEvent.endDate && this.endDate >= otherEvent.startDate;
    }

    // Check if events are on the same day
    const sameDay = this.startDate.toDateString() === otherEvent.startDate.toDateString();
    if (!sameDay) return false;

    // Check time overlap
    if (this.startTime && this.endTime && otherEvent.startTime && otherEvent.endTime) {
        const thisStart = this.startTime.replace(':', '');
        const thisEnd = this.endTime.replace(':', '');
        const otherStart = otherEvent.startTime.replace(':', '');
        const otherEnd = otherEvent.endTime.replace(':', '');

        return thisStart < otherEnd && thisEnd > otherStart;
    }

    return true; // If no time info, assume conflict
};

// Method to check weekly hours
calendarEventSchema.methods.checkWeeklyHours = async function() {
    const CalendarEvent = mongoose.model('CalendarEvent');

    // Get start of week
    const startOfWeek = new Date(this.startDate);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    // Get end of week
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    // Find all shifts this week
    const weekShifts = await CalendarEvent.find({
        user: this.user,
        eventType: { $in: ['SHIFT_ACCEPTED', 'SHIFT_PENDING'] },
        startDate: { $gte: startOfWeek, $lt: endOfWeek },
        status: { $ne: 'CANCELLED' }
    });

    // Calculate total hours
    let totalHours = 0;
    for (const shift of weekShifts) {
        if (shift.startTime && shift.endTime) {
            const start = shift.startTime.split(':');
            const end = shift.endTime.split(':');
            const startMinutes = parseInt(start[0]) * 60 + parseInt(start[1]);
            const endMinutes = parseInt(end[0]) * 60 + parseInt(end[1]);
            const hours = (endMinutes - startMinutes) / 60;
            totalHours += hours;
        }
    }

    // Check if exceeds 60 hours
    if (totalHours >= 60) {
        if (!this.warnings) this.warnings = [];
        this.warnings.push({
            type: 'WEEKLY_HOURS_EXCEEDED',
            message: `You've worked ${Math.round(totalHours)} hours this week - Rest recommended`,
            severity: 'WARNING'
        });
    }

    return totalHours;
};

// Static method to sync with external calendar
calendarEventSchema.statics.syncWithExternalCalendar = async function(userId, provider, events) {
    // This would integrate with Google Calendar API, etc.
    // For now, just create placeholder events

    const createdEvents = [];

    for (const externalEvent of events) {
        const event = new this({
            user: userId,
            title: externalEvent.title || 'Personal Event',
            description: externalEvent.description,
            eventType: 'PERSONAL_EVENT',
            startDate: new Date(externalEvent.start),
            endDate: new Date(externalEvent.end),
            allDay: externalEvent.allDay || false,
            externalCalendar: {
                provider,
                externalEventId: externalEvent.id,
                syncStatus: 'SYNCED',
                lastSynced: new Date()
            }
        });

        await event.save();
        createdEvents.push(event);
    }

    return createdEvents;
};

const CalendarEvent = mongoose.model('CalendarEvent', calendarEventSchema);

module.exports = CalendarEvent;
