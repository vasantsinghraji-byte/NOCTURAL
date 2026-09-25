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
const User = require('@nocturnal/shared').User;
const { invalidateCache } = require('@nocturnal/shared').queryCache;
const logger = require('@nocturnal/shared').logger;
const { roundToTwoDecimals } = require('@nocturnal/shared').number;
const { VALIDATED_QUERY_UPDATE_OPTIONS } = require('@nocturnal/shared').queryUpdateOptions;
const { hasReviewAggregateStateChanged } = require('../utils/bookingReviewAggregate');
const { PAGINATION } = require('../constants');
const { SERVICE_TYPE_TO_CATALOG_NAME } = require('@nocturnal/shared').careServices;
const {
  ValidationError,
  AuthorizationError,
  NotFoundError,
  ConflictError
} = require('@nocturnal/shared').errors;
const visitPolicy = require('@nocturnal/shared').careVisitPolicy;

// Health Dashboard integrations
const healthIntakeService = require('./healthIntakeService');
const healthMetricService = require('./healthMetricService');
const healthRecordService = require('./healthRecordService');
const doctorAccessService = require('./doctorAccessService');
const BookingCompletionOutbox = require('../models/bookingCompletionOutbox');
const careSuppliesService = require('@nocturnal/shared').careSuppliesService;
const pricingService = require('@nocturnal/shared').pricingService;
const membershipService = require('@nocturnal/shared').membershipService;
const settlementService = require('@nocturnal/shared').settlementService;
const staffAvailabilityService = require('@nocturnal/shared').staffAvailabilityService;
const dispatchService = require('@nocturnal/shared').dispatchService;
const crypto = require('crypto');
const { normalizeObjectId, nullProtoObject, setSafeField } = require('@nocturnal/shared').safeMongo;

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
  if (visitPolicy.isAdminRole(userRole)) return 'ADMIN';
  if (userRole === 'system') return 'SYSTEM';
  if (isPatient || userRole === 'patient') return 'PATIENT';
  if (isProvider || ['doctor', 'nurse', 'physiotherapist', 'medical_staff'].includes(userRole)) return 'PROVIDER';
  return 'SYSTEM';
};

const TIME_FORMAT_REGEX = /^\d{1,2}:\d{2}$/;

// Live tracking: staff share location only while a visit is active, and a fix
// older than this is treated as stale (phone offline / app closed).
const TRACKABLE_STATUSES = ['CONFIRMED', 'EN_ROUTE', 'IN_PROGRESS'];
const LOCATION_STALE_MS = 5 * 60 * 1000;
const STAFF_SPEED_KMPH = 18; // city two-wheeler average incl. stops

const haversineKm = (a, b) => {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};

const toCoordinate = (value, min, max, name) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new ValidationError(`Invalid ${name}`);
  return n;
};

const resolveCatalogServiceName = (serviceType) => {
  if (!Object.prototype.hasOwnProperty.call(SERVICE_TYPE_TO_CATALOG_NAME, serviceType)) {
    throw new ValidationError('Unsupported service type');
  }
  return SERVICE_TYPE_TO_CATALOG_NAME[serviceType];
};

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
      packageDetails,
      mode,
      preferredGender
    } = bookingData;

    // Verify patient exists
    const patient = await Patient.findById(safePatientId);
    if (!patient) {
      throw new NotFoundError('Patient', patientId);
    }

    // When can this be booked for? "Book now" uses server time so a phone
    // with a wrong clock can't book the past; scheduled visits need a lead time.
    const window = visitPolicy.checkBookingWindow({ mode, scheduledDate, scheduledTime, scheduledTimezoneOffsetMinutes });
    if (window.error) throw new ValidationError(window.error);
    let visitDate = scheduledDate;
    let visitTime = scheduledTime;
    if (window.asap) {
      const offset = Number.isInteger(scheduledTimezoneOffsetMinutes) ? scheduledTimezoneOffsetMinutes : 330;
      const local = new Date(Date.now() + offset * 60000);
      visitDate = local.toISOString().slice(0, 10);
      visitTime = local.toISOString().slice(11, 16);
    }

    // Get service from catalog (match by name which corresponds to serviceType enum)
    // Convert INJECTION → INJECTION_IM mapping
    const serviceName = resolveCatalogServiceName(serviceType);
    const service = await ServiceCatalog.findOne({
      name: serviceName,
      'availability.isActive': true
    });

    if (!service) {
      throw new NotFoundError('Service');
    }

    const availableCities = service.availability?.availableCities || [];
    // The API validates serviceLocation.address.city (the old top-level `city` never existed).
    const requestedCity = serviceLocation?.address?.city || serviceLocation?.city;
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
        scheduledDate: visitDate,
        scheduledTime: visitTime,
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

    // Price upfront (config/revenue.js): platform fee waived for Nabz Plus members.
    const quote = pricingService.quoteCareVisit({ basePrice, isMember: await membershipService.isMember(safePatientId) });
    const { platformFee, gst, totalAmount, discount } = quote;
    // A late-cancellation fee from an earlier visit is added to this bill.
    const previousDues = roundToTwoDecimals(Number(patient.pendingDues) || 0);
    const payableAmount = roundToTwoDecimals(quote.payableAmount + previousDues);

    // Create booking with final pricing in a single operation
    const booking = await NurseBooking.create({
      patient: safePatientId,
      serviceType,
      scheduledDate: visitDate,
      scheduledTime: visitTime,
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
        previousDues,
        payableAmount
      },
      prescriptionUrl: bookingData.prescriptionUrl,
      status: 'REQUESTED',
      dispatch: {
        mode: mode === 'ASAP' ? 'ASAP' : 'SCHEDULED',
        preferredGender: ['FEMALE', 'MALE'].includes(preferredGender) ? preferredGender : 'ANY'
      },
      // Visit code the patient shares at the door (never sent to the provider).
      visitOtp: { code: String(crypto.randomInt(0, 10000)).padStart(4, '0') },
      // Family tracking link token.
      shareToken: crypto.randomBytes(16).toString('hex')
    });

    // Supplies: "I have it" vs "staff brings it" (a linked STAFF_PICKUP pharmacy
    // order). If the staff can't source them, don't leave a half-made booking.
    if (Array.isArray(bookingData.supplies) && bookingData.supplies.length > 0) {
      try {
        const supplies = await careSuppliesService.orderSuppliesForBooking(booking, bookingData.supplies, {
          patientId: safePatientId,
          prescriptionKey: bookingData.prescriptionKey,
          vendorId: bookingData.suppliesVendorId
        });
        if (supplies) {
          booking.supplies = supplies;
          await booking.save();
        }
      } catch (error) {
        await NurseBooking.deleteOne({ _id: booking._id });
        throw error;
      }
    }

    // Dues now travel on this booking (restored if it's cancelled for free).
    if (previousDues > 0) {
      await Patient.updateOne({ _id: safePatientId, pendingDues: patient.pendingDues }, { $set: { pendingDues: 0 } });
    }

    // "Book now": match the nearest online nurse right away (Uber-style).
    if (booking.dispatch && booking.dispatch.mode === 'ASAP') {
      await dispatchService.startDispatch(booking);
    }

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
      .populate('serviceProvider', 'name email phone specialty professional rating totalReviews profilePhoto careProfile.qualification careProfile.languages careProfile.verification.idVerified careProfile.verification.policeVerified careProfile.verification.councilVerified careProfile.verification.vaccinated');

    if (!booking) {
      throw new NotFoundError('Booking', bookingId);
    }

    // Authorization check - only patient, assigned provider, or admin can view
    const isPatient = booking.patient._id.toString() === safeUserId.toString();
    const isProvider = booking.serviceProvider && booking.serviceProvider._id.toString() === safeUserId.toString();
    const isAdmin = visitPolicy.isAdminRole(userRole);

    if (!isPatient && !isProvider && !isAdmin) {
      throw new AuthorizationError('Not authorized to view this booking');
    }

    // Nurses see the customer's phone only around the visit, never the email.
    if (isProvider && !isAdmin && booking.patient && typeof booking.patient === 'object') {
      booking.patient.email = undefined;
      if (!visitPolicy.providerMaySeePhone(booking)) booking.patient.phone = undefined;
    }

    return booking;
  }

  /**
   * Staff app: publish the provider's live location for an active visit.
   * Also refreshes the ETA to the patient's address.
   */
  async updateProviderLocation(bookingId, providerId, { lat, lng }) {
    const safeBookingId = normalizeObjectId(bookingId, 'booking id');
    const safeProviderId = normalizeObjectId(providerId, 'provider id');
    const point = { lat: toCoordinate(lat, -90, 90, 'latitude'), lng: toCoordinate(lng, -180, 180, 'longitude') };
    const now = new Date();

    const booking = await NurseBooking.findOneAndUpdate(
      { _id: safeBookingId, serviceProvider: safeProviderId, status: { $in: TRACKABLE_STATUSES } },
      { $set: { 'tracking.nurseLocation': { ...point, lastUpdated: now } } },
      { new: true }
    );
    if (!booking) {
      throw new ValidationError('Location can only be shared for your active visits');
    }

    const dest = booking.serviceLocation && booking.serviceLocation.address && booking.serviceLocation.address.coordinates;
    let distanceKm = null;
    let estimatedArrival = null;
    if (dest && Number.isFinite(dest.lat) && Number.isFinite(dest.lng)) {
      distanceKm = Math.round(haversineKm(point, dest) * 100) / 100;
      estimatedArrival = new Date(now.getTime() + (Math.ceil((distanceKm / STAFF_SPEED_KMPH) * 60) + 2) * 60 * 1000);
      await NurseBooking.updateOne({ _id: booking._id }, { $set: { 'tracking.estimatedArrival': estimatedArrival } });
    }
    return { lastUpdated: now, distanceKm, estimatedArrival };
  }

  /**
   * Customer app: where is my nurse? Visible to the patient, the assigned
   * provider and admins, and only while the visit is active.
   */
  async getTracking(bookingId, userId, userRole) {
    const booking = await this.getBookingById(bookingId, userId, userRole);
    const loc = booking.tracking && booking.tracking.nurseLocation;
    const active = TRACKABLE_STATUSES.includes(booking.status);
    const fresh = !!(loc && loc.lastUpdated && Date.now() - new Date(loc.lastUpdated).getTime() < LOCATION_STALE_MS);
    const dest = booking.serviceLocation && booking.serviceLocation.address && booking.serviceLocation.address.coordinates;
    const staffLocation = active && fresh && Number.isFinite(loc.lat) ? { lat: loc.lat, lng: loc.lng, lastUpdated: loc.lastUpdated } : null;
    const isPatient = String(booking.patient._id || booking.patient) === String(userId);
    let secrets = {};
    if (isPatient && !['COMPLETED', 'CANCELLED'].includes(booking.status)) {
      const withSecrets = await NurseBooking.findById(booking._id).select('+visitOtp.code +shareToken').lean();
      secrets = {
        visitCode: withSecrets && withSecrets.visitOtp && !withSecrets.visitOtp.verifiedAt ? withSecrets.visitOtp.code : undefined,
        shareToken: withSecrets ? withSecrets.shareToken : undefined
      };
    }
    const sp = booking.serviceProvider;
    return {
      bookingId: booking._id,
      status: booking.status,
      serviceType: booking.serviceType,
      dispatch: booking.dispatch ? { mode: booking.dispatch.mode, status: booking.dispatch.status, attempts: booking.dispatch.attempts } : undefined,
      ...secrets,
      staff: sp ? {
        name: sp.name,
        phone: active ? sp.phone : undefined,
        qualification: sp.careProfile && sp.careProfile.qualification,
        experienceYears: sp.professional && sp.professional.yearsOfExperience,
        languages: (sp.careProfile && sp.careProfile.languages) || [],
        rating: sp.rating || null,
        totalReviews: sp.totalReviews || 0,
        photo: sp.profilePhoto && sp.profilePhoto.url,
        verification: sp.careProfile && sp.careProfile.verification ? {
          id: !!sp.careProfile.verification.idVerified,
          police: !!sp.careProfile.verification.policeVerified,
          council: !!sp.careProfile.verification.councilVerified,
          vaccinated: !!sp.careProfile.verification.vaccinated
        } : {}
      } : null,
      staffLocation,
      destination: dest && Number.isFinite(dest.lat) ? { lat: dest.lat, lng: dest.lng } : null,
      distanceKm: staffLocation && dest && Number.isFinite(dest.lat) ? Math.round(haversineKm(staffLocation, dest) * 100) / 100 : null,
      estimatedArrival: active ? (booking.tracking && booking.tracking.estimatedArrival) || null : null
    };
  }

  /** Check the patient's visit code before a visit starts; locks after 5 misses. */
  async verifyVisitCode(bookingId, code) {
    const booking = await NurseBooking.findById(bookingId).select('+visitOtp.code');
    const otp = booking && booking.visitOtp;
    if (!otp || !otp.code || otp.verifiedAt) return true; // older bookings without a code
    if ((otp.failedAttempts || 0) >= 5) {
      throw new ValidationError('Too many wrong codes. Ask support to start this visit.');
    }
    const given = String(code || '').replace(/\D/g, '');
    const ok = given.length === 4 && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(otp.code));
    if (!ok) {
      await NurseBooking.updateOne({ _id: bookingId }, { $inc: { 'visitOtp.failedAttempts': 1 } });
      logger.logSecurity('visit_code_wrong', { bookingId: String(bookingId) });
      throw new ValidationError('That visit code is not right. Ask the patient for the 4-digit code.');
    }
    await NurseBooking.updateOne({ _id: bookingId }, { $set: { 'visitOtp.verifiedAt': new Date() } });
    return true;
  }

  /** SOS from the patient or the provider during a visit: alert ops immediately. */
  async raiseSos(bookingId, userId, userRole, { lat, lng, note } = {}) {
    const booking = await this.getBookingById(bookingId, userId, userRole);
    const by = String(booking.patient._id || booking.patient) === String(userId) ? 'PATIENT' : 'PROVIDER';
    const entry = { at: new Date(), by, note: note ? String(note).slice(0, 300) : undefined };
    if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) entry.location = { lat: Number(lat), lng: Number(lng) };
    await NurseBooking.updateOne({ _id: booking._id }, { $push: { sos: entry }, $set: { flagged: true, flagReason: `SOS by ${by}` } });
    logger.logSecurity('care_visit_sos', { bookingId: String(booking._id), by });
    try {
      const Notification = require('@nocturnal/shared').Notification;
      const ops = await User.find({ role: 'platform_admin', isActive: { $ne: false } }).select('_id').lean();
      await Promise.all(ops.map((o) => Notification.create({
        user: o._id, recipientModel: 'User', type: 'CARE_SOS', priority: 'URGENT',
        title: `SOS on a home visit (${by.toLowerCase()})`,
        message: `Booking ${booking._id} · ${booking.serviceType}${entry.note ? ` · ${entry.note}` : ''}`,
        metadata: { bookingId: String(booking._id) }, channels: { inApp: true, push: true }
      })));
    } catch (err) {
      logger.error('SOS alert to ops failed', { bookingId: String(booking._id), error: err.message });
    }
    return { received: true, emergencyNumbers: { ambulance: '108', police: '112', women: '1091' } };
  }

  /** Public family-tracking view (link from the patient). Minimal, no contact details. */
  async getSharedTracking(token) {
    const safe = String(token || '');
    if (!/^[a-f0-9]{32}$/.test(safe)) throw new NotFoundError('Tracking link');
    const booking = await NurseBooking.findOne({ shareToken: safe })
      .populate('serviceProvider', 'name careProfile.qualification')
      .lean();
    if (!booking) throw new NotFoundError('Tracking link');
    const active = TRACKABLE_STATUSES.includes(booking.status);
    const loc = booking.tracking && booking.tracking.nurseLocation;
    const fresh = !!(loc && loc.lastUpdated && Date.now() - new Date(loc.lastUpdated).getTime() < LOCATION_STALE_MS);
    return {
      status: booking.status,
      serviceType: booking.serviceType,
      staff: booking.serviceProvider ? {
        firstName: String(booking.serviceProvider.name || '').split(' ')[0],
        qualification: booking.serviceProvider.careProfile && booking.serviceProvider.careProfile.qualification
      } : null,
      staffLocation: active && fresh ? { lat: loc.lat, lng: loc.lng, lastUpdated: loc.lastUpdated } : null,
      estimatedArrival: active ? (booking.tracking && booking.tracking.estimatedArrival) || null : null,
      expired: !active && booking.status !== 'REQUESTED'
    };
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
      // Staff see which store to collect "staff brings" supplies from.
      .populate('supplies.pharmacyVendor', 'name address phone location')
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
    // Only staff who switched "Go online" and are heartbeating are discoverable.
    return User.find({ ...staffAvailabilityService.discoverableFilter(), isActive: true })
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

    const validRoles = ['nurse', 'physiotherapist', 'medical_staff'];
    if (!validRoles.includes(provider.role)) {
      throw new ValidationError('User is not a valid service provider');
    }
    if (!visitPolicy.isVerifiedStaff(provider)) {
      throw new ValidationError('This provider is not verified yet (ID, police and council checks)');
    }
    const target = await NurseBooking.findById(safeBookingId).select('scheduledDate scheduledTime scheduledTimezoneOffsetMinutes').lean();
    if (target) await this.assertNoOverlap(safeProviderId, visitPolicy.visitStart(target) || new Date(), safeBookingId);

    // Atomic: assign provider only if booking is in assignable status
    const booking = await NurseBooking.findOneAndUpdate(
      {
        _id: safeBookingId,
        status: { $in: ['REQUESTED', 'SEARCHING'] }
      },
      {
        $set: {
          serviceProvider: safeProviderId,
          status: 'ASSIGNED',
          // Stop any open offer so dispatch and the booking agree.
          'dispatch.status': 'MATCHED',
          'dispatch.matchedAt': new Date()
        },
        $unset: { 'dispatch.offeredTo': 1, 'dispatch.offerExpiresAt': 1 }
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

    // Visit-scoped health data access (expires a day after the visit).
    try {
      await doctorAccessService.grantForVisit({
        patientId: booking.patient,
        providerId: safeProviderId,
        bookingId: booking._id,
        expiresAt: this.accessExpiry(booking),
        grantedBy: safeAdminId
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
  async updateStatus(bookingId, newStatus, userId, note = '', userRole, extra = {}) {
    const safeBookingId = normalizeObjectId(bookingId, 'booking id');
    const safeUserId = normalizeObjectId(userId, 'user id');
    let booking = await NurseBooking.findById(safeBookingId);

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
    const isAdmin = visitPolicy.isAdminRole(userRole);

    if (!isProvider && !isAdmin) {
      throw new AuthorizationError('Not authorized to update booking status');
    }

    // A nurse who can't make it hands the visit back to dispatch instead of
    // cancelling it on the customer.
    if (newStatus === 'CANCELLED' && isProvider && !isAdmin) {
      return this.releaseVisit(booking._id, safeUserId, note || 'Provider could not make it');
    }
    if (newStatus === 'CANCELLED') {
      return this.cancelBooking(booking._id, safeUserId, note || 'Cancelled by admin', userRole);
    }

    // Starting the visit needs the patient's code (Rapido-style ride OTP).
    if (newStatus === 'IN_PROGRESS' && !isAdmin) {
      await this.verifyVisitCode(booking._id, extra.visitCode);
    }

    // Update status with one compare-and-set on the status we just read, so a
    // customer cancelling at the same moment can't be overwritten (or vice versa).
    const oldStatus = booking.status;
    const now = new Date();
    const set = { status: newStatus };
    if (newStatus === 'IN_PROGRESS') {
      set['actualService.startTime'] = now;
    } else if (newStatus === 'COMPLETED') {
      if (!booking.actualService || !booking.actualService.startTime) {
        throw new ValidationError('Cannot complete booking without a start time. Ensure booking was marked IN_PROGRESS first.');
      }
      set['actualService.endTime'] = now;
      set['actualService.duration'] = Math.round((now - booking.actualService.startTime) / (1000 * 60));
    }
    const updated = await NurseBooking.findOneAndUpdate(
      { _id: booking._id, status: oldStatus, ...(isAdmin ? {} : { serviceProvider: safeUserId }) },
      { $set: set },
      VALIDATED_QUERY_UPDATE_OPTIONS
    );
    if (!updated) throw new ConflictError('This visit just changed (maybe cancelled). Refresh and try again.');
    booking = updated;

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
    // Pay-after-visit: the nurse confirms the cash they collected (visit +
    // any supplies they brought). Older apps don't send it; then the payment
    // simply stays unrecorded as before.
    const cashCollected = serviceReport.cashCollected;
    delete serviceReport.cashCollected;
    const cashFields = {};
    if (cashCollected !== undefined && cashCollected !== null && booking.payment?.status !== 'PAID') {
      const amount = Number(cashCollected);
      if (!Number.isFinite(amount) || amount < 0 || amount > 100000) throw new ValidationError('Enter the cash you collected');
      const suppliesDue = booking.supplies && booking.supplies.status === 'ORDERED' ? Number(booking.supplies.amount) || 0 : 0;
      const due = roundToTwoDecimals((booking.pricing?.payableAmount || 0) + suppliesDue);
      Object.assign(cashFields, {
        'payment.method': 'CASH',
        'payment.status': 'PAID',
        'payment.amount': roundToTwoDecimals(amount),
        'payment.paidAt': endTime,
        'payment.collectedBy': safeProviderId
      });
      if (amount + 1 < due) {
        cashFields.flagged = true;
        cashFields.flagReason = `Cash short: collected ₹${amount} of ₹${due}`;
      }
    }

    const completionUpdate = {
      $set: {
        ...cashFields,
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

    // Book the provider's payout, our commission and the platform fee.
    await settlementService.recordCareBooking(completedBooking);

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
      review: reviewData.comment,
      tags: Array.isArray(reviewData.tags) ? reviewData.tags.slice(0, 6).map((t) => String(t).slice(0, 40)) : [],
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
    let booking = await NurseBooking.findById(safeBookingId);

    if (!booking) {
      throw new NotFoundError('Booking', bookingId);
    }

    // Authorization check — role passed from controller, no extra DB query needed
    const isPatient = booking.patient.toString() === safeUserId.toString();
    const isProvider = booking.serviceProvider && booking.serviceProvider.toString() === safeUserId.toString();
    const isAdmin = visitPolicy.isAdminRole(userRole);

    if (!isPatient && !isProvider && !isAdmin) {
      throw new AuthorizationError('Not authorized to cancel this booking');
    }

    const quote = visitPolicy.cancellationQuote(booking, { role: userRole, isPatient, isProvider });
    if (!quote.allowed) throw new ValidationError(quote.reason || 'Cannot cancel booking in current status');
    // A nurse cancelling hands the visit back to dispatch.
    if (quote.releases && !isAdmin) return this.releaseVisit(booking._id, safeUserId, reason || 'Provider could not make it');

    const now = new Date();
    const cancelled = await NurseBooking.findOneAndUpdate(
      { _id: booking._id, status: booking.status },
      {
        $set: {
          status: 'CANCELLED',
          ...(booking.dispatch && booking.dispatch.status !== 'MATCHED' ? { 'dispatch.status': 'CANCELLED' } : {}),
          cancellation: {
            cancelledAt: now,
            cancelledBy: resolveCancellationActor({ userRole, isPatient, isProvider }),
            cancelledByUser: safeUserId,
            reason,
            cancellationFee: quote.fee || 0
          }
        },
        $unset: { 'dispatch.offeredTo': 1, 'dispatch.offerExpiresAt': 1 }
      },
      VALIDATED_QUERY_UPDATE_OPTIONS
    );
    if (!cancelled) throw new ConflictError('This visit just changed. Refresh and try again.');

    // Late cancellation: the nurse is paid for the trip; the customer's next
    // bill carries the fee. Free cancellations hand back carried-over dues.
    const carried = Number(cancelled.pricing && cancelled.pricing.previousDues) || 0;
    const duesChange = carried + (quote.fee || 0); // unpaid either way: back on the customer's balance
    if (duesChange > 0) await Patient.updateOne({ _id: cancelled.patient }, { $inc: { pendingDues: roundToTwoDecimals(duesChange) } });
    if (quote.fee > 0 && cancelled.serviceProvider) await settlementService.recordCareCancellationFee(cancelled, quote.fee);
    await doctorAccessService.revokeForBooking(cancelled._id, 'Visit cancelled');
    if (cancelled.serviceProvider) {
      await this.notifyUser(cancelled.serviceProvider, 'User', 'Visit cancelled', `The customer cancelled the ${String(cancelled.serviceType).replace(/_/g, ' ').toLowerCase()} visit.${quote.fee > 0 ? ` You'll be paid ₹${quote.fee} for the trip.` : ''}`, cancelled._id);
    }
    booking = cancelled;

    // Release the linked supplies order (restocks the pharmacy) if it isn't packed yet.
    await careSuppliesService.cancelSuppliesForBooking(booking, `Home-care visit cancelled: ${reason || 'no reason given'}`);

    // Invalidate cache
    await invalidateCache('*:/api/bookings*');

    logger.info('Booking Cancelled', {
      bookingId: booking._id,
      cancelledBy: userId,
      reason
    });

    return booking;
  }

  /** What cancelling now would cost this user (shown before they confirm). */
  async getCancellationQuote(bookingId, userId, userRole) {
    const safeBookingId = normalizeObjectId(bookingId, 'booking id');
    const safeUserId = normalizeObjectId(userId, 'user id');
    const booking = await NurseBooking.findById(safeBookingId).lean();
    if (!booking) throw new NotFoundError('Booking', bookingId);
    const isPatient = String(booking.patient) === String(safeUserId);
    const isProvider = booking.serviceProvider && String(booking.serviceProvider) === String(safeUserId);
    if (!isPatient && !isProvider && !visitPolicy.isAdminRole(userRole)) throw new AuthorizationError('Not authorized');
    const quote = visitPolicy.cancellationQuote(booking, { role: userRole, isPatient, isProvider });
    return { allowed: quote.allowed, fee: quote.fee, reason: quote.reason || null };
  }

  /** Health data access lasts until a day after the visit (at least an hour from now). */
  accessExpiry(booking) {
    const start = visitPolicy.visitStart(booking) || new Date();
    return new Date(Math.max(start.getTime() + 24 * 3600000, Date.now() + 3600000));
  }

  /** A provider can't hold two visits at the same time. */
  async assertNoOverlap(providerId, start, exceptBookingId) {
    const nearby = await NurseBooking.find({
      serviceProvider: providerId,
      status: { $in: ['ASSIGNED', 'CONFIRMED', 'EN_ROUTE', 'IN_PROGRESS'] },
      _id: { $ne: exceptBookingId },
      scheduledDate: { $gte: new Date(start.getTime() - 2 * 86400000), $lte: new Date(start.getTime() + 2 * 86400000) }
    }).select('status scheduledDate scheduledTime scheduledTimezoneOffsetMinutes').lean();
    if (nearby.some((b) => visitPolicy.overlaps(b, start))) {
      throw new ConflictError('This provider already has a visit around that time');
    }
  }

  /** In-app + push notice. Never throws. */
  async notifyUser(userId, recipientModel, title, message, bookingId) {
    try {
      const Notification = require('@nocturnal/shared').Notification;
      const pushNotificationService = require('@nocturnal/shared').pushNotificationService;
      await Notification.create({
        user: userId, recipientModel, type: 'CARE_VISIT_UPDATE', priority: 'HIGH', title, message,
        channels: { inApp: true, push: true }, metadata: { bookingId: String(bookingId) },
        expiresAt: new Date(Date.now() + 7 * 86400000)
      });
      await pushNotificationService.sendToOwner({
        owner: userId, userType: recipientModel === 'Patient' ? 'patient' : 'provider', title, body: message,
        data: { type: 'CARE_VISIT_UPDATE', bookingId: String(bookingId) }
      }).catch(() => undefined);
    } catch (err) {
      logger.warn('Visit notice failed', { bookingId: String(bookingId), error: err.message });
    }
  }

  /**
   * The nurse can't make it (or was taken off the platform): the visit goes
   * back to dispatch for someone else, the customer is told, and the nurse's
   * health data access ends. Repeated drops take the nurse offline.
   */
  async releaseVisit(bookingId, providerId, reason = 'Provider could not make it', { byAdmin = false } = {}) {
    const now = new Date();
    const booking = await NurseBooking.findById(bookingId);
    if (!booking) throw new NotFoundError('Booking', bookingId);
    const start = visitPolicy.visitStart(booking) || now;
    const soon = start.getTime() - now.getTime() <= dispatchService.SCHEDULE_LEAD_MS;
    const released = await NurseBooking.findOneAndUpdate(
      {
        _id: booking._id,
        serviceProvider: providerId,
        status: { $in: ['ASSIGNED', 'CONFIRMED', 'EN_ROUTE'] }
      },
      {
        $set: {
          status: 'REQUESTED',
          'dispatch.status': soon ? 'SEARCHING' : 'IDLE',
          'dispatch.startedAt': now,
          'dispatch.attempts': 0
        },
        $unset: { serviceProvider: 1, 'dispatch.matchedAt': 1, 'dispatch.offeredTo': 1, 'dispatch.offerExpiresAt': 1 },
        $addToSet: { 'dispatch.declined': providerId },
        $push: { 'dispatch.dropped': { provider: providerId, at: now, reason: String(reason).slice(0, 200) } }
      },
      VALIDATED_QUERY_UPDATE_OPTIONS
    );
    if (!released) throw new ConflictError('This visit just changed. Refresh and try again.');
    await doctorAccessService.revokeForBooking(released._id, 'Provider released the visit');
    logger.info('Visit released by provider', { bookingId: String(released._id), providerId: String(providerId), reason });

    // Three drops in a week: take them offline so they stop getting offers.
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const drops = await NurseBooking.countDocuments({ 'dispatch.dropped': { $elemMatch: { provider: providerId, at: { $gte: weekAgo } } } });
    if (drops >= 3 && !byAdmin) {
      await User.updateOne({ _id: providerId }, { $set: { isOnline: false, isAvailable: false }, $unset: { currentLocation: 1 } });
      logger.warn('Provider taken offline after repeated drops', { providerId: String(providerId), drops });
    }

    await this.notifyUser(released.patient, 'Patient', 'Finding you another nurse',
      'Your nurse couldn’t make it. We’re matching you with someone else now.', released._id);
    if (soon) await dispatchService.offerNext(released._id).catch(() => undefined);
    await invalidateCache('*:/api/bookings*');
    return released;
  }

  /** Staff lost verification / deactivated: hand back their upcoming visits. */
  async releaseProviderVisits(providerId, reason) {
    const upcoming = await NurseBooking.find({ serviceProvider: providerId, status: { $in: ['ASSIGNED', 'CONFIRMED'] } }).select('_id').lean();
    let released = 0;
    for (const b of upcoming) {
      try {
        await this.releaseVisit(b._id, providerId, reason, { byAdmin: true });
        released += 1;
      } catch (err) {
        logger.error('Could not release visit', { bookingId: String(b._id), error: err.message });
      }
    }
    return released;
  }

  /** Customer moves a visit nobody has taken yet (e.g. after "no nurse available"). */
  async rescheduleBooking(bookingId, patientId, { scheduledDate, scheduledTime, scheduledTimezoneOffsetMinutes }) {
    const safeBookingId = normalizeObjectId(bookingId, 'booking id');
    const safePatientId = normalizeObjectId(patientId, 'patient id');
    const booking = await NurseBooking.findById(safeBookingId).lean();
    if (!booking) throw new NotFoundError('Booking', bookingId);
    if (String(booking.patient) !== String(safePatientId)) throw new AuthorizationError('Not your booking');
    if (booking.status !== 'REQUESTED' || booking.serviceProvider) {
      throw new ValidationError('Only visits that no nurse has taken yet can be moved');
    }
    const offset = Number.isInteger(scheduledTimezoneOffsetMinutes) ? scheduledTimezoneOffsetMinutes : (booking.scheduledTimezoneOffsetMinutes ?? 330);
    const window = visitPolicy.checkBookingWindow({ mode: 'SCHEDULED', scheduledDate, scheduledTime, scheduledTimezoneOffsetMinutes: offset });
    if (window.error) throw new ValidationError(window.error);
    const moved = await NurseBooking.findOneAndUpdate(
      { _id: safeBookingId, status: 'REQUESTED', serviceProvider: null },
      {
        $set: {
          scheduledDate, scheduledTime, scheduledTimezoneOffsetMinutes: offset,
          'dispatch.mode': 'SCHEDULED', 'dispatch.status': 'IDLE', 'dispatch.attempts': 0, 'dispatch.declined': []
        },
        $unset: { 'dispatch.startedAt': 1, 'dispatch.offeredTo': 1, 'dispatch.offerExpiresAt': 1 }
      },
      VALIDATED_QUERY_UPDATE_OPTIONS
    );
    if (!moved) throw new ConflictError('This visit just changed. Refresh and try again.');
    await invalidateCache('*:/api/bookings*');
    return moved;
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
