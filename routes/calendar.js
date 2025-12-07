const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const CalendarEvent = require('../models/calendarEvent');
const Availability = require('../models/availability');
const Duty = require('../models/duty');

// @route   GET /api/calendar/events
// @desc    Get user's calendar events
// @access  Private
router.get('/events', protect, async (req, res) => {
    try {
        const { startDate, endDate, eventType } = req.query;

        const query = { user: req.user._id };

        if (startDate && endDate) {
            query.startDate = { $gte: new Date(startDate) };
            query.endDate = { $lte: new Date(endDate) };
        }

        if (eventType) {
            query.eventType = eventType;
        }

        const events = await CalendarEvent.find(query)
            .populate('duty', 'title hospital specialty')
            .sort({ startDate: 1 });

        res.json({
            success: true,
            data: events
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching calendar events',
            error: error.message
        });
    }
});

// @route   POST /api/calendar/events
// @desc    Create calendar event
// @access  Private
router.post('/events', protect, async (req, res) => {
    try {
        const eventData = {
            ...req.body,
            user: req.user._id
        };

        const event = new CalendarEvent(eventData);

        // Detect conflicts
        await event.detectConflicts();

        // Check weekly hours
        await event.checkWeeklyHours();

        await event.save();

        res.status(201).json({
            success: true,
            data: event,
            message: 'Calendar event created successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Error creating calendar event',
            error: error.message
        });
    }
});

// @route   GET /api/calendar/conflicts
// @desc    Check for conflicts when applying to a duty
// @access  Private
router.post('/conflicts/check', protect, async (req, res) => {
    try {
        const { dutyId } = req.body;

        const duty = await Duty.findById(dutyId);
        if (!duty) {
            return res.status(404).json({
                success: false,
                message: 'Duty not found'
            });
        }

        // Create temporary event to check conflicts
        const tempEvent = new CalendarEvent({
            user: req.user._id,
            title: duty.title,
            eventType: 'SHIFT_PENDING',
            startDate: duty.date,
            endDate: duty.date,
            startTime: duty.startTime,
            endTime: duty.endTime,
            location: duty.location,
            duty: duty._id
        });

        const conflicts = await tempEvent.detectConflicts();
        const weeklyHours = await tempEvent.checkWeeklyHours();

        // Check availability blocks
        const availabilityConflicts = await Availability.find({
            user: req.user._id,
            active: true
        });

        const blockedBy = [];
        for (const avail of availabilityConflicts) {
            if (avail.conflictsWith(duty.date, duty.startTime, duty.endTime)) {
                blockedBy.push({
                    type: avail.type,
                    reason: avail.dateRange?.reason || 'Unavailable during this time'
                });
            }
        }

        res.json({
            success: true,
            data: {
                hasConflicts: conflicts.length > 0 || blockedBy.length > 0,
                conflicts,
                blockedBy,
                weeklyHours,
                warnings: tempEvent.warnings || []
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error checking conflicts',
            error: error.message
        });
    }
});

// @route   GET /api/calendar/availability
// @desc    Get user's availability settings
// @access  Private
router.get('/availability', protect, async (req, res) => {
    try {
        const availabilities = await Availability.find({
            user: req.user._id,
            active: true
        }).sort({ createdAt: -1 });

        res.json({
            success: true,
            data: availabilities
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching availability',
            error: error.message
        });
    }
});

// @route   POST /api/calendar/availability
// @desc    Create availability block
// @access  Private
router.post('/availability', protect, async (req, res) => {
    try {
        const availabilityData = {
            ...req.body,
            user: req.user._id
        };

        const availability = new Availability(availabilityData);
        await availability.save();

        res.status(201).json({
            success: true,
            data: availability,
            message: 'Availability setting created successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Error creating availability',
            error: error.message
        });
    }
});

// @route   PUT /api/calendar/availability/:id
// @desc    Update availability setting
// @access  Private
router.put('/availability/:id', protect, async (req, res) => {
    try {
        const availability = await Availability.findOne({
            _id: req.params.id,
            user: req.user._id
        });

        if (!availability) {
            return res.status(404).json({
                success: false,
                message: 'Availability setting not found'
            });
        }

        Object.assign(availability, req.body);
        await availability.save();

        res.json({
            success: true,
            data: availability,
            message: 'Availability updated successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Error updating availability',
            error: error.message
        });
    }
});

// @route   DELETE /api/calendar/availability/:id
// @desc    Delete availability setting
// @access  Private
router.delete('/availability/:id', protect, async (req, res) => {
    try {
        const availability = await Availability.findOneAndDelete({
            _id: req.params.id,
            user: req.user._id
        });

        if (!availability) {
            return res.status(404).json({
                success: false,
                message: 'Availability setting not found'
            });
        }

        res.json({
            success: true,
            message: 'Availability setting deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error deleting availability',
            error: error.message
        });
    }
});

// @route   POST /api/calendar/sync
// @desc    Sync with external calendar (Google, Apple, Outlook)
// @access  Private
router.post('/sync', protect, async (req, res) => {
    try {
        const { provider, events } = req.body;

        if (!['GOOGLE', 'APPLE', 'OUTLOOK'].includes(provider)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid calendar provider'
            });
        }

        const syncedEvents = await CalendarEvent.syncWithExternalCalendar(
            req.user._id,
            provider,
            events
        );

        res.json({
            success: true,
            data: syncedEvents,
            message: `Successfully synced ${syncedEvents.length} events from ${provider}`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error syncing calendar',
            error: error.message
        });
    }
});

module.exports = router;
