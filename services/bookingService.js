/**
 * Booking Service
 *
 * Business logic layer for nurse/physiotherapist booking operations
 * Handles booking creation, assignment, status updates, and completion
 */

const mongoose = require('mongoose');
const NurseBooking = require('../models/nurseBooking');
const ServiceCatalog = require('../models/serviceCatalog');
const Patient = require('../models/patient');
const User = require('../models/user');
const { invalidateCache } = require('../middleware/queryCache');
const logger = require('../utils/logger');
const { roundToTwoDecimals } = require('../utils/number');
const { VALIDATED_QUERY_UPDATE_OPTIONS } = require('../utils/queryUpdateOptions');
const { hasReviewAggregateStateChanged } = require('../utils/bookingReviewAggregate');
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
const BookingCompletionOutbox = require('../models/bookingCompletionOutbox');
const { normalizeObjectId, nullProtoObject, setSafeField } = require('../utils/safeMongo');

const ALLOWED_BOOKING_FILTERS = new Set(['patient', 'serviceProvider', 'status', 'serviceType', 'payment.status']);

const safeBookingFilters = (filters = {}) => {
  const query = nullProtoObject();
  Object.entries(filters || {}).forEach(([field, value]) => {
    if (!ALLOWED_BOOKING_FILTERS.has(field)) return;
    if (['patient', 'serviceProvider'].includes(field)) {
      setSafeField(query, field, normalizeObjectId(value, `${field} id`));
      return;
    }
    setSafeField(query, field, value);
  });
  return query;
};

const buildCompletionVitals = (serviceReport = {}) => {
  const checked = serviceReport.vitalsChecked || {};
  const vitals = [];

  if (checked.bloodPressure) {
    const [systolic, diastolic] = checked.bloodPressure.split('/').map(Number);
    if (systolic) vitals.push({ metricType: 'BP_SYSTOLIC', value: systolic, unit: 'mmHg' });
    if (diastolic) vitals.push({ metricType: 'BP_DIASTOLIC', value: diastolic, unit: 'mmHg' });
  }
  if (checked.heartRate) {
    vitals.push({ metricType: 'HEART_RATE', value: checked.heartRate, unit: 'bpm' });
  }
  if (checked.temperature) {
    vitals.push({ metricType: 'TEMPERATURE', value: checked.temperature, unit: 'celsius' });
  }
  if (checked.oxygenLevel) {
    vitals.push({ metricType: 'OXYGEN_LEVEL', value: checked.oxygenLevel, unit: '%' });
  }
  if (checked.bloodSugar) {
    vitals.push({ metricType: 'BLOOD_SUGAR', value: checked.bloodSugar, unit: 'mg/dL' });
  }

  return vitals;
};

const resolveCancellationActor = ({ userRole, isPatient = false, isProvider = false }) => {
  if (userRole === 'admin') return 'ADMIN';
  if (userRole === 'system') return 'SYSTEM';
  if (isPatient || userRole === 'patient') return 'PATIENT';
  if (isProvider || ['doctor', 'nurse', 'physiotherapist'].includes(userRole)) return 'PROVIDER';
  return 'SYSTEM';
};

const TIME_FORMAT_REGEX = /^\d{1,2}:\d{2}$/;

const formatUtcOffset = (offsetMinutes) => {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absoluteMinutes / 60)).padStart(2, '0');
  const minutes = String(absoluteMinutes % 60).padStart(2, '0');

  return `${sign}${hours}:${minutes}`;
};

const resolveScheduledLocalHour = ({ scheduledDate, scheduledTime, scheduledTimezoneOffsetMinutes }) => {
  if (!Number.isInteger(scheduledTimezoneOffsetMinutes)) {
    throw new ValidationError('Scheduled timezone offset is required');
  }

  if (!TIME_FORMAT_REGEX.test(scheduledTime)) {
    throw new ValidationError('Invalid scheduled date/time format');
  }

  const [hours, minutes] = scheduledTime.split(':').map(Number);
  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new ValidationError('Invalid scheduled date/time format');
  }

  const explicitOffsetDateTime = `${scheduledDate}T${scheduledTime}:00${formatUtcOffset(scheduledTimezoneOffsetMinutes)}`;
  const bookingDate = new Date(explicitOffsetDateTime);
  if (Number.isNaN(bookingDate.getTime())) {
    throw new ValidationError('Invalid scheduled date/time format');
  }

  return hours;
};

class BookingService {
  /**
   * Create a new booking
   * @param {Object} bookingData - Booking data
   * @param {String} patientId - Patient ID
   * @returns {Promise<Object>} Created booking
   */
  async createBooking(bookingData, patientId) {
    const safePatientId = normalizeObjectId(patientId, 'patient id');
    const {
      serviceType,
      scheduledDate,
      scheduledTime,
      scheduledTimezone,
      scheduledTimezoneOffsetMinutes,
      serviceLocation,
      specialRequirements,
      patientDetails,
      isPackage,
      packageDetails
    } = bookingData;

    // Verify patient exists
    const patient = await Patient.findById(safePatientId);
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

    const availableCities = service.availability?.availableCities || [];
    const requestedCity = serviceLocation?.city;
    if (
      availableCities.length > 0 &&
      (!requestedCity || !availableCities.some((city) =>
        city.toLowerCase() === requestedCity.toLowerCase()
      ))
    ) {
      throw new ValidationError(`Service is not available in ${requestedCity || 'the requested city'}`);
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
      const bookingHour = resolveScheduledLocalHour({
        scheduledDate,
        scheduledTime,
        scheduledTimezoneOffsetMinutes
      });
      const isSurgeHour = service.pricing.surgePricing.surgeHours.some(sh => {
        if (!sh.start || !sh.end || !TIME_FORMAT_REGEX.test(sh.start) || !TIME_FORMAT_REGEX.test(sh.end)) {
          return false;
        }
        const start = parseInt(sh.start.split(':')[0], 10);
        const end = parseInt(sh.end.split(':')[0], 10);
        if (isNaN(start) || isNaN(end) || start < 0 || start > 23 || end < 0 || end > 23) {
          return false;
        }
        return bookingHour >= start && bookingHour < end;
      });

      if (isSurgeHour) {
        basePrice *= service.pricing.surgePricing.surgeMultiplier;
      }
    }

    // Calculate pricing upfront so the booking is created with correct amounts
    const platformFee = basePrice * 0.15;
    const gst = (basePrice + platformFee) * 0.18;
    const totalAmount = basePrice + platformFee + gst;
    const discount = 0;
    const payableAmount = totalAmount - discount;

    // Create booking with final pricing in a single operation
    const booking = await NurseBooking.create({
      patient: safePatientId,
      serviceType,
      scheduledDate,
      scheduledTime,
      scheduledTimezone,
      scheduledTimezoneOffsetMinutes,
      serviceLocation,
      specialRequirements,
      patientDetails,
      isPackage,
      packageDetails: isPackage ? packageDetails : undefined,
      pricing: {
        basePrice,
        platformFee,
        gst,
        discount,
        totalAmount,
        payableAmount
      },
      prescriptionUrl: bookingData.prescriptionUrl,
      status: 'REQUESTED'
    });

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

    // Invalidate cache after all operations complete
    await invalidateCache('*:/api/bookings*');

    return booking;
  }

  /**
   * Get booking by ID
   * @param {String} bookingId - Booking ID
   * @param {String} userId - User ID (patient or provider)
   * @returns {Promise<Object>} Booking details
   */
  async getBookingById(bookingId, userId, userRole) {
    const safeBookingId = normalizeObjectId(bookingId, 'booking id');
    const safeUserId = normalizeObjectId(userId, 'user id');
    const booking = await NurseBooking.findById(safeBookingId)
      .populate('patient', 'name email phone')
      .populate('serviceProvider', 'name email phone specialty professional');

    if (!booking) {
      throw new NotFoundError('Booking', bookingId);
    }

    // Authorization check - only patient, assigned provider, or admin can view
    const isPatient = booking.patient._id.toString() === safeUserId.toString();
    const isProvider = booking.serviceProvider && booking.serviceProvider._id.toString() === safeUserId.toString();
    const isAdmin = userRole === 'admin';

    if (!isPatient && !isProvider && !isAdmin) {
      throw new AuthorizationError('Not authorized to view this booking');
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

    const query = safeBookingFilters(filters);
    const bookings = await NurseBooking.find(query)
      .populate('patient', 'name email phone')
      .populate('serviceProvider', 'name email phone')
      .sort(sort)
      .limit(limit)
      .skip((page - 1) * limit)
      .lean();

    const total = await NurseBooking.countDocuments(query);

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
    return this.getAllBookings({ patient: normalizeObjectId(patientId, 'patient id') }, options);
  }

  /**
   * Get bookings by service provider
   * @param {String} providerId - Provider ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Provider's bookings
   */
  async getProviderBookings(providerId, options = {}) {
    return this.getAllBookings({ serviceProvider: normalizeObjectId(providerId, 'provider id') }, options);
  }

  /**
   * Get assignable providers for admin booking assignment
   * @returns {Promise<Array>} Active assignable providers
   */
  async getAssignableProviders() {
    return User.find({
      role: { $in: ['nurse', 'physiotherapist'] },
      isActive: true
    })
      .select('name email phone role specialty professional.primarySpecialization professional.yearsOfExperience')
      .sort({ role: 1, name: 1 })
      .lean();
  }

  /**
   * Assign a service provider to a booking
   * @param {String} bookingId - Booking ID
   * @param {String} providerId - Provider ID
   * @param {String} adminId - Acting admin ID
   * @returns {Promise<Object>} Updated booking
   */
  async assignProvider(bookingId, providerId, adminId) {
    if (!adminId) {
      throw new ValidationError('Admin ID is required to assign a provider');
    }
    const safeBookingId = normalizeObjectId(bookingId, 'booking id');
    const safeProviderId = normalizeObjectId(providerId, 'provider id');
    const safeAdminId = normalizeObjectId(adminId, 'admin id');

    // Verify provider exists and has correct role
    const provider = await User.findById(safeProviderId);
    if (!provider) {
      throw new NotFoundError('Service provider', providerId);
    }

    const validRoles = ['nurse', 'physiotherapist'];
    if (!validRoles.includes(provider.role)) {
      throw new ValidationError('User is not a valid service provider');
    }

    // Atomic: assign provider only if booking is in assignable status
    const booking = await NurseBooking.findOneAndUpdate(
      {
        _id: safeBookingId,
        status: { $in: ['REQUESTED', 'SEARCHING'] }
      },
      {
        $set: {
          serviceProvider: safeProviderId,
          status: 'ASSIGNED'
        }
      },
      VALIDATED_QUERY_UPDATE_OPTIONS
    );

    if (!booking) {
      // Check if booking exists at all to give a better error
      const exists = await NurseBooking.findById(safeBookingId);
      if (!exists) {
        throw new NotFoundError('Booking', bookingId);
      }
      throw new ValidationError('Booking cannot be assigned - already assigned or in wrong status');
    }

    // Grant health data access to provider for this booking
    try {
      await doctorAccessService.grantAccess({
        patientId: booking.patient,
        doctorId: safeProviderId,
        bookingId: booking._id,
        accessLevel: 'READ_WRITE',
        allowedResources: ['HEALTH_RECORD', 'HEALTH_METRIC', 'DOCTOR_NOTE'],
        grantReason: `Assigned to booking ${booking._id}`,
        adminId: safeAdminId,
        adminName: 'System'
      });

      logger.info('Health data access granted to provider', {
        bookingId: booking._id,
        providerId: safeProviderId,
        patientId: booking.patient
      });
    } catch (error) {
      // Roll back assignment — provider can't work without health data access
      await NurseBooking.findByIdAndUpdate(safeBookingId, {
        $set: { status: 'SEARCHING' },
        $unset: { serviceProvider: 1 }
      }, VALIDATED_QUERY_UPDATE_OPTIONS);

      logger.error('Provider assignment rolled back - access grant failed', {
        bookingId: booking._id,
        providerId: safeProviderId,
        error: error.message
      });

      throw new ValidationError('Failed to grant health data access. Assignment rolled back.');
    }

    // Invalidate cache after all operations complete
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
  async updateStatus(bookingId, newStatus, userId, note = '', userRole) {
    const safeBookingId = normalizeObjectId(bookingId, 'booking id');
    const safeUserId = normalizeObjectId(userId, 'user id');
    const booking = await NurseBooking.findById(safeBookingId);

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

    // Authorization check — role passed from controller, no extra DB query needed
    const isProvider = booking.serviceProvider && booking.serviceProvider.toString() === safeUserId.toString();
    const isAdmin = userRole === 'admin';

    if (!isProvider && !isAdmin) {
      throw new AuthorizationError('Not authorized to update booking status');
    }

    // Update status
    const oldStatus = booking.status;
    booking.status = newStatus;

    // Set timestamps for specific statuses
    if (newStatus === 'IN_PROGRESS') {
      booking.actualService.startTime = new Date();
    } else if (newStatus === 'COMPLETED') {
      if (!booking.actualService.startTime) {
        throw new ValidationError('Cannot complete booking without a start time. Ensure booking was marked IN_PROGRESS first.');
      }
      booking.actualService.endTime = new Date();
      booking.actualService.duration = Math.round(
        (booking.actualService.endTime - booking.actualService.startTime) / (1000 * 60)
      );
    } else if (newStatus === 'CANCELLED') {
      booking.cancellation = {
        cancelledAt: new Date(),
        cancelledBy: resolveCancellationActor({ userRole, isProvider }),
        cancelledByUser: safeUserId,
        reason: note
      };
    }

    await booking.save();

    // Invalidate cache
    await invalidateCache('*:/api/bookings*');

    logger.info('Booking Status Updated', {
      bookingId: booking._id,
      oldStatus,
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
  async completeService(bookingId, providerId, serviceReport = {}) {
    const safeBookingId = normalizeObjectId(bookingId, 'booking id');
    const safeProviderId = normalizeObjectId(providerId, 'provider id');
    const booking = await NurseBooking.findById(safeBookingId);

    if (!booking) {
      throw new NotFoundError('Booking', bookingId);
    }

    // Authorization check
    if (booking.serviceProvider.toString() !== safeProviderId.toString()) {
      throw new AuthorizationError('Only assigned provider can complete the service');
    }

    if (booking.status !== 'IN_PROGRESS') {
      throw new ValidationError('Service must be in progress to complete');
    }

    const endTime = new Date();
    const duration = booking.actualService?.startTime
      ? Math.round((endTime - booking.actualService.startTime) / (1000 * 60))
      : null;
    const completionUpdate = {
      $set: {
        status: 'COMPLETED',
        'completionAccounting.appliedAt': endTime,
        'statusTimestamps.completedAt': endTime,
        'actualService.serviceReport': serviceReport,
        'actualService.endTime': endTime,
        'actualService.duration': duration
      }
    };
    const vitals = buildCompletionVitals(serviceReport);
    const shouldCaptureHealthRecord = Boolean(serviceReport.observations || serviceReport.recommendations);

    let completedBooking;
    const claimCompletion = async (session) => {
      const queryOptions = session
        ? { ...VALIDATED_QUERY_UPDATE_OPTIONS, session }
        : VALIDATED_QUERY_UPDATE_OPTIONS;
      completedBooking = await NurseBooking.findOneAndUpdate(
        {
          _id: booking._id,
          serviceProvider: safeProviderId,
          status: 'IN_PROGRESS'
        },
        completionUpdate,
        queryOptions
      );
      if (!completedBooking) return;

      const updatedPatient = await Patient.findByIdAndUpdate(booking.patient, {
        $inc: {
          totalBookings: 1,
          totalSpent: booking.pricing.payableAmount
        }
      }, queryOptions);
      if (!updatedPatient) {
        throw new NotFoundError('Patient', booking.patient);
      }

      if (vitals.length > 0) {
        await healthMetricService.recordMultipleMetrics(booking.patient, vitals, {
          type: 'BOOKING',
          bookingId: booking._id,
          providerId
        }, session ? { session } : undefined);
      }

      if (shouldCaptureHealthRecord) {
        await healthRecordService.captureBookingVitals(
          booking.patient,
          booking._id,
          serviceReport,
          providerId,
          session ? { session } : undefined
        );
      }

      if (session) {
        await BookingCompletionOutbox.create([{
          booking: booking._id,
          patient: booking.patient,
          status: 'COMPLETED',
          completedAt: endTime,
          lastError: null
        }], { session });
      }
    };

    // In connected environments the completion claim, patient accounting, and
    // reconciliation outbox are committed together. Unit tests and offline
    // tooling use the same guarded writes without opening a network session.
    if (mongoose.connection.readyState === 1) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(() => claimCompletion(session));
      } finally {
        await session.endSession();
      }
    } else {
      await claimCompletion();
    }

    if (!completedBooking) {
      throw new ValidationError('Service has already been completed or is no longer in progress');
    }

    if (vitals.length > 0) {
      logger.info('Health metrics captured from booking', {
        bookingId: booking._id,
        patientId: booking.patient,
        metricsCount: vitals.length
      });
    }

    if (shouldCaptureHealthRecord) {
      logger.info('Booking observations captured to health record', {
        bookingId: booking._id,
        patientId: booking.patient
      });
    }

    // Legacy post-commit side-effect path is intentionally disabled. Completion
    // side effects are now part of the guarded transaction above.
    const warnings = [];

    if (vitals.length < 0 && serviceReport.vitalsChecked) {
      const legacyVitals = [];

      // Map vitals from service report to health metrics
      if (serviceReport.vitalsChecked.bloodPressure) {
        const [systolic, diastolic] = serviceReport.vitalsChecked.bloodPressure.split('/').map(Number);
        if (systolic) legacyVitals.push({ metricType: 'BP_SYSTOLIC', value: systolic, unit: 'mmHg' });
        if (diastolic) legacyVitals.push({ metricType: 'BP_DIASTOLIC', value: diastolic, unit: 'mmHg' });
      }
      if (serviceReport.vitalsChecked.heartRate) {
        legacyVitals.push({ metricType: 'HEART_RATE', value: serviceReport.vitalsChecked.heartRate, unit: 'bpm' });
      }
      if (serviceReport.vitalsChecked.temperature) {
        legacyVitals.push({ metricType: 'TEMPERATURE', value: serviceReport.vitalsChecked.temperature, unit: 'celsius' });
      }
      if (serviceReport.vitalsChecked.oxygenLevel) {
        legacyVitals.push({ metricType: 'OXYGEN_LEVEL', value: serviceReport.vitalsChecked.oxygenLevel, unit: '%' });
      }
      if (serviceReport.vitalsChecked.bloodSugar) {
        legacyVitals.push({ metricType: 'BLOOD_SUGAR', value: serviceReport.vitalsChecked.bloodSugar, unit: 'mg/dL' });
      }

      if (legacyVitals.length > 0) {
        try {
          await healthMetricService.recordMultipleMetrics(booking.patient, legacyVitals, {
            type: 'BOOKING',
            bookingId: booking._id,
            providerId
          });

          logger.info('Health metrics captured from booking', {
            bookingId: booking._id,
            patientId: booking.patient,
            metricsCount: legacyVitals.length
          });
        } catch (error) {
          logger.error('Failed to capture health metrics from booking — data preserved in service report', {
            bookingId: booking._id,
            patientId: booking.patient,
            vitalsCount: legacyVitals.length,
            error: error.message
          });
          warnings.push({ type: 'HEALTH_METRICS_FAILED', message: 'Health metrics could not be saved to patient record. Data is preserved in the service report.', error: error.message });
        }
      }
    }

    // Capture observations to health record
    if (!shouldCaptureHealthRecord && (serviceReport.observations || serviceReport.recommendations)) {
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
        logger.error('Failed to capture booking observations — data preserved in service report', {
          bookingId: booking._id,
          error: error.message
        });
        warnings.push({ type: 'OBSERVATIONS_FAILED', message: 'Observations could not be saved to health record. Data is preserved in the service report.', error: error.message });
      }
    }

    if (!completedBooking && mongoose.connection.readyState === 1) {
      await BookingCompletionOutbox.updateOne(
        { booking: booking._id },
        warnings.length > 0
          ? {
            $set: {
              status: 'RETRY_PENDING',
              lastError: warnings.map(warning => warning.error).join('; '),
              nextAttemptAt: new Date(Date.now() + 5 * 60 * 1000)
            },
            $inc: { attemptCount: 1 }
          }
          : {
            $set: {
              status: 'COMPLETED',
              completedAt: new Date(),
              lastError: null
            }
          }
      );
    }

    // Invalidate cache
    await invalidateCache('*:/api/bookings*');

    logger.info('Service Completed', {
      bookingId: booking._id,
      providerId,
      duration,
      warnings: warnings.length > 0 ? warnings : undefined
    });

    const resultSource = completedBooking || booking;
    const result = resultSource.toObject ? resultSource.toObject() : resultSource;
    if (warnings.length > 0) result.warnings = warnings;
    return result;
  }

  /**
   * Recompute provider review aggregates
   * @param {String|ObjectId} providerId - Provider ID
   * @returns {Promise<void>}
   */
  async syncProviderReviewStats(providerId) {
    if (!providerId) {
      return;
    }

    const aggregateProviderId = normalizeObjectId(providerId, 'provider id');

    const reviewStats = await NurseBooking.aggregate([
      {
        $match: {
          serviceProvider: aggregateProviderId,
          'rating.ratedAt': { $exists: true }
        }
      },
      {
        $group: {
          _id: null,
          totalReviews: { $sum: 1 },
          avgRating: { $avg: '$rating.stars' }
        }
      }
    ]);

    const { totalReviews = 0, avgRating = 0 } = reviewStats[0] || {};

    await User.findByIdAndUpdate(
      aggregateProviderId,
      {
        rating: roundToTwoDecimals(avgRating),
        totalReviews
      },
      VALIDATED_QUERY_UPDATE_OPTIONS
    );
  }

  /**
   * Recompute provider review aggregates only when aggregate-driving review fields changed
   * @param {String|ObjectId} providerId - Provider ID
   * @param {Object} previousRating - Previous booking rating snapshot
   * @param {Object} nextRating - Next booking rating snapshot
   * @returns {Promise<boolean>} Whether a recompute was performed
   */
  async syncProviderReviewStatsIfNeeded(providerId, previousRating = {}, nextRating = {}) {
    if (!providerId || !hasReviewAggregateStateChanged(previousRating, nextRating)) {
      return false;
    }

    await this.syncProviderReviewStats(providerId);
    return true;
  }

  /**
   * Add rating and review
   * @param {String} bookingId - Booking ID
   * @param {String} patientId - Patient ID
   * @param {Object} reviewData - Rating and review data
   * @returns {Promise<Object>} Updated booking
   */
  async addReview(bookingId, patientId, reviewData) {
    const safeBookingId = normalizeObjectId(bookingId, 'booking id');
    const safePatientId = normalizeObjectId(patientId, 'patient id');
    const booking = await NurseBooking.findById(safeBookingId);

    if (!booking) {
      throw new NotFoundError('Booking', bookingId);
    }

    // Authorization check
    if (booking.patient.toString() !== safePatientId.toString()) {
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

    const previousRating = { ...booking.rating };

    // Add rating and review
    booking.rating = {
      stars: reviewData.stars,
      comment: reviewData.comment,
      ratedAt: new Date()
    };

    await booking.save();

    await this.syncProviderReviewStatsIfNeeded(booking.serviceProvider, previousRating, booking.rating);

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
   * Update rating and review
   * @param {String} bookingId - Booking ID
   * @param {String} patientId - Patient ID
   * @param {Object} reviewData - Updated rating and review data
   * @returns {Promise<Object>} Updated booking
   */
  async updateReview(bookingId, patientId, reviewData) {
    const safeBookingId = normalizeObjectId(bookingId, 'booking id');
    const safePatientId = normalizeObjectId(patientId, 'patient id');
    const booking = await NurseBooking.findById(safeBookingId);

    if (!booking) {
      throw new NotFoundError('Booking', bookingId);
    }

    if (booking.patient.toString() !== safePatientId.toString()) {
      throw new AuthorizationError('Only the patient can update this review');
    }

    if (booking.status !== 'COMPLETED') {
      throw new ValidationError('Can only update reviews for completed bookings');
    }

    if (!booking.rating.ratedAt) {
      throw new ValidationError('Booking has not been reviewed yet');
    }

    const previousRating = { ...booking.rating };

    booking.rating = {
      ...booking.rating,
      stars: reviewData.stars,
      comment: reviewData.comment
    };

    await booking.save();
    await this.syncProviderReviewStatsIfNeeded(booking.serviceProvider, previousRating, booking.rating);
    await invalidateCache('*:/api/bookings*');

    logger.info('Booking Review Updated', {
      bookingId: booking._id,
      patientId,
      rating: reviewData.stars
    });

    return booking;
  }

  /**
   * Delete rating and review
   * @param {String} bookingId - Booking ID
   * @param {String} patientId - Patient ID
   * @returns {Promise<Object>} Updated booking
   */
  async deleteReview(bookingId, patientId) {
    const safeBookingId = normalizeObjectId(bookingId, 'booking id');
    const safePatientId = normalizeObjectId(patientId, 'patient id');
    const booking = await NurseBooking.findById(safeBookingId);

    if (!booking) {
      throw new NotFoundError('Booking', bookingId);
    }

    if (booking.patient.toString() !== safePatientId.toString()) {
      throw new AuthorizationError('Only the patient can delete this review');
    }

    if (booking.status !== 'COMPLETED') {
      throw new ValidationError('Can only delete reviews for completed bookings');
    }

    if (!booking.rating.ratedAt) {
      throw new ValidationError('Booking has not been reviewed yet');
    }

    const previousRating = { ...booking.rating };

    booking.rating = {};

    await booking.save();
    await this.syncProviderReviewStatsIfNeeded(booking.serviceProvider, previousRating, booking.rating);
    await invalidateCache('*:/api/bookings*');

    logger.info('Booking Review Deleted', {
      bookingId: booking._id,
      patientId
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
  async cancelBooking(bookingId, userId, reason, userRole) {
    const safeBookingId = normalizeObjectId(bookingId, 'booking id');
    const safeUserId = normalizeObjectId(userId, 'user id');
    const booking = await NurseBooking.findById(safeBookingId);

    if (!booking) {
      throw new NotFoundError('Booking', bookingId);
    }

    // Check if booking can be cancelled
    if (['COMPLETED', 'CANCELLED'].includes(booking.status)) {
      throw new ValidationError('Cannot cancel booking in current status');
    }

    // Authorization check — role passed from controller, no extra DB query needed
    const isPatient = booking.patient.toString() === safeUserId.toString();
    const isProvider = booking.serviceProvider && booking.serviceProvider.toString() === safeUserId.toString();
    const isAdmin = userRole === 'admin';

    if (!isPatient && !isProvider && !isAdmin) {
      throw new AuthorizationError('Not authorized to cancel this booking');
    }

    // Update booking
    booking.status = 'CANCELLED';
    booking.cancellation = {
      cancelledAt: new Date(),
      cancelledBy: resolveCancellationActor({ userRole, isPatient, isProvider }),
      cancelledByUser: safeUserId,
      reason
    };

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
        ? roundToTwoDecimals((completedBookings / totalBookings) * 100)
        : 0,
      totalRevenue: revenueData[0]?.totalRevenue || 0,
      platformRevenue: revenueData[0]?.platformRevenue || 0
    };
  }
}

module.exports = new BookingService();
