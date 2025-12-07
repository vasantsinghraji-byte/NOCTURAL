const mongoose = require('mongoose');

const hospitalSettingsSchema = new mongoose.Schema({
    hospital: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },

    // Budget Settings
    budget: {
        monthlyBudget: {
            type: Number,
            default: 0
        },
        currentMonth: {
            type: String, // Format: "2025-01"
            default: function() {
                const now = new Date();
                return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            }
        },
        alertThreshold: {
            type: Number,
            default: 80, // Alert when 80% of budget is used
            min: 0,
            max: 100
        }
    },

    // Forecasting Settings
    forecasting: {
        enabled: {
            type: Boolean,
            default: true
        },
        lookAheadDays: {
            type: Number,
            default: 14, // 2 weeks
            min: 7,
            max: 90
        }
    },

    // Auto-Accept Settings
    autoAccept: {
        enabled: {
            type: Boolean,
            default: false
        },
        minimumRating: {
            type: Number,
            default: 4.5,
            min: 0,
            max: 5
        },
        minimumShiftsCompleted: {
            type: Number,
            default: 5
        }
    },

    // Preferred Doctors
    preferredDoctors: [{
        doctor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        priority: {
            type: String,
            enum: ['HIGH', 'MEDIUM', 'LOW'],
            default: 'MEDIUM'
        },
        addedAt: {
            type: Date,
            default: Date.now
        }
    }],

    // Notification Preferences
    notifications: {
        emailAlerts: {
            type: Boolean,
            default: true
        },
        budgetAlerts: {
            type: Boolean,
            default: true
        },
        staffingGapAlerts: {
            type: Boolean,
            default: true
        },
        newApplicationAlerts: {
            type: Boolean,
            default: true
        }
    },

    // Analytics Preferences
    analytics: {
        defaultDateRange: {
            type: String,
            enum: ['7days', '30days', '90days', 'year'],
            default: '30days'
        },
        showPredictions: {
            type: Boolean,
            default: true
        }
    }
}, {
    timestamps: true
});

// Methods
hospitalSettingsSchema.methods.isBudgetExceeded = function(currentSpend) {
    if (!this.budget.monthlyBudget || this.budget.monthlyBudget === 0) {
        return false;
    }
    return currentSpend >= this.budget.monthlyBudget;
};

hospitalSettingsSchema.methods.shouldSendBudgetAlert = function(currentSpend) {
    if (!this.budget.monthlyBudget || this.budget.monthlyBudget === 0) {
        return false;
    }
    const percentageUsed = (currentSpend / this.budget.monthlyBudget) * 100;
    return percentageUsed >= this.budget.alertThreshold && this.notifications.budgetAlerts;
};

// Static Methods
hospitalSettingsSchema.statics.getOrCreateSettings = async function(hospitalId) {
    let settings = await this.findOne({ hospital: hospitalId });

    if (!settings) {
        settings = await this.create({
            hospital: hospitalId
        });
    }

    return settings;
};

module.exports = mongoose.models.HospitalSettings || mongoose.model('HospitalSettings', hospitalSettingsSchema);
