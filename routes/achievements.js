const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const Achievement = require('../models/achievement');
const { paginate, paginationMiddleware, sendPaginatedResponse } = require('../utils/pagination');

// Apply pagination middleware
router.use(paginationMiddleware);

// @route   GET /api/achievements
// @desc    Get user's achievements with pagination
// @access  Private
router.get('/', protect, async (req, res) => {
    try {
        const result = await paginate(
            Achievement,
            {
                user: req.user._id,
                visible: true
            },
            {
                ...req.pagination,
                sort: req.pagination.sort || { earnedAt: -1 }
            }
        );

        sendPaginatedResponse(res, result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching achievements',
            error: error.message
        });
    }
});

// @route   GET /api/achievements/leaderboard
// @desc    Get leaderboard with pagination
// @access  Private
router.get('/leaderboard', protect, async (req, res) => {
    try {
        const { category = 'shifts', period = 'month' } = req.query;

        const User = require('../models/user');
        const { DoctorAnalytics } = require('../models/analytics');

        let sortField = 'completedDuties';
        if (category === 'earnings') {
            sortField = 'earningsAnalytics.thisMonthEarnings';
        } else if (category === 'rating') {
            sortField = 'rating';
        }

        // Get analytics with pagination
        const result = await paginate(
            DoctorAnalytics,
            {},
            {
                ...req.pagination,
                limit: Math.min(req.pagination.limit, 100), // Max 100 for leaderboard
                sort: { [sortField]: -1 },
                populate: 'user:name specialty location'
            }
        );

        // Find current user's rank
        const userAnalytics = await DoctorAnalytics.findOne({ user: req.user._id });
        const userRank = userAnalytics ? userAnalytics.rankings.overallRank : 0;

        // Transform data
        const leaderboard = result.data.map((analytics, index) => ({
            rank: (result.pagination.page - 1) * result.pagination.limit + index + 1,
            user: analytics.user,
            shifts: analytics.shiftStats.totalCompleted,
            earnings: analytics.earningsAnalytics.thisMonthEarnings,
            rating: analytics.user.rating,
            badges: analytics.badges.length
        }));

        res.json({
            success: true,
            data: {
                leaderboard,
                userRank,
                category,
                period
            },
            pagination: result.pagination
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching leaderboard',
            error: error.message
        });
    }
});

// @route   POST /api/achievements/:id/claim
// @desc    Claim achievement reward
// @access  Private
router.post('/:id/claim', protect, async (req, res) => {
    try {
        const achievement = await Achievement.findOne({
            _id: req.params.id,
            user: req.user._id
        });

        if (!achievement) {
            return res.status(404).json({
                success: false,
                message: 'Achievement not found'
            });
        }

        if (achievement.rewardClaimed) {
            return res.status(400).json({
                success: false,
                message: 'Reward already claimed'
            });
        }

        achievement.rewardClaimed = true;
        achievement.claimedAt = new Date();
        await achievement.save();

        // If bonus reward, could create earning record here

        res.json({
            success: true,
            data: achievement,
            message: 'Reward claimed successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Error claiming reward',
            error: error.message
        });
    }
});

// @route   POST /api/achievements/:id/share
// @desc    Share achievement
// @access  Private
router.post('/:id/share', protect, async (req, res) => {
    try {
        const { platform } = req.body;

        const achievement = await Achievement.findOne({
            _id: req.params.id,
            user: req.user._id
        });

        if (!achievement) {
            return res.status(404).json({
                success: false,
                message: 'Achievement not found'
            });
        }

        // Generate shareable URL if not exists
        if (!achievement.shareableUrl) {
            achievement.generateShareableUrl();
        }

        achievement.sharedOn.push({
            platform,
            sharedAt: new Date()
        });

        await achievement.save();

        res.json({
            success: true,
            data: {
                shareableUrl: achievement.shareableUrl,
                message: `Achievement shared on ${platform}`
            }
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Error sharing achievement',
            error: error.message
        });
    }
});

module.exports = router;
