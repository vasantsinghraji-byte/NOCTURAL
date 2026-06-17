/**
 * Calendar Service
 *
 * Business logic layer for calendar and scheduling operations
 * Handles events, availability, and conflict detection
 */

const mongoose = require('mongoose');
const CalendarEvent = require('../models/calendarEvent');
const Availability = require('../models/availability');
const Duty = require('../models/duty');
const logger = require('../utils/logger');
const { HTTP_STATUS } = require('../constants');
const { normalizeObjectId, nullProtoObject, setSafeField } = require('../utils/safeMongo');

const ALLOWED_EVENT_FIELDS = new Set([
  'title',
  'description',
  'eventType',
  'startDate',
  'endDate',
  'startTime',
  'endTime',
  'duty',
  'location',
  'status'
]);
const ALLOWED_AVAILABILITY_FIELDS = new Set(['dayOfWeek', 'startTime', 'endTime', 'isAvailable', 'notes']);
const ALLOWED_EVENT_TYPES = new Set(['DUTY', 'AVAILABILITY', 'PERSONAL', 'APPOINTMENT', 'REMINDER']);

const pickFields = (input = {}, allowedFields) => {
  const picked = nullProtoObject();
  Object.entries(input || {}).forEach(([field, value]) => {
    if (allowedFields.has(field)) setSafeField(picked, field, value);
  });
  return picked;
};

async function validateAvailabilitySlots(slots) {
  if (typeof Availability.validate === 'function') {
    await Promise.all(slots.map(slot => Availability.validate(slot)));
    return;
  }

  if (typeof Availability === 'function' && typeof Availability.prototype?.validate === 'function') {
    await Promise.all(slots.map(slot => new Availability(slot).validate()));
  }
}

class CalendarService {
  /**
   * Get calendar events for a user
   * @param {String} userId - User ID
   * @param {Object} options - Filter options
   * @returns {Promise<Array>} Calendar events
   */
  async getEvents(userId, options = {}) {
    const safeUserId = normalizeObjectId(userId, 'user id');
    const { startDate, endDate, eventType } = options;

    const query = { user: safeUserId };

    if (startDate && endDate) {
      query.startDate = { $gte: new Date(startDate) };
      query.endDate = { $lte: new Date(endDate) };
    }

    const safeEventType = typeof eventType === 'string' ? eventType.trim().toUpperCase() : '';
    if (safeEventType && ALLOWED_EVENT_TYPES.has(safeEventType)) {
      query.eventType = safeEventType;
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
    const safeUserId = normalizeObjectId(userId, 'user id');
    const safeEventData = pickFields(eventData, ALLOWED_EVENT_FIELDS);
    const event = new CalendarEvent({
      ...safeEventData,
      user: safeUserId
    });

    // Detect conflicts and check weekly hours in parallel
    await Promise.all([
      event.detectConflicts(),
      event.checkWeeklyHours()
    ]);

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
    const safeEventId = normalizeObjectId(eventId, 'event id');
    const safeUserId = normalizeObjectId(userId, 'user id');
    const event = await CalendarEvent.findOne({
      _id: safeEventId,
      user: safeUserId
    });

    if (!event) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'Calendar event not found'
      };
    }

    Object.assign(event, pickFields(updates, ALLOWED_EVENT_FIELDS));

    // Re-check conflicts and weekly hours after update in parallel
    await Promise.all([
      event.detectConflicts(),
      event.checkWeeklyHours()
    ]);

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
    const safeEventId = normalizeObjectId(eventId, 'event id');
    const safeUserId = normalizeObjectId(userId, 'user id');
    const event = await CalendarEvent.findOneAndDelete({
      _id: safeEventId,
      user: safeUserId
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
    const safeUserId = normalizeObjectId(userId, 'user id');
    const safeDutyId = normalizeObjectId(dutyId, 'duty id');
    const duty = await Duty.findById(safeDutyId);

    if (!duty) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'Duty not found'
      };
    }

    // Create temporary event to check conflicts
    const tempEvent = new CalendarEvent({
      user: safeUserId,
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
    const safeUserId = normalizeObjectId(userId, 'user id');
    const query = { user: safeUserId };

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
    const safeUserId = normalizeObjectId(userId, 'user id');
    for (const slot of availabilitySlots) {
      if (slot.startTime && slot.endTime && slot.startTime >= slot.endTime) {
        throw {
          statusCode: HTTP_STATUS.BAD_REQUEST || 400,
          message: `Invalid time slot: startTime (${slot.startTime}) must be before endTime (${slot.endTime})`
        };
      }
    }

    const slots = availabilitySlots.map(slot => ({
      ...pickFields(slot, ALLOWED_AVAILABILITY_FIELDS),
      user: safeUserId
    }));

    await validateAvailabilitySlots(slots);

    const session = await mongoose.startSession();
    let created = [];

    try {
      await session.withTransaction(async () => {
        created = await Availability.insertMany(slots, {
          ordered: false,
          session
        });
        const newIds = created.map(slot => slot._id);

        await Availability.deleteMany(
          {
            user: safeUserId,
            _id: { $nin: newIds }
          },
          { session }
        );
      });
    } catch (error) {
      const createdIds = created
        .map(slot => slot?._id)
        .filter(Boolean);

      if (createdIds.length > 0) {
        try {
          await Availability.deleteMany({
            user: safeUserId,
            _id: { $in: createdIds }
          });
        } catch (cleanupError) {
          logger.error('Availability compensation failed', {
            userId,
            createdIds,
            cleanupError: cleanupError.message
          });
        }
      }

      throw error;
    } finally {
      await session.endSession();
    }

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
    const safeSlotId = normalizeObjectId(slotId, 'availability slot id');
    const safeUserId = normalizeObjectId(userId, 'user id');
    const safeUpdates = pickFields(updates, ALLOWED_AVAILABILITY_FIELDS);
    if (safeUpdates.startTime || safeUpdates.endTime) {
      const existing = await Availability.findOne({ _id: safeSlotId, user: safeUserId });
      if (existing) {
        const startTime = safeUpdates.startTime || existing.startTime;
        const endTime = safeUpdates.endTime || existing.endTime;
        if (startTime >= endTime) {
          throw {
            statusCode: HTTP_STATUS.BAD_REQUEST || 400,
            message: `Invalid time slot: startTime (${startTime}) must be before endTime (${endTime})`
          };
        }
      }
    }

    const slot = await Availability.findOneAndUpdate(
      { _id: safeSlotId, user: safeUserId },
      safeUpdates,
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
    const safeSlotId = normalizeObjectId(slotId, 'availability slot id');
    const safeUserId = normalizeObjectId(userId, 'user id');
    const slot = await Availability.findOneAndDelete({
      _id: safeSlotId,
      user: safeUserId
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
    const safeUserId = normalizeObjectId(userId, 'user id');
    const events = await CalendarEvent.find({
      user: safeUserId,
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
    const safeUserId = normalizeObjectId(userId, 'user id');
    const events = await CalendarEvent.find({
      user: safeUserId,
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
