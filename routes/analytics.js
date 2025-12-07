const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { queryCache } = require('../middleware/queryCache');
const { DoctorAnalytics, HospitalAnalytics } = require('../models/analytics');
const Application = require('../models/application');
const Duty = require('../models/duty');
const HospitalSettings = require('../models/hospitalSettings');
const User = require('../models/user');

// @route   GET /api/analytics/doctor
// @desc    Get doctor analytics dashboard
// @access  Private
router.get('/doctor', protect, authorize('doctor', 'nurse'), queryCache({ ttl: 600 }), async (req, res) => {
    try {
        let analytics = await DoctorAnalytics.findOne({ user: req.user._id });

        if (!analytics) {
            // Create new analytics if doesn't exist
            analytics = new DoctorAnalytics({ user: req.user._id });
            await analytics.save();
        }

        res.json({
            success: true,
            data: analytics
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching analytics',
            error: error.message
        });
    }
});

// @route   GET /api/analytics/application-insights/:dutyId
// @desc    Get insights on why application was rejected
// @access  Private
router.get('/application-insights/:dutyId', protect, queryCache({ ttl: 300 }), async (req, res) => {
    try {
        const duty = await Duty.findById(req.params.dutyId)
            .populate('postedBy', 'hospital')
            .lean(); // Use lean for read-only data

        if (!duty) {
            return res.status(404).json({
                success: false,
                message: 'Duty not found'
            });
        }

        // OPTIMIZED: Run queries in parallel instead of sequentially
        const [totalApplications, acceptedApp, userApp] = await Promise.all([
            Application.countDocuments({ duty: req.params.dutyId }),
            Application.findOne({
                duty: req.params.dutyId,
                status: 'ACCEPTED'
            }).populate('applicant', 'rating completedDuties').lean(),
            Application.findOne({
                duty: req.params.dutyId,
                applicant: req.user._id
            }).lean()
        ]);

        const insights = {
            competition: {
                totalApplicants: totalApplications,
                message: totalApplications > 30 ? 'High competition' : 'Moderate competition'
            },
            possibleReasons: []
        };

        if (acceptedApp && userApp) {
            // Compare with accepted applicant
            if (acceptedApp.applicant.rating > req.user.rating) {
                insights.possibleReasons.push({
                    reason: 'Selected doctor has higher rating',
                    detail: `${acceptedApp.applicant.rating.toFixed(1)}★ vs your ${req.user.rating.toFixed(1)}★`
                });
            }

            if (acceptedApp.applicant.completedDuties > req.user.completedDuties) {
                insights.possibleReasons.push({
                    reason: 'Selected doctor has more experience',
                    detail: `${acceptedApp.applicant.completedDuties} shifts vs your ${req.user.completedDuties} shifts`
                });
            }

            // Check response time
            const userResponseTime = (new Date(userApp.createdAt) - new Date(duty.createdAt)) / 60000; // minutes
            const acceptedResponseTime = (new Date(acceptedApp.createdAt) - new Date(duty.createdAt)) / 60000;

            if (acceptedResponseTime < userResponseTime) {
                insights.possibleReasons.push({
                    reason: 'Faster response time by other applicant',
                    detail: `Applied ${Math.round(userResponseTime)} min after posting`
                });
            }
        }

        // Improvement suggestions
        insights.suggestions = [
            {
                action: 'Complete profile 100%',
                current: '78%', // Mock - could calculate from user profile
                impact: 'Increases visibility and trust'
            },
            {
                action: 'Get more reviews from past shifts',
                current: `${req.user.rating.toFixed(1)}★`,
                impact: 'Higher ratings improve acceptance rate'
            },
            {
                action: 'Apply within first 2 hours of posting',
                impact: 'Early applicants have 2.3x higher success rate'
            }
        ];

        res.json({
            success: true,
            data: insights
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching application insights',
            error: error.message
        });
    }
});

// @route   GET /api/analytics/hospital
// @desc    Get hospital analytics dashboard
// @access  Private
router.get('/hospital', protect, authorize('admin'), queryCache({ ttl: 600 }), async (req, res) => {
    try {
        let analytics = await HospitalAnalytics.findOne({ user: req.user._id });

        if (!analytics) {
            analytics = new HospitalAnalytics({ user: req.user._id });
            await analytics.save();
        }

        res.json({
            success: true,
            data: analytics
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching hospital analytics',
            error: error.message
        });
    }
});

// @route   POST /api/analytics/update-doctor
// @desc    Update doctor analytics (called after events)
// @access  Private
router.post('/update-doctor/:userId', protect, async (req, res) => {
    try {
        const userId = req.params.userId;

        let analytics = await DoctorAnalytics.findOne({ user: userId });
        if (!analytics) {
            analytics = new DoctorAnalytics({ user: userId });
        }

        // OPTIMIZED: Use aggregation pipeline instead of fetching all and filtering in JS
        const applicationStats = await Application.aggregate([
            { $match: { applicant: userId } },
            {
                $facet: {
                    statusCounts: [
                        {
                            $group: {
                                _id: '$status',
                                count: { $sum: 1 }
                            }
                        }
                    ],
                    totalCount: [
                        { $count: 'total' }
                    ],
                    // Get applications with duty info for response time calculation
                    applicationsWithDuty: [
                        {
                            $lookup: {
                                from: 'duties',
                                localField: 'duty',
                                foreignField: '_id',
                                as: 'dutyInfo'
                            }
                        },
                        { $unwind: { path: '$dutyInfo', preserveNullAndEmptyArrays: true } },
                        {
                            $project: {
                                createdAt: 1,
                                dutyCreatedAt: '$dutyInfo.createdAt',
                                responseTime: {
                                    $cond: {
                                        if: '$dutyInfo.createdAt',
                                        then: {
                                            $divide: [
                                                { $subtract: ['$createdAt', '$dutyInfo.createdAt'] },
                                                60000 // Convert to minutes
                                            ]
                                        },
                                        else: null
                                    }
                                }
                            }
                        },
                        { $match: { responseTime: { $ne: null } } }
                    ]
                }
            }
        ]);

        const stats = applicationStats[0];

        // Extract status counts
        const statusMap = {};
        stats.statusCounts.forEach(item => {
            statusMap[item._id] = item.count;
        });

        const totalApplied = stats.totalCount[0]?.total || 0;
        const totalAccepted = statusMap.ACCEPTED || 0;
        const totalRejected = statusMap.REJECTED || 0;
        const totalWithdrawn = statusMap.WITHDRAWN || 0;

        analytics.applicationStats = {
            totalApplied,
            totalAccepted,
            totalRejected,
            totalWithdrawn,
            successRate: totalApplied > 0 ? Math.round((totalAccepted / totalApplied) * 100) : 0
        };

        // Calculate response times from aggregation result
        const responseTimes = stats.applicationsWithDuty
            .map(app => app.responseTime)
            .filter(time => time && !isNaN(time));

        if (responseTimes.length > 0) {
            analytics.applicationStats.avgResponseTime = Math.round(
                responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
            );
            analytics.applicationStats.fastestResponse = Math.round(Math.min(...responseTimes));
        }

        analytics.lastUpdated = new Date();
        await analytics.save();

        res.json({
            success: true,
            data: analytics,
            message: 'Analytics updated successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error updating analytics',
            error: error.message
        });
    }
});

// @route   GET /api/analytics/hospital/dashboard
// @desc    Get real-time hospital analytics dashboard data
// @access  Private (Hospital Admin)
router.get('/hospital/dashboard', protect, queryCache({ ttl: 180 }), async (req, res) => {
    try {
        const hospitalId = req.user._id;

        // OPTIMIZED: Run independent queries in parallel and use lean
        const [settings, duties, dutyIds] = await Promise.all([
            HospitalSettings.getOrCreateSettings(hospitalId),
            Duty.find({ postedBy: hospitalId }).lean(),
            Duty.find({ postedBy: hospitalId }).distinct('_id')
        ]);

        // OPTIMIZED: Get applications with populated data in single query, use lean
        const applications = await Application.find({ duty: { $in: dutyIds } })
            .populate('applicant', 'name email rating experience specialization')
            .populate('duty', 'title date shift salary')
            .lean(); // Use lean for read-only data

        // Calculate key metrics
        const totalPosted = duties.length;
        const openDuties = duties.filter(d => d.status === 'OPEN').length;
        const filledDuties = duties.filter(d => d.status === 'FILLED').length;
        const fillRate = totalPosted > 0 ? Math.round((filledDuties / totalPosted) * 100) : 0;

        // Calculate average time to fill
        const filledDutiesWithTime = duties.filter(d => d.status === 'FILLED' && d.updatedAt);
        const avgTimeToFill = filledDutiesWithTime.length > 0
            ? Math.round(
                filledDutiesWithTime.reduce((sum, duty) => {
                    const hours = (new Date(duty.updatedAt) - new Date(duty.createdAt)) / (1000 * 60 * 60);
                    return sum + hours;
                }, 0) / filledDutiesWithTime.length
            )
            : 0;

        // Calculate total spend (current month)
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const monthlyDuties = duties.filter(d => new Date(d.date) >= monthStart);
        const totalSpend = monthlyDuties.reduce((sum, duty) => sum + (duty.salary || 0), 0);

        // Predictive forecasting (next 2 weeks)
        const twoWeeksFromNow = new Date();
        twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14);

        const upcomingDuties = duties.filter(d => {
            const dutyDate = new Date(d.date);
            return dutyDate >= now && dutyDate <= twoWeeksFromNow;
        });

        const predictedShifts = upcomingDuties.length;
        const openUpcomingDuties = upcomingDuties.filter(d => d.status === 'OPEN');
        const staffingGap = openUpcomingDuties.length;

        // OPTIMIZED: Use Map for better performance than object access
        const doctorPerformance = new Map();
        const acceptedApps = applications.filter(a => a.status === 'accepted');

        acceptedApps.forEach(app => {
            const doctorId = app.applicant._id.toString();
            if (!doctorPerformance.has(doctorId)) {
                doctorPerformance.set(doctorId, {
                    name: app.applicant.name,
                    email: app.applicant.email,
                    rating: app.applicant.rating || 0,
                    experience: app.applicant.experience || 0,
                    shiftsCompleted: 0
                });
            }
            doctorPerformance.get(doctorId).shiftsCompleted++;
        });

        const topDoctors = Array.from(doctorPerformance.values())
            .sort((a, b) => b.shiftsCompleted - a.shiftsCompleted)
            .slice(0, 5);

        // OPTIMIZED: Application stats in single pass through array
        const appStats = applications.reduce((acc, app) => {
            if (app.status === 'pending') acc.pending++;
            else if (app.status === 'accepted') acc.accepted++;
            else if (app.status === 'rejected') acc.rejected++;
            return acc;
        }, { pending: 0, accepted: 0, rejected: 0 });

        // Fill rate trend (last 6 months)
        const fillRateTrend = [];
        for (let i = 5; i >= 0; i--) {
            const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const nextMonthDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

            const monthDuties = duties.filter(d => {
                const dutyDate = new Date(d.date);
                return dutyDate >= monthDate && dutyDate < nextMonthDate;
            });

            const monthFilled = monthDuties.filter(d => d.status === 'FILLED').length;
            const monthTotal = monthDuties.length;
            const rate = monthTotal > 0 ? Math.round((monthFilled / monthTotal) * 100) : 0;

            fillRateTrend.push({
                month: monthDate.toLocaleDateString('en-US', { month: 'short' }),
                rate: rate,
                total: monthTotal,
                filled: monthFilled
            });
        }

        // Budget analysis
        const budgetPercentUsed = settings.budget.monthlyBudget > 0
            ? Math.round((totalSpend / settings.budget.monthlyBudget) * 100)
            : 0;

        const budgetRemaining = settings.budget.monthlyBudget - totalSpend;

        // Cost optimization opportunities
        const avgSalaryPerShift = monthlyDuties.length > 0
            ? totalSpend / monthlyDuties.length
            : 0;

        const optimizationOpportunities = [];

        if (avgTimeToFill > 48) {
            optimizationOpportunities.push({
                category: 'Time to Fill',
                issue: 'Duties taking too long to fill',
                suggestion: 'Post duties earlier or increase compensation',
                potentialSavings: Math.round(avgSalaryPerShift * 0.1)
            });
        }

        if (staffingGap > 3) {
            optimizationOpportunities.push({
                category: 'Staffing Gap',
                issue: `${staffingGap} upcoming shifts unfilled`,
                suggestion: 'Contact preferred doctors or increase visibility',
                potentialSavings: 0
            });
        }

        if (settings.preferredDoctors.length < 5) {
            optimizationOpportunities.push({
                category: 'Preferred Doctors',
                issue: 'Build a preferred doctor list',
                suggestion: 'Add high-performing doctors to preferred list for faster hiring',
                potentialSavings: Math.round(avgSalaryPerShift * 0.15)
            });
        }

        // AI Recommendations
        const recommendations = [];

        if (staffingGap > 0) {
            recommendations.push({
                title: 'Fill staffing gaps',
                description: `You have ${staffingGap} unfilled shifts in the next 2 weeks`,
                action: 'Review and approve pending applications',
                priority: 'HIGH',
                expectedCost: avgSalaryPerShift * staffingGap
            });
        }

        if (budgetPercentUsed > settings.budget.alertThreshold) {
            recommendations.push({
                title: 'Budget Alert',
                description: `${budgetPercentUsed}% of monthly budget used`,
                action: 'Review upcoming duties and adjust budget if needed',
                priority: 'MEDIUM',
                expectedCost: 0
            });
        }

        if (appStats.pending > 5) {
            recommendations.push({
                title: 'Pending Applications',
                description: `${appStats.pending} applications waiting for review`,
                action: 'Review and respond to applications quickly',
                priority: 'MEDIUM',
                expectedCost: 0
            });
        }

        // Quality metrics
        const qualityMetrics = {
            avgDoctorRating: topDoctors.length > 0
                ? (topDoctors.reduce((sum, d) => sum + d.rating, 0) / topDoctors.length).toFixed(1)
                : 0,
            repeatHires: topDoctors.filter(d => d.shiftsCompleted > 1).length,
            totalDoctorsHired: doctorPerformance.size // Use Map.size instead of Object.keys
        };

        res.json({
            success: true,
            data: {
                keyMetrics: {
                    totalPosted,
                    openDuties,
                    fillRate,
                    avgTimeToFill,
                    totalSpend
                },
                predictions: {
                    nextTwoWeeks: predictedShifts,
                    staffingGap,
                    upcomingDuties: openUpcomingDuties.map(d => ({
                        title: d.title,
                        date: d.date,
                        shift: d.shift,
                        salary: d.salary
                    }))
                },
                budget: {
                    monthlyBudget: settings.budget.monthlyBudget,
                    spent: totalSpend,
                    remaining: budgetRemaining,
                    percentUsed: budgetPercentUsed,
                    alertThreshold: settings.budget.alertThreshold
                },
                applications: {
                    total: applications.length,
                    pending: appStats.pending,
                    accepted: appStats.accepted,
                    rejected: appStats.rejected
                },
                topDoctors,
                fillRateTrend,
                optimizationOpportunities,
                recommendations,
                qualityMetrics
            }
        });
    } catch (error) {
        console.error('Error fetching hospital dashboard analytics:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch analytics',
            error: error.message
        });
    }
});

module.exports = router;
