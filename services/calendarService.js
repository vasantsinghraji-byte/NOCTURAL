/**
 * Calendar Service
 *
 * Business logic layer for calendar and scheduling operations
 * Handles events, availability, and conflict detection
 */

const CalendarEvent = require('../models/calendarEvent');
const Availability = require('../models/availability');
const Duty = require('../models/duty');
const logger = require('../utils/logger');
const { HTTP_STATUS } = require('../constants');

class CalendarService {
  /**
   * Get calendar events for a user
   * @param {String} userId - User ID
   * @param {Object} options - Filter options
   * @returns {Promise<Array>} Calendar events
   */
  async getEvents(userId, options = {}) {
    const { startDate, endDate, eventType } = options;

    const query = { user: userId };

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

    return events;
  }

  /**
   * Create a calendar event
   * @param {String} userId - User ID
   * @param {Object} eventData - Event data
   * @returns {Promise<Object>} Created event
   */
  async createEvent(userId, eventData) {
    const event = new CalendarEvent({
      ...eventData,
      user: userId
    });

    // Detect conflicts
    await event.detectConflicts();

    // Check weekly hours
    await event.checkWeeklyHours();

    await event.save();

    logger.info('Calendar event created', {
      eventId: event._id,
      userId,
      eventType: event.eventType
    });

    return event;
  }

  /**
   * Update a calendar event
   * @param {String} eventId - Event ID
   * @param {String} userId - User ID
   * @param {Object} updates - Update data
   * @returns {Promise<Object>} Updated event
   */
  async updateEvent(eventId, userId, updates) {
    const event = await CalendarEvent.findOne({
      _id: eventId,
      user: userId
    });

    if (!event) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'Calendar event not found'
      };
    }

    Object.assign(event, updates);

    // Re-check conflicts after update
    await event.detectConflicts();
    await event.checkWeeklyHours();

    await event.save();

    logger.info('Calendar event updated', { eventId, userId });

    return event;
  }

  /**
   * Delete a calendar event
   * @param {String} eventId - Event ID
   * @param {String} userId - User ID
   * @returns {Promise<Object>} Deleted event
   */
  async deleteEvent(eventId, userId) {
    const event = await CalendarEvent.findOneAndDelete({
      _id: eventId,
      user: userId
    });

    if (!event) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'Calendar event not found'
      };
    }

    logger.info('Calendar event deleted', { eventId, userId });

    return event;
  }

  /**
   * Check for conflicts with a duty
   * @param {String} userId - User ID
   * @param {String} dutyId - Duty ID
   * @returns {Promise<Object>} Conflict check result
   */
  async checkDutyConflicts(userId, dutyId) {
    const duty = await Duty.findById(dutyId);

    if (!duty) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'Duty not found'
      };
    }

    // Create temporary event to check conflicts
    const tempEvent = new CalendarEvent({
      user: userId,
      title: duty.title,
      eventType: 'SHIFT_PENDING',
      startDate: duty.date,
      endDate: duty.date,
      startTime: duty.startTime,
      endTime: duty.endTime,
      duty: duty._id
    });

    const conflicts = await tempEvent.detectConflicts();
    const weeklyHoursCheck = await tempEvent.checkWeeklyHours();

    return {
      hasConflicts: conflicts && conflicts.length > 0,
      conflicts: conflicts || [],
      weeklyHoursExceeded: weeklyHoursCheck?.exceeded || false,
      weeklyHours: weeklyHoursCheck?.currentHours || 0
    };
  }

  /**
   * Get user availability
   * @param {String} userId - User ID
   * @param {Date} date - Specific date (optional)
   * @returns {Promise<Array>} Availability slots
   */
  async getAvailability(userId, date = null) {
    const query = { user: userId };

    if (date) {
      const dayOfWeek = new Date(date).toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
      query.dayOfWeek = dayOfWeek;
    }

    const availability = await Availability.find(query).sort({ dayOfWeek: 1, startTime: 1 });

    return availability;
  }

  /**
   * Set user availability
   * @param {String} userId - User ID
   * @param {Array} availabilitySlots - Availability data
   * @returns {Promise<Array>} Created availability slots
   */
  async setAvailability(userId, availabilitySlots) {
    for (const slot of availabilitySlots) {
      if (slot.startTime && slot.endTime && slot.startTime >= slot.endTime) {
        throw {
          statusCode: HTTP_STATUS.BAD_REQUEST || 400,
          message: `Invalid time slot: startTime (${slot.startTime}) must be before endTime (${slot.endTime})`
        };
      }
    }

    const slots = availabilitySlots.map(slot => ({
      ...slot,
      user: userId
    }));

    // Insert new slots FIRST — if this fails, old data is preserved
    const created = await Availability.insertMany(slots);
    const newIds = created.map(s => s._id);

    // Only delete old slots after new ones are successfully created
    await Availability.deleteMany({
      user: userId,
      _id: { $nin: newIds }
    });

    logger.info('Availability updated', { userId, slotsCount: created.length });

    return created;
  }

  /**
   * Update single availability slot
   * @param {String} slotId - Availability slot ID
   * @param {String} userId - User ID
   * @param {Object} updates - Update data
   * @returns {Promise<Object>} Updated slot
   */
  async updateAvailabilitySlot(slotId, userId, updates) {
    if (updates.startTime || updates.endTime) {
      const existing = await Availability.findOne({ _id: slotId, user: userId });
      if (existing) {
        const startTime = updates.startTime || existing.startTime;
        const endTime = updates.endTime || existing.endTime;
        if (startTime >= endTime) {
          throw {
            statusCode: HTTP_STATUS.BAD_REQUEST || 400,
            message: `Invalid time slot: startTime (${startTime}) must be before endTime (${endTime})`
          };
        }
      }
    }

    const slot = await Availability.findOneAndUpdate(
      { _id: slotId, user: userId },
      updates,
      { new: true }
    );

    if (!slot) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'Availability slot not found'
      };
    }

    logger.info('Availability slot updated', { slotId, userId });

    return slot;
  }

  /**
   * Delete availability slot
   * @param {String} slotId - Availability slot ID
   * @param {String} userId - User ID
   * @returns {Promise<Object>} Deleted slot
   */
  async deleteAvailabilitySlot(slotId, userId) {
    const slot = await Availability.findOneAndDelete({
      _id: slotId,
      user: userId
    });

    if (!slot) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'Availability slot not found'
      };
    }

    logger.info('Availability slot deleted', { slotId, userId });

    return slot;
  }

  /**
   * Get upcoming shifts for a user
   * @param {String} userId - User ID
   * @param {Number} limit - Max results
   * @returns {Promise<Array>} Upcoming shifts
   */
  async getUpcomingShifts(userId, limit = 10) {
    const events = await CalendarEvent.find({
      user: userId,
      eventType: { $in: ['SHIFT_CONFIRMED', 'SHIFT_PENDING'] },
      startDate: { $gte: new Date() }
    })
      .populate('duty', 'title hospital specialty payRate')
      .sort({ startDate: 1 })
      .limit(limit);

    return events;
  }

  /**
   * Get calendar summary for a date range
   * @param {String} userId - User ID
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Object>} Calendar summary
   */
  async getCalendarSummary(userId, startDate, endDate) {
    const events = await CalendarEvent.find({
      user: userId,
      startDate: { $gte: new Date(startDate) },
      endDate: { $lte: new Date(endDate) }
    });

    const summary = {
      totalEvents: events.length,
      confirmedShifts: events.filter(e => e.eventType === 'SHIFT_CONFIRMED').length,
      pendingShifts: events.filter(e => e.eventType === 'SHIFT_PENDING').length,
      blockedTime: events.filter(e => e.eventType === 'BLOCKED').length,
      personalEvents: events.filter(e => e.eventType === 'PERSONAL').length
    };

    return summary;
  }
}

module.exports = new CalendarService();
