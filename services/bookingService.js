/**
 * Booking Service
 *
 * Business logic layer for nurse/physiotherapist booking operations
 * Handles booking creation, assignment, status updates, and completion
 */

const NurseBooking = require('../models/nurseBooking');
const ServiceCatalog = require('../models/serviceCatalog');
const Patient = require('../models/patient');
const User = require('../models/user');
const { invalidateCache } = require('../middleware/queryCache');
const logger = require('../utils/logger');
const { HTTP_STATUS, PAGINATION } = require('../constants');
const {
  ValidationError,
  AuthorizationError,
  NotFoundError
} = require('../utils/errors');

// Health Dashboard integrations
const healthIntakeService = require('./healthIntakeService');
const healthMetricService = require('./healthMetricService');
const healthRecordService = require('./healthRecordService');
const doctorAccessService = require('./doctorAccessService');

class BookingService {
  /**
   * Create a new booking
   * @param {Object} bookingData - Booking data
   * @param {String} patientId - Patient ID
   * @returns {Promise<Object>} Created booking
   */
  async createBooking(bookingData, patientId) {
    const {
      serviceType,
      scheduledDate,
      scheduledTime,
      serviceLocation,
      specialRequirements,
      patientDetails,
      isPackage,
      packageDetails
    } = bookingData;

    // Verify patient exists
    const patient = await Patient.findById(patientId);
    if (!patient) {
      throw new NotFoundError('Patient', patientId);
    }

    // Get service from catalog (match by name which corresponds to serviceType enum)
    // Convert INJECTION → INJECTION_IM mapping
    const serviceNameMap = {
      'INJECTION': 'INJECTION_IM',
      'IV_DRIP': 'IV_DRIP',
      'WOUND_DRESSING': 'WOUND_DRESSING',
      'CATHETER_CARE': 'CATHETER_CARE',
      'POST_SURGERY_CARE': 'POST_SURGERY_CARE',
      'ELDERLY_CARE': 'ELDERLY_CARE_DAILY',
      'PHYSIOTHERAPY_SESSION': 'PHYSIO_SESSION',
      'BACK_PAIN_THERAPY': 'BACK_PAIN_PHYSIO',
      'KNEE_PAIN_THERAPY': 'KNEE_PAIN_PHYSIO',
      'POST_SURGERY_REHAB': 'POST_SURGERY_REHAB',
      'STROKE_REHAB': 'STROKE_REHAB',
      'PHYSIO_PACKAGE_10': 'PHYSIO_PACKAGE_10',
      'ELDERLY_CARE_PACKAGE': 'ELDERLY_CARE_MONTHLY',
      'POST_SURGERY_PACKAGE': 'POST_SURGERY_14DAY'
    };

    const serviceName = serviceNameMap[serviceType] || serviceType;
    const service = await ServiceCatalog.findOne({
      name: serviceName,
      'availability.isActive': true
    });

    if (!service) {
      throw new NotFoundError('Service');
    }

    // Check if prescription is required
    if (service.requirements?.prescriptionRequired && !bookingData.prescriptionUrl) {
      throw new ValidationError('Prescription is required for this service');
    }

    // Calculate pricing
    let basePrice;
    if (isPackage && service.pricing.packageDetails) {
      basePrice = service.pricing.packageDetails.totalPrice;
    } else {
      basePrice = service.pricing.basePrice;
    }

    // Check for surge pricing
    if (service.pricing.surgePricing?.enabled) {
      const bookingHour = new Date(`${scheduledDate}T${scheduledTime}`).getHours();
      const isSurgeHour = service.pricing.surgePricing.surgeHours.some(sh => {
        const start = parseInt(sh.start.split(':')[0]);
        const end = parseInt(sh.end.split(':')[0]);
        return bookingHour >= start && bookingHour < end;
      });

      if (isSurgeHour) {
        basePrice *= service.pricing.surgePricing.surgeMultiplier;
      }
    }

    // Create booking
    const booking = await NurseBooking.create({
      patient: patientId,
      serviceType,
      scheduledDate,
      scheduledTime,
      serviceLocation,
      specialRequirements,
      patientDetails,
      isPackage,
      packageDetails: isPackage ? packageDetails : undefined,
      pricing: {
        basePrice,
        platformFee: 0,
        gst: 0,
        payableAmount: 0
      },
      prescriptionUrl: bookingData.prescriptionUrl,
      status: 'REQUESTED'
    });

    // Calculate total amount
    booking.calculateTotalAmount();
    await booking.save();

    // Invalidate booking cache
    await invalidateCache('*:/api/bookings*');

    logger.info('Booking Created', {
      bookingId: booking._id,
      patientId,
      serviceType,
      scheduledDate,
      amount: booking.pricing.payableAmount
    });

    // Start health intake process if this is patient's first booking
    if (patient.totalBookings === 0 && patient.intakeStatus === 'NOT_STARTED') {
      try {
        await healthIntakeService.startIntakeProcess(patientId, booking._id);
        logger.info('Health intake process started', {
          patientId,
          bookingId: booking._id
        });
      } catch (error) {
        // Log but don't fail the booking creation
        logger.warn('Failed to start health intake process', {
          patientId,
          bookingId: booking._id,
          error: error.message
        });
      }
    }

    return booking;
  }

  /**
   * Get booking by ID
   * @param {String} bookingId - Booking ID
   * @param {String} userId - User ID (patient or provider)
   * @returns {Promise<Object>} Booking details
   */
  async getBookingById(bookingId, userId) {
    const booking = await NurseBooking.findById(bookingId)
      .populate('patient', 'name email phone')
      .populate('serviceProvider', 'name email phone specialty professional');

    if (!booking) {
      throw new NotFoundError('Booking', bookingId);
    }

    // Authorization check - only patient, assigned provider, or admin can view
    const isPatient = booking.patient._id.toString() === userId;
    const isProvider = booking.serviceProvider && booking.serviceProvider._id.toString() === userId;

    if (!isPatient && !isProvider) {
      // Check if user is admin
      const user = await User.findById(userId);
      if (!user || user.role !== 'admin') {
        throw new AuthorizationError('Not authorized to view this booking');
      }
    }

    return booking;
  }

  /**
   * Get all bookings with filters
   * @param {Object} filters - Query filters
   * @param {Object} options - Query options (pagination, sort)
   * @returns {Promise<Object>} List of bookings with pagination
   */
  async getAllBookings(filters = {}, options = {}) {
    const {
      page = PAGINATION.DEFAULT_PAGE,
      limit = PAGINATION.DEFAULT_LIMIT,
      sort = { scheduledDate: -1, scheduledTime: -1 }
    } = options;

    const bookings = await NurseBooking.find(filters)
      .populate('patient', 'name email phone')
      .populate('serviceProvider', 'name email phone')
      .sort(sort)
      .limit(limit)
      .skip((page - 1) * limit)
      .lean();

    const total = await NurseBooking.countDocuments(filters);

    return {
      bookings,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit
      }
    };
  }

  /**
   * Get bookings by patient
   * @param {String} patientId - Patient ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Patient's bookings
   */
  async getPatientBookings(patientId, options = {}) {
    return this.getAllBookings({ patient: patientId }, options);
  }

  /**
   * Get bookings by service provider
   * @param {String} providerId - Provider ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Provider's bookings
   */
  async getProviderBookings(providerId, options = {}) {
    return this.getAllBookings({ serviceProvider: providerId }, options);
  }

  /**
   * Assign a service provider to a booking
   * @param {String} bookingId - Booking ID
   * @param {String} providerId - Provider ID
   * @returns {Promise<Object>} Updated booking
   */
  async assignProvider(bookingId, providerId) {
    const booking = await NurseBooking.findById(bookingId);

    if (!booking) {
      throw new NotFoundError('Booking', bookingId);
    }

    // Check if booking is in correct status
    if (!['REQUESTED', 'SEARCHING'].includes(booking.status)) {
      throw new ValidationError('Booking cannot be assigned in current status');
    }

    // Verify provider exists and has correct role
    const provider = await User.findById(providerId);
    if (!provider) {
      throw new NotFoundError('Service provider', providerId);
    }

    const validRoles = ['nurse', 'physiotherapist'];
    if (!validRoles.includes(provider.role)) {
      throw new ValidationError('User is not a valid service provider');
    }

    // Assign provider
    booking.serviceProvider = providerId;
    booking.status = 'ASSIGNED';
    booking.statusHistory.push({
      status: 'ASSIGNED',
      timestamp: new Date(),
      note: `Assigned to ${provider.name}`
    });

    await booking.save();

    // Grant health data access to provider for this booking
    try {
      await doctorAccessService.grantAccess({
        patientId: booking.patient,
        doctorId: providerId,
        bookingId: booking._id,
        accessLevel: 'READ_WRITE',
        allowedResources: ['HEALTH_RECORD', 'HEALTH_METRIC', 'DOCTOR_NOTE'],
        grantReason: `Assigned to booking ${booking._id}`,
        adminId: providerId, // System grant
        adminName: 'System'
      });

      logger.info('Health data access granted to provider', {
        bookingId: booking._id,
        providerId,
        patientId: booking.patient
      });
    } catch (error) {
      logger.warn('Failed to grant health data access', {
        bookingId: booking._id,
        providerId,
        error: error.message
      });
    }

    // Invalidate cache
    await invalidateCache('*:/api/bookings*');

    logger.info('Provider Assigned to Booking', {
      bookingId: booking._id,
      providerId,
      providerName: provider.name
    });

    return booking;
  }

  /**
   * Update booking status
   * @param {String} bookingId - Booking ID
   * @param {String} newStatus - New status
   * @param {String} userId - User updating the status
   * @param {String} note - Optional note
   * @returns {Promise<Object>} Updated booking
   */
  async updateStatus(bookingId, newStatus, userId, note = '') {
    const booking = await NurseBooking.findById(bookingId);

    if (!booking) {
      throw new NotFoundError('Booking', bookingId);
    }

    // Validate status transition
    const validTransitions = {
      'REQUESTED': ['SEARCHING', 'CANCELLED'],
      'SEARCHING': ['ASSIGNED', 'CANCELLED'],
      'ASSIGNED': ['CONFIRMED', 'CANCELLED'],
      'CONFIRMED': ['EN_ROUTE', 'CANCELLED'],
      'EN_ROUTE': ['IN_PROGRESS', 'CANCELLED'],
      'IN_PROGRESS': ['COMPLETED', 'CANCELLED'],
      'COMPLETED': [],
      'CANCELLED': []
    };

    const allowedStatuses = validTransitions[booking.status] || [];
    if (!allowedStatuses.includes(newStatus)) {
      throw new ValidationError(`Cannot change status from ${booking.status} to ${newStatus}`);
    }

    // Authorization check
    const user = await User.findById(userId);
    const isProvider = booking.serviceProvider && booking.serviceProvider.toString() === userId;
    const isAdmin = user && user.role === 'admin';

    if (!isProvider && !isAdmin) {
      throw new AuthorizationError('Not authorized to update booking status');
    }

    // Update status
    booking.status = newStatus;
    booking.statusHistory.push({
      status: newStatus,
      timestamp: new Date(),
      note: note || `Status changed to ${newStatus}`
    });

    // Set timestamps for specific statuses
    if (newStatus === 'IN_PROGRESS') {
      booking.actualService.startTime = new Date();
    } else if (newStatus === 'COMPLETED') {
      booking.actualService.endTime = new Date();
      booking.actualService.actualDuration = Math.round(
        (booking.actualService.endTime - booking.actualService.startTime) / (1000 * 60)
      );
    } else if (newStatus === 'CANCELLED') {
      booking.cancellation = {
        cancelledAt: new Date(),
        cancelledBy: userId,
        reason: note
      };
    }

    await booking.save();

    // Invalidate cache
    await invalidateCache('*:/api/bookings*');

    logger.info('Booking Status Updated', {
      bookingId: booking._id,
      oldStatus: booking.statusHistory[booking.statusHistory.length - 2]?.status,
      newStatus,
      updatedBy: userId
    });

    return booking;
  }

  /**
   * Complete service with report
   * @param {String} bookingId - Booking ID
   * @param {String} providerId - Provider ID
   * @param {Object} serviceReport - Service report data
   * @returns {Promise<Object>} Updated booking
   */
  async completeService(bookingId, providerId, serviceReport) {
    const booking = await NurseBooking.findById(bookingId);

    if (!booking) {
      throw new NotFoundError('Booking', bookingId);
    }

    // Authorization check
    if (booking.serviceProvider.toString() !== providerId) {
      throw new AuthorizationError('Only assigned provider can complete the service');
    }

    if (booking.status !== 'IN_PROGRESS') {
      throw new ValidationError('Service must be in progress to complete');
    }

    // Add service report
    booking.actualService.serviceReport = serviceReport;
    booking.actualService.endTime = new Date();
    booking.actualService.actualDuration = Math.round(
      (booking.actualService.endTime - booking.actualService.startTime) / (1000 * 60)
    );

    // Update status to completed
    booking.status = 'COMPLETED';
    booking.statusHistory.push({
      status: 'COMPLETED',
      timestamp: new Date(),
      note: 'Service completed successfully'
    });

    await booking.save();

    // Update patient statistics
    await Patient.findByIdAndUpdate(booking.patient, {
      $inc: {
        totalBookings: 1,
        totalSpent: booking.pricing.payableAmount
      }
    });

    // Capture health metrics from service report
    if (serviceReport.vitalsChecked) {
      try {
        const vitals = [];

        // Map vitals from service report to health metrics
        if (serviceReport.vitalsChecked.bloodPressure) {
          const [systolic, diastolic] = serviceReport.vitalsChecked.bloodPressure.split('/').map(Number);
          if (systolic) vitals.push({ metricType: 'BP_SYSTOLIC', value: systolic, unit: 'mmHg' });
          if (diastolic) vitals.push({ metricType: 'BP_DIASTOLIC', value: diastolic, unit: 'mmHg' });
        }
        if (serviceReport.vitalsChecked.heartRate) {
          vitals.push({ metricType: 'HEART_RATE', value: serviceReport.vitalsChecked.heartRate, unit: 'bpm' });
        }
        if (serviceReport.vitalsChecked.temperature) {
          vitals.push({ metricType: 'TEMPERATURE', value: serviceReport.vitalsChecked.temperature, unit: 'celsius' });
        }
        if (serviceReport.vitalsChecked.oxygenSaturation) {
          vitals.push({ metricType: 'OXYGEN', value: serviceReport.vitalsChecked.oxygenSaturation, unit: '%' });
        }
        if (serviceReport.vitalsChecked.bloodSugar) {
          vitals.push({ metricType: 'BLOOD_SUGAR', value: serviceReport.vitalsChecked.bloodSugar, unit: 'mg/dL' });
        }

        if (vitals.length > 0) {
          await healthMetricService.recordMultipleMetrics(booking.patient, vitals, {
            type: 'BOOKING',
            bookingId: booking._id,
            providerId
          });

          logger.info('Health metrics captured from booking', {
            bookingId: booking._id,
            patientId: booking.patient,
            metricsCount: vitals.length
          });
        }
      } catch (error) {
        logger.warn('Failed to capture health metrics from booking', {
          bookingId: booking._id,
          error: error.message
        });
      }
    }

    // Capture observations to health record
    if (serviceReport.observations || serviceReport.recommendations) {
      try {
        await healthRecordService.captureBookingVitals(
          booking.patient,
          booking._id,
          serviceReport,
          providerId
        );

        logger.info('Booking observations captured to health record', {
          bookingId: booking._id,
          patientId: booking.patient
        });
      } catch (error) {
        logger.warn('Failed to capture booking observations', {
          bookingId: booking._id,
          error: error.message
        });
      }
    }

    // Invalidate cache
    await invalidateCache('*:/api/bookings*');

    logger.info('Service Completed', {
      bookingId: booking._id,
      providerId,
      duration: booking.actualService.actualDuration
    });

    return booking;
  }

  /**
   * Add rating and review
   * @param {String} bookingId - Booking ID
   * @param {String} patientId - Patient ID
   * @param {Object} reviewData - Rating and review data
   * @returns {Promise<Object>} Updated booking
   */
  async addReview(bookingId, patientId, reviewData) {
    const booking = await NurseBooking.findById(bookingId);

    if (!booking) {
      throw new NotFoundError('Booking', bookingId);
    }

    // Authorization check
    if (booking.patient.toString() !== patientId) {
      throw new AuthorizationError('Only the patient can review this booking');
    }

    // Check if booking is completed
    if (booking.status !== 'COMPLETED') {
      throw new ValidationError('Can only review completed bookings');
    }

    // Check if already reviewed
    if (booking.rating.ratedAt) {
      throw new ValidationError('Booking already reviewed');
    }

    // Add rating and review
    booking.rating = {
      stars: reviewData.stars,
      comment: reviewData.comment,
      ratedAt: new Date()
    };

    await booking.save();

    // Update provider's average rating
    if (booking.serviceProvider) {
      const providerBookings = await NurseBooking.find({
        serviceProvider: booking.serviceProvider,
        'rating.ratedAt': { $exists: true }
      });

      const totalRatings = providerBookings.reduce((sum, b) => sum + b.rating.stars, 0);
      const avgRating = totalRatings / providerBookings.length;

      await User.findByIdAndUpdate(booking.serviceProvider, {
        'professional.rating': avgRating.toFixed(2)
      });
    }

    // Invalidate cache
    await invalidateCache('*:/api/bookings*');

    logger.info('Booking Reviewed', {
      bookingId: booking._id,
      patientId,
      rating: reviewData.stars
    });

    return booking;
  }

  /**
   * Cancel booking
   * @param {String} bookingId - Booking ID
   * @param {String} userId - User cancelling the booking
   * @param {String} reason - Cancellation reason
   * @returns {Promise<Object>} Updated booking
   */
  async cancelBooking(bookingId, userId, reason) {
    const booking = await NurseBooking.findById(bookingId);

    if (!booking) {
      throw new NotFoundError('Booking', bookingId);
    }

    // Check if booking can be cancelled
    if (['COMPLETED', 'CANCELLED'].includes(booking.status)) {
      throw new ValidationError('Cannot cancel booking in current status');
    }

    // Authorization check
    const isPatient = booking.patient.toString() === userId;
    const isProvider = booking.serviceProvider && booking.serviceProvider.toString() === userId;
    const user = await User.findById(userId);
    const isAdmin = user && user.role === 'admin';

    if (!isPatient && !isProvider && !isAdmin) {
      throw new AuthorizationError('Not authorized to cancel this booking');
    }

    // Update booking
    booking.status = 'CANCELLED';
    booking.cancellation = {
      cancelledAt: new Date(),
      cancelledBy: userId,
      reason
    };
    booking.statusHistory.push({
      status: 'CANCELLED',
      timestamp: new Date(),
      note: reason
    });

    await booking.save();

    // Invalidate cache
    await invalidateCache('*:/api/bookings*');

    logger.info('Booking Cancelled', {
      bookingId: booking._id,
      cancelledBy: userId,
      reason
    });

    return booking;
  }

  /**
   * Get booking statistics
   * @param {Object} filters - Filters for stats calculation
   * @returns {Promise<Object>} Booking statistics
   */
  async getBookingStats(filters = {}) {
    const totalBookings = await NurseBooking.countDocuments(filters);
    const completedBookings = await NurseBooking.countDocuments({
      ...filters,
      status: 'COMPLETED'
    });
    const cancelledBookings = await NurseBooking.countDocuments({
      ...filters,
      status: 'CANCELLED'
    });
    const activeBookings = await NurseBooking.countDocuments({
      ...filters,
      status: { $in: ['REQUESTED', 'SEARCHING', 'ASSIGNED', 'CONFIRMED', 'EN_ROUTE', 'IN_PROGRESS'] }
    });

    const revenueData = await NurseBooking.aggregate([
      { $match: { ...filters, status: 'COMPLETED' } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$pricing.payableAmount' },
          platformRevenue: { $sum: '$pricing.platformFee' }
        }
      }
    ]);

    return {
      totalBookings,
      completedBookings,
      cancelledBookings,
      activeBookings,
      completionRate: totalBookings > 0
        ? ((completedBookings / totalBookings) * 100).toFixed(2)
        : 0,
      totalRevenue: revenueData[0]?.totalRevenue || 0,
      platformRevenue: revenueData[0]?.platformRevenue || 0
    };
  }
}

module.exports = new BookingService();
