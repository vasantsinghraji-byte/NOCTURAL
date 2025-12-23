/**
 * Booking Service
 * Business logic for nurse/physiotherapist booking operations
 */

const { NurseBooking, ServiceCatalog, Patient } = require('../models');
const { createLogger } = require('@nocturnal/shared');

const logger = createLogger({ serviceName: 'patient-booking-service' });

class BookingService {
  /**
   * Create a new booking
   */
  async createBooking(patientId, bookingData) {
    try {
      const {
        serviceType,
        scheduledDate,
        scheduledTime,
        serviceLocation,
        serviceDetails,
        patientCondition
      } = bookingData;

      // Validate patient exists
      const patient = await Patient.findById(patientId);
      if (!patient) {
        throw new Error('Patient not found');
      }

      // Get service from catalog for pricing
      const service = await ServiceCatalog.findOne({
        name: serviceType,
        'availability.isActive': true
      });

      if (!service) {
        throw new Error('Service not available');
      }

      // Create booking object
      const booking = new NurseBooking({
        patient: patientId,
        serviceType,
        scheduledDate: new Date(scheduledDate),
        scheduledTime,
        serviceLocation,
        serviceDetails,
        patientCondition,
        status: 'REQUESTED',
        pricing: {
          basePrice: service.pricing.basePrice
        }
      });

      // Calculate total amount
      booking.calculateTotalAmount();

      // Save booking
      await booking.save();

      // Update patient stats
      await Patient.findByIdAndUpdate(patientId, {
        $inc: { totalBookings: 1 }
      });

      // Update service stats
      await ServiceCatalog.findByIdAndUpdate(service._id, {
        $inc: { 'stats.totalBookings': 1 }
      });

      logger.info('Booking created', {
        bookingId: booking._id,
        patientId,
        serviceType,
        amount: booking.pricing.payableAmount
      });

      // TODO: Publish booking.created event to RabbitMQ

      return booking;
    } catch (error) {
      logger.error('Error creating booking', {
        patientId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get bookings for a patient
   */
  async getPatientBookings(patientId, options = {}) {
    const { status, page = 1, limit = 20 } = options;

    const query = { patient: patientId };
    if (status) {
      query.status = status;
    }

    const skip = (page - 1) * limit;

    const [bookings, total] = await Promise.all([
      NurseBooking.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('serviceProvider', 'name phone profilePhoto'),
      NurseBooking.countDocuments(query)
    ]);

    return {
      bookings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get booking by ID
   */
  async getBookingById(bookingId, patientId) {
    const booking = await NurseBooking.findOne({
      _id: bookingId,
      patient: patientId
    }).populate('serviceProvider', 'name phone email profilePhoto rating');

    if (!booking) {
      throw new Error('Booking not found');
    }

    return booking;
  }

  /**
   * Update booking
   */
  async updateBooking(bookingId, patientId, updates) {
    const booking = await NurseBooking.findOne({
      _id: bookingId,
      patient: patientId
    });

    if (!booking) {
      throw new Error('Booking not found');
    }

    // Only allow updates if booking is in certain states
    const allowedStatuses = ['REQUESTED', 'SEARCHING'];
    if (!allowedStatuses.includes(booking.status)) {
      throw new Error(`Cannot update booking in ${booking.status} status`);
    }

    // Allow updating specific fields
    const allowedUpdates = [
      'scheduledDate',
      'scheduledTime',
      'serviceLocation',
      'serviceDetails',
      'patientCondition'
    ];

    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        booking[key] = updates[key];
      }
    });

    await booking.save();

    logger.info('Booking updated', {
      bookingId,
      patientId,
      updates: Object.keys(updates)
    });

    return booking;
  }

  /**
   * Cancel booking
   */
  async cancelBooking(bookingId, patientId, reason) {
    const booking = await NurseBooking.findOne({
      _id: bookingId,
      patient: patientId
    });

    if (!booking) {
      throw new Error('Booking not found');
    }

    // Check if booking can be cancelled
    const nonCancellableStatuses = ['COMPLETED', 'CANCELLED'];
    if (nonCancellableStatuses.includes(booking.status)) {
      throw new Error(`Cannot cancel booking in ${booking.status} status`);
    }

    // Calculate refund eligibility
    const now = new Date();
    const scheduledDateTime = new Date(
      `${booking.scheduledDate.toISOString().split('T')[0]} ${booking.scheduledTime}`
    );
    const hoursUntilBooking = (scheduledDateTime - now) / (1000 * 60 * 60);

    let refundAmount = 0;
    let cancellationFee = 0;

    // Refund policy
    if (hoursUntilBooking > 24) {
      // Full refund if cancelled 24+ hours before
      refundAmount = booking.pricing.payableAmount;
    } else if (hoursUntilBooking > 4) {
      // 50% refund if cancelled 4-24 hours before
      refundAmount = booking.pricing.payableAmount * 0.5;
      cancellationFee = booking.pricing.payableAmount * 0.5;
    } else {
      // No refund if cancelled less than 4 hours before
      cancellationFee = booking.pricing.payableAmount;
    }

    // Update booking
    booking.status = 'CANCELLED';
    booking.cancellation = {
      cancelledBy: 'PATIENT',
      reason,
      cancelledAt: now,
      refundEligible: refundAmount > 0,
      refundAmount,
      cancellationFee
    };

    await booking.save();

    logger.info('Booking cancelled', {
      bookingId,
      patientId,
      refundAmount,
      cancellationFee
    });

    // TODO: Publish booking.cancelled event to RabbitMQ
    // TODO: Process refund if applicable

    return booking;
  }

  /**
   * Add rating and review
   */
  async addReview(bookingId, patientId, reviewData) {
    const booking = await NurseBooking.findOne({
      _id: bookingId,
      patient: patientId
    });

    if (!booking) {
      throw new Error('Booking not found');
    }

    // Only completed bookings can be reviewed
    if (booking.status !== 'COMPLETED') {
      throw new Error('Only completed bookings can be reviewed');
    }

    // Check if already reviewed
    if (booking.rating && booking.rating.stars) {
      throw new Error('Booking has already been reviewed');
    }

    // Add review
    booking.rating = {
      stars: reviewData.stars,
      review: reviewData.review,
      punctuality: reviewData.punctuality,
      professionalism: reviewData.professionalism,
      skillLevel: reviewData.skillLevel,
      communication: reviewData.communication,
      ratedAt: new Date()
    };

    await booking.save();

    logger.info('Review added', {
      bookingId,
      patientId,
      stars: reviewData.stars
    });

    // TODO: Update nurse rating
    // TODO: Publish review.created event

    return booking;
  }

  /**
   * Get upcoming bookings
   */
  async getUpcomingBookings(patientId) {
    const now = new Date();

    const bookings = await NurseBooking.find({
      patient: patientId,
      scheduledDate: { $gte: now },
      status: { $in: ['REQUESTED', 'SEARCHING', 'ASSIGNED', 'CONFIRMED'] }
    })
      .sort({ scheduledDate: 1 })
      .limit(10)
      .populate('serviceProvider', 'name phone profilePhoto');

    return bookings;
  }

  /**
   * Get booking history
   */
  async getBookingHistory(patientId, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [bookings, total] = await Promise.all([
      NurseBooking.find({
        patient: patientId,
        status: { $in: ['COMPLETED', 'CANCELLED', 'NO_SHOW'] }
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('serviceProvider', 'name profilePhoto rating'),
      NurseBooking.countDocuments({
        patient: patientId,
        status: { $in: ['COMPLETED', 'CANCELLED', 'NO_SHOW'] }
      })
    ]);

    return {
      bookings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }
}

module.exports = new BookingService();
