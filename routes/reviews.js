const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const Review = require('../models/review');
const { paginate, paginationMiddleware, sendPaginatedResponse } = require('../utils/pagination');

// Apply pagination middleware
router.use(paginationMiddleware);

// @route   GET /api/reviews/user/:userId
// @desc    Get reviews for a specific user with pagination
// @access  Public
router.get('/user/:userId', async (req, res) => {
    try {
        const result = await paginate(
            Review,
            {
                reviewedUser: req.params.userId,
                visibility: { $in: ['PUBLIC', 'HOSPITAL_ONLY'] }
            },
            {
                ...req.pagination,
                sort: req.pagination.sort || { createdAt: -1 },
                populate: 'reviewer:name hospital duty:title date hospital'
            }
        );

        // Get average ratings
        const avgRatings = await Review.getUserAverageRating(req.params.userId);

        res.json({
            success: true,
            data: result.data,
            summary: avgRatings,
            pagination: result.pagination
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching reviews',
            error: error.message
        });
    }
});

// @route   GET /api/reviews/my-reviews
// @desc    Get reviews for current user with pagination
// @access  Private
router.get('/my-reviews', protect, async (req, res) => {
    try {
        const result = await paginate(
            Review,
            { reviewedUser: req.user._id },
            {
                ...req.pagination,
                sort: req.pagination.sort || { createdAt: -1 },
                populate: 'reviewer:name hospital duty:title date hospital'
            }
        );

        const avgRatings = await Review.getUserAverageRating(req.user._id);

        res.json({
            success: true,
            data: result.data,
            summary: avgRatings,
            pagination: result.pagination
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching reviews',
            error: error.message
        });
    }
});

// @route   POST /api/reviews
// @desc    Create a review (Hospital/Admin only)
// @access  Private
router.post('/', protect, authorize('admin'), async (req, res) => {
    try {
        const reviewData = {
            ...req.body,
            reviewer: req.user._id
        };

        const review = new Review(reviewData);
        await review.save();

        // Update user's overall rating
        const User = require('../models/user');
        const avgRatings = await Review.getUserAverageRating(reviewData.reviewedUser);
        await User.findByIdAndUpdate(reviewData.reviewedUser, {
            rating: avgRatings.avgRating
        });

        res.status(201).json({
            success: true,
            data: review,
            message: 'Review submitted successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Error creating review',
            error: error.message
        });
    }
});

// @route   PUT /api/reviews/:id/respond
// @desc    Respond to a review
// @access  Private
router.put('/:id/respond', protect, async (req, res) => {
    try {
        const { comment } = req.body;

        const review = await Review.findOne({
            _id: req.params.id,
            reviewedUser: req.user._id
        });

        if (!review) {
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }

        review.response = {
            comment,
            respondedAt: new Date()
        };

        await review.save();

        res.json({
            success: true,
            data: review,
            message: 'Response added successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Error responding to review',
            error: error.message
        });
    }
});

// @route   POST /api/reviews/:id/helpful
// @desc    Mark review as helpful
// @access  Private
router.post('/:id/helpful', protect, async (req, res) => {
    try {
        const review = await Review.findById(req.params.id);
        if (!review) {
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }

        // Check if user already marked as helpful
        if (review.helpful.users.includes(req.user._id)) {
            return res.status(400).json({
                success: false,
                message: 'You have already marked this review as helpful'
            });
        }

        review.helpful.users.push(req.user._id);
        review.helpful.count += 1;
        await review.save();

        res.json({
            success: true,
            data: review,
            message: 'Marked as helpful'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Error marking review as helpful',
            error: error.message
        });
    }
});

module.exports = router;
