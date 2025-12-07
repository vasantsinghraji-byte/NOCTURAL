const mongoose = require('mongoose');

const availabilitySchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['RECURRING', 'VACATION', 'BLACKOUT', 'PREFERRED_HOURS', 'MAX_SHIFTS'],
        required: true
    },
    // For RECURRING type
    recurring: {
        dayOfWeek: {
            type: [Number], // 0-6 (Sunday-Saturday)
            validate: {
                validator: function(v) {
                    return v.every(day => day >= 0 && day <= 6);
                },
                message: 'Day of week must be between 0 and 6'
            }
        },
        startTime: String, // HH:mm format
        endTime: String,   // HH:mm format
        unavailable: Boolean // true = can't work, false = prefer to work
    },
    // For VACATION/BLACKOUT type
    dateRange: {
        startDate: Date,
        endDate: Date,
        reason: String
    },
    // For PREFERRED_HOURS type
    preferredHours: {
        earliestStart: String, // HH:mm format (e.g., "09:00")
        latestEnd: String,     // HH:mm format (e.g., "17:00")
        flexible: Boolean      // Can work outside these hours if needed
    },
    // For MAX_SHIFTS type
    maxShifts: {
        perWeek: Number,
        perMonth: Number,
        maxHoursPerWeek: Number,
        maxHoursPerMonth: Number
    },
    active: {
        type: Boolean,
        default: true
    },
    autoRejectNonMatching: {
        type: Boolean,
        default: false // Auto-reject duties that don't match availability
    }
}, {
    timestamps: true
});

// Index for efficient queries
availabilitySchema.index({ user: 1, active: 1 });
availabilitySchema.index({ 'dateRange.startDate': 1, 'dateRange.endDate': 1 });

// Helper method to check if a duty conflicts with availability
availabilitySchema.methods.conflictsWith = function(dutyDate, dutyStartTime, dutyEndTime) {
    if (!this.active) return false;

    const date = new Date(dutyDate);

    // Check vacation/blackout dates
    if (this.type === 'VACATION' || this.type === 'BLACKOUT') {
        if (this.dateRange && this.dateRange.startDate && this.dateRange.endDate) {
            return date >= this.dateRange.startDate && date <= this.dateRange.endDate;
        }
    }

    // Check recurring unavailability
    if (this.type === 'RECURRING' && this.recurring && this.recurring.unavailable) {
        const dayOfWeek = date.getDay();
        if (this.recurring.dayOfWeek && this.recurring.dayOfWeek.includes(dayOfWeek)) {
            return true; // Conflicts with recurring unavailability
        }
    }

    // Check preferred hours
    if (this.type === 'PREFERRED_HOURS' && this.preferredHours && !this.preferredHours.flexible) {
        const dutyStart = dutyStartTime.replace(':', '');
        const dutyEnd = dutyEndTime.replace(':', '');
        const prefStart = this.preferredHours.earliestStart.replace(':', '');
        const prefEnd = this.preferredHours.latestEnd.replace(':', '');

        if (dutyStart < prefStart || dutyEnd > prefEnd) {
            return true; // Outside preferred hours
        }
    }

    return false;
};

const Availability = mongoose.model('Availability', availabilitySchema);

module.exports = Availability;
