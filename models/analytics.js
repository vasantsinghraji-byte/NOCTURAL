const mongoose = require('mongoose');

// Analytics for doctors/nurses
const doctorAnalyticsSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    // Application Statistics
    applicationStats: {
        totalApplied: { type: Number, default: 0 },
        totalAccepted: { type: Number, default: 0 },
        totalRejected: { type: Number, default: 0 },
        totalWithdrawn: { type: Number, default: 0 },
        successRate: { type: Number, default: 0 }, // percentage
        avgResponseTime: { type: Number, default: 0 }, // in minutes
        fastestResponse: { type: Number, default: 0 },
        avgApplicationsPerWeek: { type: Number, default: 0 }
    },
    // Performance by category
    performanceBySpecialty: {
        type: Map,
        of: {
            applied: Number,
            accepted: Number,
            successRate: Number
        }
    },
    performanceByShiftType: {
        day: { applied: Number, accepted: Number, successRate: Number },
        night: { applied: Number, accepted: Number, successRate: Number },
        weekend: { applied: Number, accepted: Number, successRate: Number },
        emergency: { applied: Number, accepted: Number, successRate: Number }
    },
    performanceByHospital: {
        type: Map,
        of: {
            applied: Number,
            accepted: Number,
            successRate: Number,
            avgRating: Number,
            totalEarned: Number
        }
    },
    // Shift completion statistics
    shiftStats: {
        totalCompleted: { type: Number, default: 0 },
        totalCancelled: { type: Number, default: 0 },
        completionRate: { type: Number, default: 100 },
        totalHoursWorked: { type: Number, default: 0 },
        avgHoursPerShift: { type: Number, default: 0 },
        punctualityScore: { type: Number, default: 100 },
        lateArrivals: { type: Number, default: 0 }
    },
    // Earnings analytics
    earningsAnalytics: {
        totalEarnings: { type: Number, default: 0 },
        thisMonthEarnings: { type: Number, default: 0 },
        lastMonthEarnings: { type: Number, default: 0 },
        avgHourlyRate: { type: Number, default: 0 },
        highestHourlyRate: { type: Number, default: 0 },
        totalBonuses: { type: Number, default: 0 },
        monthlyGoal: { type: Number, default: 0 },
        goalProgress: { type: Number, default: 0 }
    },
    // Rankings
    rankings: {
        overallRank: { type: Number, default: 0 },
        specialtyRank: { type: Number, default: 0 },
        locationRank: { type: Number, default: 0 },
        percentile: { type: Number, default: 0 } // Top X%
    },
    // Badges and achievements
    badges: [{
        type: String,
        earnedAt: Date
    }],
    // Trends (month-over-month)
    trends: {
        shiftsChange: { type: Number, default: 0 }, // percentage
        earningsChange: { type: Number, default: 0 },
        successRateChange: { type: Number, default: 0 },
        ratingChange: { type: Number, default: 0 }
    },
    // Best performance metrics
    bestPerformance: {
        mostShiftsInMonth: { count: Number, month: String, year: Number },
        highestEarningsMonth: { amount: Number, month: String, year: Number },
        longestStreak: { days: Number, startDate: Date, endDate: Date }
    },
    // Comparison with network
    networkComparison: {
        avgNetworkEarnings: { type: Number, default: 0 },
        avgNetworkShifts: { type: Number, default: 0 },
        avgNetworkSuccessRate: { type: Number, default: 0 },
        performanceVsNetwork: { type: String, default: 'average' } // 'below', 'average', 'above'
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Hospital/Admin analytics
const hospitalAnalyticsSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    // Duty posting analytics
    dutyStats: {
        totalPosted: { type: Number, default: 0 },
        totalFilled: { type: Number, default: 0 },
        totalCancelled: { type: Number, default: 0 },
        totalOpen: { type: Number, default: 0 },
        fillRate: { type: Number, default: 0 }, // percentage
        avgTimeToFill: { type: Number, default: 0 }, // in hours
        avgApplicationsPerDuty: { type: Number, default: 0 }
    },
    // Applicant analytics
    applicantStats: {
        totalApplicationsReceived: { type: Number, default: 0 },
        totalAccepted: { type: Number, default: 0 },
        totalRejected: { type: Number, default: 0 },
        acceptanceRate: { type: Number, default: 0 },
        avgDoctorRating: { type: Number, default: 0 },
        repeatDoctors: { type: Number, default: 0 }
    },
    // Financial analytics
    financialStats: {
        totalBudget: { type: Number, default: 0 },
        totalSpent: { type: Number, default: 0 },
        remainingBudget: { type: Number, default: 0 },
        avgCostPerShift: { type: Number, default: 0 },
        totalPaid: { type: Number, default: 0 },
        totalPending: { type: Number, default: 0 },
        avgPaymentDelay: { type: Number, default: 0 }, // in days
        onTimePaymentRate: { type: Number, default: 100 }
    },
    // Performance by shift type
    performanceByShiftType: {
        type: Map,
        of: {
            posted: Number,
            filled: Number,
            fillRate: Number,
            avgCost: Number,
            avgTimeToFill: Number
        }
    },
    // Staff utilization
    staffUtilization: {
        totalDoctorsWorked: { type: Number, default: 0 },
        activeDoctors: { type: Number, default: 0 },
        inactiveDoctors: { type: Number, default: 0 },
        avgShiftsPerDoctor: { type: Number, default: 0 },
        topPerformers: [{
            doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            shiftsCompleted: Number,
            rating: Number
        }]
    },
    // Forecasting
    predictions: {
        nextMonthDemand: { type: Number, default: 0 },
        estimatedCost: { type: Number, default: 0 },
        staffingGap: { type: Number, default: 0 },
        highDemandPeriods: [{
            startDate: Date,
            endDate: Date,
            estimatedShifts: Number
        }]
    },
    // Quality metrics
    qualityMetrics: {
        avgDoctorRating: { type: Number, default: 0 },
        noShowRate: { type: Number, default: 0 },
        lateArrivalRate: { type: Number, default: 0 },
        complaintRate: { type: Number, default: 0 },
        rehireRate: { type: Number, default: 0 }
    },
    // Comparisons
    industryBenchmarks: {
        avgFillRate: { type: Number, default: 79 },
        avgCostPerShift: { type: Number, default: 45000 },
        avgTimeToFill: { type: Number, default: 8.5 }
    },
    // Trends
    trends: {
        fillRateChange: { type: Number, default: 0 },
        costChange: { type: Number, default: 0 },
        demandChange: { type: Number, default: 0 }
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Indexes for doctor analytics
// Note: user field index created automatically by unique: true in schema (line 9)
doctorAnalyticsSchema.index({ 'rankings.overallRank': 1, 'earningsAnalytics.totalEarnings': -1 }); // Leaderboard queries
doctorAnalyticsSchema.index({ 'earningsAnalytics.totalEarnings': -1 });
doctorAnalyticsSchema.index({ 'applicationStats.successRate': -1 }); // Top performers
doctorAnalyticsSchema.index({ lastUpdated: 1 }); // Stale data cleanup

// Indexes for hospital analytics
// Note: user field index created automatically by unique: true in schema (line 114)
hospitalAnalyticsSchema.index({ 'dutyStats.fillRate': -1 });
hospitalAnalyticsSchema.index({ 'financialStats.totalSpent': -1 }); // Financial reports
hospitalAnalyticsSchema.index({ lastUpdated: 1 }); // Stale data cleanup

const DoctorAnalytics = mongoose.model('DoctorAnalytics', doctorAnalyticsSchema);
const HospitalAnalytics = mongoose.model('HospitalAnalytics', hospitalAnalyticsSchema);

module.exports = { DoctorAnalytics, HospitalAnalytics };
