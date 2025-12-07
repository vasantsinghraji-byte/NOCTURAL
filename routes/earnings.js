const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const Earning = require('../models/earning');
const { DoctorAnalytics } = require('../models/analytics');
const { paginate, paginationMiddleware, sendPaginatedResponse } = require('../utils/pagination');

// Apply pagination middleware
router.use(paginationMiddleware);

// @route   GET /api/earnings
// @desc    Get user's earnings with pagination
// @access  Private
router.get('/', protect, authorize('doctor', 'nurse'), async (req, res) => {
    try {
        const { year, month, status } = req.query;

        const query = { user: req.user._id };

        if (year && month) {
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 0, 23, 59, 59);
            query.shiftDate = { $gte: startDate, $lte: endDate };
        }

        if (status) {
            query.paymentStatus = status;
        }

        const result = await paginate(
            Earning,
            query,
            {
                ...req.pagination,
                sort: req.pagination.sort || { shiftDate: -1 },
                populate: 'duty:title hospital specialty'
            }
        );

        sendPaginatedResponse(res, result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching earnings',
            error: error.message
        });
    }
});

// @route   GET /api/earnings/dashboard
// @desc    Get earnings dashboard summary
// @access  Private
router.get('/dashboard', protect, authorize('doctor', 'nurse'), async (req, res) => {
    try {
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();

        // Get current month earnings
        const currentMonthData = await Earning.getMonthlyEarnings(
            req.user._id,
            currentYear,
            currentMonth
        );

        // Get last month earnings for comparison
        let lastMonth = currentMonth - 1;
        let lastMonthYear = currentYear;
        if (lastMonth === 0) {
            lastMonth = 12;
            lastMonthYear--;
        }

        const lastMonthData = await Earning.getMonthlyEarnings(
            req.user._id,
            lastMonthYear,
            lastMonth
        );

        // Calculate average rate
        const avgRate = currentMonthData.totalHours > 0
            ? Math.round(currentMonthData.totalEarnings / currentMonthData.totalHours)
            : 0;

        // Calculate goal progress
        const monthlyGoal = req.user.monthlyGoal || 300000; // Default 3 lakhs
        const goalProgress = Math.round((currentMonthData.totalEarnings / monthlyGoal) * 100);

        // Calculate change from last month
        const earningsChange = lastMonthData.totalEarnings > 0
            ? Math.round(((currentMonthData.totalEarnings - lastMonthData.totalEarnings) / lastMonthData.totalEarnings) * 100)
            : 0;

        // Get payment timeline (upcoming and overdue)
        const upcomingPayments = await Earning.find({
            user: req.user._id,
            paymentStatus: { $in: ['PENDING', 'PROCESSING'] },
            expectedPaymentDate: { $gte: now }
        }).sort({ expectedPaymentDate: 1 }).limit(5);

        const overduePayments = await Earning.find({
            user: req.user._id,
            paymentStatus: { $in: ['PENDING', 'OVERDUE'] },
            expectedPaymentDate: { $lt: now }
        }).sort({ expectedPaymentDate: 1 });

        res.json({
            success: true,
            data: {
                currentMonth: {
                    totalEarnings: currentMonthData.totalEarnings,
                    netEarnings: currentMonthData.netEarnings,
                    hoursWorked: currentMonthData.totalHours,
                    shiftsCompleted: currentMonthData.totalShifts,
                    avgRate,
                    monthlyGoal,
                    goalProgress
                },
                breakdown: {
                    paid: currentMonthData.paidAmount,
                    pending: currentMonthData.pendingAmount,
                    overdue: currentMonthData.overdueAmount
                },
                comparison: {
                    lastMonth: lastMonthData.totalEarnings,
                    change: earningsChange
                },
                paymentTimeline: {
                    upcoming: upcomingPayments,
                    overdue: overduePayments
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching earnings dashboard',
            error: error.message
        });
    }
});

// @route   POST /api/earnings
// @desc    Create earning record (after shift completion)
// @access  Private (Admin only for now)
router.post('/', protect, authorize('admin'), async (req, res) => {
    try {
        const earning = new Earning(req.body);

        // Generate invoice number
        earning.generateInvoiceNumber();

        await earning.save();

        res.status(201).json({
            success: true,
            data: earning,
            message: 'Earning record created successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Error creating earning record',
            error: error.message
        });
    }
});

// @route   PUT /api/earnings/:id/payment-status
// @desc    Update payment status
// @access  Private (Admin only)
router.put('/:id/payment-status', protect, authorize('admin'), async (req, res) => {
    try {
        const { paymentStatus, paymentMethod, paymentDate } = req.body;

        const earning = await Earning.findById(req.params.id);
        if (!earning) {
            return res.status(404).json({
                success: false,
                message: 'Earning record not found'
            });
        }

        earning.paymentStatus = paymentStatus;
        if (paymentMethod) earning.paymentMethod = paymentMethod;
        if (paymentDate) earning.paymentDate = paymentDate;

        // If marking as overdue, could trigger reminder
        if (paymentStatus === 'OVERDUE') {
            earning.paymentReminders.push({
                sentAt: new Date(),
                method: 'IN_APP'
            });
        }

        await earning.save();

        res.json({
            success: true,
            data: earning,
            message: 'Payment status updated successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Error updating payment status',
            error: error.message
        });
    }
});

// @route   POST /api/earnings/:id/dispute
// @desc    Raise payment dispute
// @access  Private
router.post('/:id/dispute', protect, async (req, res) => {
    try {
        const { reason } = req.body;

        const earning = await Earning.findOne({
            _id: req.params.id,
            user: req.user._id
        });

        if (!earning) {
            return res.status(404).json({
                success: false,
                message: 'Earning record not found'
            });
        }

        earning.paymentStatus = 'DISPUTED';
        earning.disputeReason = reason;

        await earning.save();

        res.json({
            success: true,
            data: earning,
            message: 'Dispute raised successfully. Admin will review shortly.'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Error raising dispute',
            error: error.message
        });
    }
});

// @route   GET /api/earnings/rate-intelligence/:dutyId
// @desc    Get rate intelligence for a duty
// @access  Private
router.get('/rate-intelligence/:dutyId', protect, async (req, res) => {
    try {
        const Duty = require('../models/duty');
        const duty = await Duty.findById(req.params.dutyId);

        if (!duty) {
            return res.status(404).json({
                success: false,
                message: 'Duty not found'
            });
        }

        // Calculate market average for this specialty and location
        const marketAvg = await Earning.aggregate([
            {
                $lookup: {
                    from: 'duties',
                    localField: 'duty',
                    foreignField: '_id',
                    as: 'dutyInfo'
                }
            },
            { $unwind: '$dutyInfo' },
            {
                $match: {
                    'dutyInfo.specialty': duty.specialty,
                    'dutyInfo.location': { $regex: duty.location.split(',')[0], $options: 'i' }
                }
            },
            {
                $group: {
                    _id: null,
                    avgRate: { $avg: '$hourlyRate' },
                    maxRate: { $max: '$hourlyRate' },
                    minRate: { $min: '$hourlyRate' }
                }
            }
        ]);

        // Get average for this specific hospital
        const hospitalAvg = await Earning.aggregate([
            {
                $match: {
                    hospital: duty.hospital
                }
            },
            {
                $group: {
                    _id: null,
                    avgRate: { $avg: '$hourlyRate' },
                    totalPaid: { $sum: '$totalAmount' }
                }
            }
        ]);

        const marketData = marketAvg[0] || { avgRate: duty.hourlyRate, maxRate: duty.hourlyRate };
        const hospitalData = hospitalAvg[0] || { avgRate: duty.hourlyRate };

        // Determine if weekend bonus available
        const dutyDate = new Date(duty.date);
        const isWeekend = dutyDate.getDay() === 0 || dutyDate.getDay() === 6;
        const weekendBonus = isWeekend ? 20 : 0;

        // Calculate suggested negotiation rate
        const suggestedRate = Math.round(marketData.avgRate * 1.05); // 5% above market

        res.json({
            success: true,
            data: {
                dutyRate: duty.hourlyRate,
                marketIntelligence: {
                    averageForSpecialty: Math.round(marketData.avgRate),
                    hospitalUsuallyPays: Math.round(hospitalData.avgRate),
                    weekendBonusAvailable: weekendBonus,
                    comparison: duty.hourlyRate > marketData.avgRate ? 'ABOVE_MARKET' : 'BELOW_MARKET'
                },
                suggestion: {
                    negotiateFor: suggestedRate,
                    successRate: 67, // Mock data - could calculate from historical
                    reasoning: duty.hourlyRate < marketData.avgRate
                        ? 'This rate is below market average. Negotiation recommended.'
                        : 'This rate is competitive. Negotiation possible but less likely to succeed.'
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching rate intelligence',
            error: error.message
        });
    }
});

// @route   GET /api/earnings/optimizer
// @desc    Get earning optimization suggestions
// @access  Private
router.get('/optimizer', protect, authorize('doctor', 'nurse'), async (req, res) => {
    try {
        const Duty = require('../models/duty');

        // Get available duties for this week
        const startOfWeek = new Date();
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 7);

        const availableDuties = await Duty.find({
            date: { $gte: startOfWeek, $lte: endOfWeek },
            status: 'OPEN',
            specialty: req.user.specialty
        }).sort({ hourlyRate: -1 }).limit(5);

        // Calculate current week stats
        const weekEarnings = await Earning.getMonthlyEarnings(
            req.user._id,
            startOfWeek.getFullYear(),
            startOfWeek.getMonth() + 1
        );

        // Calculate potential if accepting suggested duties
        let potentialEarnings = weekEarnings.totalEarnings;
        let additionalHours = 0;

        for (const duty of availableDuties.slice(0, 3)) {
            const start = duty.startTime.split(':');
            const end = duty.endTime.split(':');
            const hours = ((parseInt(end[0]) * 60 + parseInt(end[1])) -
                          (parseInt(start[0]) * 60 + parseInt(start[1]))) / 60;
            potentialEarnings += hours * duty.hourlyRate;
            additionalHours += hours;
        }

        const exceedsLimit = (weekEarnings.totalHours + additionalHours) > 60;

        res.json({
            success: true,
            data: {
                currentWeek: {
                    earnings: weekEarnings.totalEarnings,
                    hours: weekEarnings.totalHours
                },
                suggestions: availableDuties.slice(0, 3),
                potential: {
                    totalEarnings: Math.round(potentialEarnings),
                    additionalHours,
                    networkAverage: 145000, // Mock - could calculate
                    exceedsLimit,
                    warning: exceedsLimit ? 'This exceeds 60-hour recommended limit' : null
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error generating optimization suggestions',
            error: error.message
        });
    }
});

module.exports = router;
