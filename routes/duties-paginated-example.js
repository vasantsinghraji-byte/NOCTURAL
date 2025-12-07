/**
 * Example: Duties Routes with Pagination
 *
 * This file demonstrates how to implement pagination in your routes
 * Copy these patterns to your actual route files
 */

const express = require('express');
const router = express.Router();
const Duty = require('../models/duty');
const {
    paginate,
    paginateWithSearch,
    paginationMiddleware,
    sendPaginatedResponse
} = require('../utils/pagination');

// Apply pagination middleware to parse query params
router.use(paginationMiddleware);

/**
 * GET /api/duties
 * List all duties with pagination
 *
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 * - sort: Sort field(s) (e.g., "-createdAt,title")
 * - select: Fields to return (e.g., "title,date,hospital")
 * - status: Filter by status
 * - specialty: Filter by specialty
 * - search: Search query
 */
router.get('/', async (req, res) => {
    try {
        // Build filter query from request
        const filters = {};

        if (req.query.status) {
            filters.status = req.query.status;
        }

        if (req.query.specialty) {
            filters.specialty = req.query.specialty;
        }

        if (req.query.date) {
            const date = new Date(req.query.date);
            filters.date = {
                $gte: new Date(date.setHours(0, 0, 0, 0)),
                $lte: new Date(date.setHours(23, 59, 59, 999))
            };
        }

        // Use pagination with search if search term provided
        const result = await paginateWithSearch(
            Duty,
            {
                filters,
                search: req.query.search || '',
                searchFields: ['title', 'hospital', 'hospitalName', 'description']
            },
            req.pagination
        );

        sendPaginatedResponse(res, result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch duties',
            message: error.message
        });
    }
});

/**
 * GET /api/duties/my-duties
 * Get duties created by current user (hospital admin)
 */
router.get('/my-duties', async (req, res) => {
    try {
        const result = await paginate(
            Duty,
            { postedBy: req.user._id }, // Assumes auth middleware sets req.user
            {
                ...req.pagination,
                populate: 'assignedDoctors.doctor'
            }
        );

        sendPaginatedResponse(res, result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch duties',
            message: error.message
        });
    }
});

/**
 * GET /api/duties/available
 * Get available duties for doctors to apply
 */
router.get('/available', async (req, res) => {
    try {
        // Build query for available duties
        const query = {
            status: 'OPEN',
            date: { $gte: new Date() }
        };

        // Add specialty filter if provided
        if (req.query.specialty) {
            query.specialty = req.query.specialty;
        }

        // Add location filter if provided
        if (req.query.location) {
            query.location = new RegExp(req.query.location, 'i');
        }

        const result = await paginate(Duty, query, {
            ...req.pagination,
            sort: { date: 1, startTime: 1 } // Upcoming duties first
        });

        sendPaginatedResponse(res, result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch available duties',
            message: error.message
        });
    }
});

/**
 * GET /api/duties/urgent
 * Get urgent duties (smaller page size, different sorting)
 */
router.get('/urgent', async (req, res) => {
    try {
        const result = await paginate(
            Duty,
            {
                status: 'OPEN',
                urgency: { $in: ['URGENT', 'EMERGENCY'] },
                date: { $gte: new Date() }
            },
            {
                page: req.pagination.page,
                limit: Math.min(req.pagination.limit, 50), // Max 50 for urgent
                sort: { urgency: -1, date: 1 },
                select: 'title hospital date startTime endTime hourlyRate urgency'
            }
        );

        sendPaginatedResponse(res, result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch urgent duties',
            message: error.message
        });
    }
});

/**
 * GET /api/duties/:id
 * Get single duty (no pagination needed)
 */
router.get('/:id', async (req, res) => {
    try {
        const duty = await Duty.findById(req.params.id)
            .populate('postedBy', 'name email')
            .populate('assignedDoctors.doctor', 'name email professional.primarySpecialization');

        if (!duty) {
            return res.status(404).json({
                success: false,
                error: 'Duty not found'
            });
        }

        res.json({
            success: true,
            data: duty
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch duty',
            message: error.message
        });
    }
});

module.exports = router;

/**
 * USAGE EXAMPLES:
 *
 * 1. Basic pagination:
 *    GET /api/duties?page=2&limit=10
 *
 * 2. With sorting:
 *    GET /api/duties?sort=-date,title
 *
 * 3. With filters:
 *    GET /api/duties?status=OPEN&specialty=Emergency Medicine
 *
 * 4. With search:
 *    GET /api/duties?search=night shift&page=1&limit=20
 *
 * 5. Select specific fields:
 *    GET /api/duties?select=title,date,hourlyRate&limit=50
 *
 * 6. Combined:
 *    GET /api/duties?status=OPEN&specialty=Emergency Medicine&search=urgent&page=2&limit=20&sort=-date
 *
 * RESPONSE FORMAT:
 * {
 *   "success": true,
 *   "data": [...],
 *   "pagination": {
 *     "total": 150,
 *     "count": 20,
 *     "page": 2,
 *     "limit": 20,
 *     "pages": 8,
 *     "hasNext": true,
 *     "hasPrev": true,
 *     "nextPage": 3,
 *     "prevPage": 1
 *   }
 * }
 */
