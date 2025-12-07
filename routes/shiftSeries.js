const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const ShiftSeries = require('../models/shiftSeries');
const { paginate, paginationMiddleware, sendPaginatedResponse } = require('../utils/pagination');

// Apply pagination middleware
router.use(paginationMiddleware);

// @route   GET /api/shift-series
// @desc    Get available shift series with pagination
// @access  Private
router.get('/', protect, authorize('doctor', 'nurse'), async (req, res) => {
    try {
        const { specialty, status = 'OPEN' } = req.query;

        const query = { status };

        if (specialty) {
            query.specialty = specialty;
        }

        const result = await paginate(
            ShiftSeries,
            query,
            {
                ...req.pagination,
                sort: req.pagination.sort || { createdAt: -1 },
                populate: 'postedBy:name hospital'
            }
        );

        sendPaginatedResponse(res, result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching shift series',
            error: error.message
        });
    }
});

// @route   GET /api/shift-series/:id
// @desc    Get shift series details
// @access  Private
router.get('/:id', protect, async (req, res) => {
    try {
        const series = await ShiftSeries.findById(req.params.id)
            .populate('postedBy', 'name hospital email phone')
            .populate('applicants.user', 'name rating specialty completedDuties');

        if (!series) {
            return res.status(404).json({
                success: false,
                message: 'Shift series not found'
            });
        }

        res.json({
            success: true,
            data: series
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching shift series',
            error: error.message
        });
    }
});

// @route   POST /api/shift-series
// @desc    Create shift series (Admin only)
// @access  Private
router.post('/', protect, authorize('admin'), async (req, res) => {
    try {
        const seriesData = {
            ...req.body,
            postedBy: req.user._id
        };

        const series = new ShiftSeries(seriesData);
        await series.save();

        res.status(201).json({
            success: true,
            data: series,
            message: 'Shift series created successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Error creating shift series',
            error: error.message
        });
    }
});

// @route   POST /api/shift-series/:id/apply
// @desc    Apply for shift series
// @access  Private
router.post('/:id/apply', protect, authorize('doctor', 'nurse'), async (req, res) => {
    try {
        const { appliedFor, selectedShifts, coverLetter } = req.body;

        const series = await ShiftSeries.findById(req.params.id);
        if (!series) {
            return res.status(404).json({
                success: false,
                message: 'Shift series not found'
            });
        }

        if (series.status === 'FILLED' || series.status === 'CANCELLED') {
            return res.status(400).json({
                success: false,
                message: `This series is ${series.status.toLowerCase()}`
            });
        }

        if (appliedFor === 'PARTIAL' && !series.acceptPartialSeries) {
            return res.status(400).json({
                success: false,
                message: 'This series does not accept partial applications'
            });
        }

        await series.applyForSeries(req.user._id, appliedFor, selectedShifts, coverLetter);

        res.json({
            success: true,
            data: series,
            message: 'Application submitted successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message || 'Error applying for shift series'
        });
    }
});

// @route   PUT /api/shift-series/:id/applications/:appId
// @desc    Accept/reject series application (Admin only)
// @access  Private
router.put('/:id/applications/:appId', protect, authorize('admin'), async (req, res) => {
    try {
        const { status } = req.body;

        const series = await ShiftSeries.findById(req.params.id);
        if (!series) {
            return res.status(404).json({
                success: false,
                message: 'Shift series not found'
            });
        }

        if (status === 'ACCEPTED') {
            await series.acceptApplication(req.params.appId);
        } else if (status === 'REJECTED') {
            const application = series.applicants.id(req.params.appId);
            if (application) {
                application.status = 'REJECTED';
                await series.save();
            }
        }

        res.json({
            success: true,
            data: series,
            message: `Application ${status.toLowerCase()} successfully`
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message || 'Error updating application'
        });
    }
});

// @route   POST /api/shift-series/:id/create-duties
// @desc    Create individual duties from series (Admin only)
// @access  Private
router.post('/:id/create-duties', protect, authorize('admin'), async (req, res) => {
    try {
        const duties = await ShiftSeries.createDutiesFromSeries(req.params.id);

        res.json({
            success: true,
            data: duties,
            message: `${duties.length} duties created from series successfully`
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message || 'Error creating duties from series'
        });
    }
});

// @route   GET /api/shift-series/my/posted
// @desc    Get shift series posted by current admin with pagination
// @access  Private
router.get('/my/posted', protect, authorize('admin'), async (req, res) => {
    try {
        const result = await paginate(
            ShiftSeries,
            { postedBy: req.user._id },
            {
                ...req.pagination,
                sort: req.pagination.sort || { createdAt: -1 }
            }
        );

        sendPaginatedResponse(res, result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching posted shift series',
            error: error.message
        });
    }
});

module.exports = router;
