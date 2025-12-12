const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const calendarService = require('../services/calendarService');
const CalendarEvent = require('../models/calendarEvent');
const Availability = require('../models/availability');

// @route   GET /api/calendar/events
// @desc    Get user's calendar events
// @access  Private
router.get('/events', protect, async (req, res) => {
    try {
        const { startDate, endDate, eventType } = req.query;

        const events = await calendarService.getEvents(req.user._id, {
            startDate,
            endDate,
            eventType
        });

        res.json({
            success: true,
            data: events
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Error fetching calendar events'
        });
    }
});

// @route   POST /api/calendar/events
// @desc    Create calendar event
// @access  Private
router.post('/events', protect, async (req, res) => {
    try {
        const event = await calendarService.createEvent(req.user._id, req.body);

        res.status(201).json({
            success: true,
            data: event,
            message: 'Calendar event created successfully'
        });
    } catch (error) {
        res.status(error.statusCode || 400).json({
            success: false,
            message: error.message || 'Error creating calendar event'
        });
    }
});

// @route   GET /api/calendar/conflicts
// @desc    Check for conflicts when applying to a duty
// @access  Private
router.post('/conflicts/check', protect, async (req, res) => {
    try {
        const { dutyId } = req.body;

        const conflictResult = await calendarService.checkDutyConflicts(req.user._id, dutyId);

        // Also check availability blocks for complete conflict info
        const availabilities = await Availability.find({
            user: req.user._id,
            active: true
        });

        res.json({
            success: true,
            data: {
                hasConflicts: conflictResult.hasConflicts,
                conflicts: conflictResult.conflicts,
                weeklyHours: {
                    exceeded: conflictResult.weeklyHoursExceeded,
                    current: conflictResult.weeklyHours
                },
                warnings: []
            }
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Error checking conflicts'
        });
    }
});

// @route   GET /api/calendar/availability
// @desc    Get user's availability settings
// @access  Private
router.get('/availability', protect, async (req, res) => {
    try {
        const availabilities = await calendarService.getAvailability(req.user._id);

        res.json({
            success: true,
            data: availabilities
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Error fetching availability'
        });
    }
});

// @route   POST /api/calendar/availability
// @desc    Create availability block
// @access  Private
router.post('/availability', protect, async (req, res) => {
    try {
        const availability = new Availability({
            ...req.body,
            user: req.user._id
        });
        await availability.save();

        res.status(201).json({
            success: true,
            data: availability,
            message: 'Availability setting created successfully'
        });
    } catch (error) {
        res.status(error.statusCode || 400).json({
            success: false,
            message: error.message || 'Error creating availability'
        });
    }
});

// @route   PUT /api/calendar/availability/:id
// @desc    Update availability setting
// @access  Private
router.put('/availability/:id', protect, async (req, res) => {
    try {
        const availability = await calendarService.updateAvailabilitySlot(
            req.params.id,
            req.user._id,
            req.body
        );

        res.json({
            success: true,
            data: availability,
            message: 'Availability updated successfully'
        });
    } catch (error) {
        res.status(error.statusCode || 400).json({
            success: false,
            message: error.message || 'Error updating availability'
        });
    }
});

// @route   DELETE /api/calendar/availability/:id
// @desc    Delete availability setting
// @access  Private
router.delete('/availability/:id', protect, async (req, res) => {
    try {
        await calendarService.deleteAvailabilitySlot(req.params.id, req.user._id);

        res.json({
            success: true,
            message: 'Availability setting deleted successfully'
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Error deleting availability'
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
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Error syncing calendar'
        });
    }
});

// @route   GET /api/calendar/upcoming
// @desc    Get upcoming shifts
// @access  Private
router.get('/upcoming', protect, async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        const shifts = await calendarService.getUpcomingShifts(req.user._id, parseInt(limit));

        res.json({
            success: true,
            data: shifts
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Error fetching upcoming shifts'
        });
    }
});

// @route   GET /api/calendar/summary
// @desc    Get calendar summary
// @access  Private
router.get('/summary', protect, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'Start date and end date are required'
            });
        }

        const summary = await calendarService.getCalendarSummary(
            req.user._id,
            startDate,
            endDate
        );

        res.json({
            success: true,
            data: summary
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Error fetching calendar summary'
        });
    }
});

module.exports = router;
