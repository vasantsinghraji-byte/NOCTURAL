/**
 * Booking Routes
 *
 * API routes for nurse/physiotherapist booking operations
 * Booking creation, status updates, reviews, and management
 */

const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { validate } = require('@nocturnal/shared').validation;
const { authorize } = require('@nocturnal/shared').auth;
const { protectBoth } = require('../middleware/patientAuth');
const idempotency = require('@nocturnal/shared').idempotency;
const { queryCache } = require('@nocturnal/shared').queryCache;
const { CACHE_TTL } = require('../constants');
const { BOOKING_SERVICE_TYPES, BOOKING_STATUSES, CARE_SUPPLY_SOURCES } = require('../constants/enums');
const {
  createBooking,
  getBooking,
  getAllBookings,
  getMyBookings,
  getProviderBookings,
  getAssignableProviders,
  assignProvider,
  updateStatus,
  startService,
  completeService,
  addReview,
  updateReview,
  deleteReview,
  cancelBooking,
  getBookingStats,
  confirmBooking,
  markEnRoute,
  updateLocation,
  getTracking,
  getMyOffer,
  acceptOffer,
  declineOffer,
  raiseSos
} = require('../controllers/bookingController');

// Validation rules
const createBookingValidation = [
  body('scheduledTimezone')
    .notEmpty()
    .withMessage('Scheduled timezone is required')
    .custom((value) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
        return true;
      } catch (_error) {
        throw new Error('Scheduled timezone must be a valid IANA timezone', { cause: _error });
      }
    }),
  body('serviceType')
    .notEmpty()
    .withMessage('Service type is required')
    .isIn(BOOKING_SERVICE_TYPES)
    .withMessage('Invalid service type'),
  body('scheduledDate')
    .notEmpty()
    .withMessage('Scheduled date is required')
    .isISO8601()
    .withMessage('Invalid date format'),
  body('scheduledTime')
    .notEmpty()
    .withMessage('Scheduled time is required')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Invalid time format (use HH:MM)'),
  body('scheduledTimezoneOffsetMinutes')
    .notEmpty()
    .withMessage('Scheduled timezone offset is required')
    .isInt({ min: -840, max: 840 })
    .withMessage('Scheduled timezone offset must be between -840 and 840 minutes'),
  body('serviceLocation.address.street')
    .trim()
    .notEmpty()
    .withMessage('Service location street is required'),
  body('serviceLocation.address.city')
    .trim()
    .notEmpty()
    .withMessage('Service location city is required'),
  body('serviceLocation.address.pincode')
    .trim()
    .notEmpty()
    .withMessage('Pincode is required')
    .matches(/^\d{6}$/)
    .withMessage('Please provide a valid 6-digit pincode'),
  body('serviceLocation.address.coordinates.lat')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Invalid latitude'),
  body('serviceLocation.address.coordinates.lng')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Invalid longitude'),
  body('patientDetails.name')
    .trim()
    .notEmpty()
    .withMessage('Patient name is required'),
  body('patientDetails.age')
    .isInt({ min: 0, max: 150 })
    .withMessage('Valid patient age is required'),
  body('patientDetails.gender')
    .isIn(['Male', 'Female', 'Other'])
    .withMessage('Valid gender is required'),
  body('isPackage')
    .optional()
    .isBoolean()
    .withMessage('isPackage must be a boolean'),
  body('packageDetails.totalSessions')
    .if(body('isPackage').equals('true'))
    .notEmpty()
    .isInt({ min: 1 })
    .withMessage('Total sessions required for packages'),
  body('packageDetails.frequency')
    .if(body('isPackage').equals('true'))
    .notEmpty()
    .withMessage('Frequency required for packages'),
  // Home-care supplies: per catalog item, who provides it.
  body('supplies')
    .optional()
    .isArray({ max: 20 })
    .withMessage('supplies must be a list'),
  body('supplies.*.key')
    .isString()
    .trim()
    .isLength({ min: 1, max: 60 })
    .withMessage('Each supply needs a key'),
  body('supplies.*.source')
    .isIn(CARE_SUPPLY_SOURCES)
    .withMessage('Each supply needs a valid source'),
  body('suppliesVendorId')
    .optional()
    .isMongoId()
    .withMessage('Invalid pharmacy'),
  body('prescriptionKey')
    .optional()
    .isString()
    .isLength({ max: 300 }),
  body('prescriptionUrl')
    .optional()
    .isString()
    .isLength({ max: 500 }),
  body('mode')
    .optional()
    .isIn(['ASAP', 'SCHEDULED'])
    .withMessage('mode must be ASAP or SCHEDULED'),
  body('preferredGender')
    .optional()
    .isIn(['FEMALE', 'MALE', 'ANY'])
    .withMessage('Invalid preferred gender')
];

const assignProviderValidation = [
  body('providerId')
    .notEmpty()
    .withMessage('Provider ID is required')
    .isMongoId()
    .withMessage('Invalid provider ID')
];

const updateStatusValidation = [
  body('status')
    .notEmpty()
    .withMessage('Status is required')
    .isIn(BOOKING_STATUSES)
    .withMessage('Invalid status'),
  body('note')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Note must not exceed 500 characters')
];

const completeServiceValidation = [
  body('vitalsChecked')
    .optional()
    .isObject()
    .withMessage('Vitals must be an object'),
  body('proceduresDone')
    .optional()
    .isArray()
    .withMessage('Procedures done must be an array'),
  body('observations')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Observations must not exceed 1000 characters'),
  body('recommendations')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Recommendations must not exceed 1000 characters')
];

const reviewValidation = [
  body('stars')
    .notEmpty()
    .withMessage('Rating is required')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5 stars'),
  body('tags')
    .optional()
    .isArray({ max: 6 })
    .withMessage('Up to 6 tags'),
  body('tags.*')
    .optional()
    .isString()
    .isLength({ max: 40 }),
  body('comment')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Comment must not exceed 500 characters')
];

const cancelBookingValidation = [
  body('reason')
    .trim()
    .notEmpty()
    .withMessage('Cancellation reason is required')
    .isLength({ min: 10, max: 500 })
    .withMessage('Reason must be between 10 and 500 characters')
];

const mongoIdValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid booking ID')
];

// Public routes (none - all require authentication)

// Protected routes - require authentication (both patients and providers)
router.use(protectBoth);

// Patient routes - create booking and view own bookings
router.post(
  '/',
  createBookingValidation,
  validate,
  idempotency({ route: 'bookings/create' }),
  createBooking
);

router.get(
  '/patient/me',
  queryCache({ ttl: CACHE_TTL.SHORT }),
  getMyBookings
);

// Provider routes - view assigned bookings
router.get(
  '/provider/me',
  authorize('nurse', 'physiotherapist', 'medical_staff'),
  queryCache({ ttl: CACHE_TTL.SHORT }),
  getProviderBookings
);

router.get(
  '/providers/assignable',
  authorize('admin'),
  queryCache({ ttl: CACHE_TTL.SHORT }),
  getAssignableProviders
);

// Booking detail - accessible by patient, provider, or admin
router.get(
  '/:id',
  mongoIdValidation,
  validate,
  queryCache({ ttl: CACHE_TTL.SHORT }),
  getBooking
);

// Partner app: incoming visit request (Uber-style offer with a countdown).
router.get(
  '/offers/me',
  authorize('nurse', 'physiotherapist', 'medical_staff'),
  getMyOffer
);

router.post(
  '/:id/offer/accept',
  mongoIdValidation,
  validate,
  authorize('nurse', 'physiotherapist', 'medical_staff'),
  acceptOffer
);

router.post(
  '/:id/offer/decline',
  mongoIdValidation,
  validate,
  authorize('nurse', 'physiotherapist', 'medical_staff'),
  declineOffer
);

// Safety: SOS during a visit (patient or assigned provider).
router.post(
  '/:id/sos',
  mongoIdValidation,
  [
    body('lat').optional().isFloat({ min: -90, max: 90 }),
    body('lng').optional().isFloat({ min: -180, max: 180 }),
    body('note').optional().isString().isLength({ max: 300 })
  ],
  validate,
  raiseSos
);

// Live tracking (Uber-style). Not cached: the customer polls for fresh positions.
router.get(
  '/:id/tracking',
  mongoIdValidation,
  validate,
  getTracking
);

router.put(
  '/:id/location',
  mongoIdValidation,
  [
    body('lat').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
    body('lng').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required')
  ],
  validate,
  authorize('nurse', 'physiotherapist', 'medical_staff'),
  updateLocation
);

// Provider actions
router.put(
  '/:id/confirm',
  mongoIdValidation,
  validate,
  authorize('nurse', 'physiotherapist', 'medical_staff'),
  confirmBooking
);

router.put(
  '/:id/en-route',
  mongoIdValidation,
  validate,
  authorize('nurse', 'physiotherapist', 'medical_staff'),
  markEnRoute
);

router.put(
  '/:id/start',
  mongoIdValidation,
  validate,
  authorize('nurse', 'physiotherapist', 'medical_staff'),
  startService
);

router.put(
  '/:id/complete',
  mongoIdValidation,
  completeServiceValidation,
  validate,
  authorize('nurse', 'physiotherapist', 'medical_staff'),
  completeService
);

// Patient actions
router.post(
  '/:id/review',
  mongoIdValidation,
  reviewValidation,
  validate,
  authorize('patient'),
  addReview
);

router.put(
  '/:id/review',
  mongoIdValidation,
  reviewValidation,
  validate,
  authorize('patient'),
  updateReview
);

router.delete(
  '/:id/review',
  mongoIdValidation,
  validate,
  authorize('patient'),
  deleteReview
);

// Cancel booking - patient, provider, or admin
router.put(
  '/:id/cancel',
  mongoIdValidation,
  cancelBookingValidation,
  validate,
  cancelBooking
);

// Admin routes
router.get(
  '/',
  authorize('admin'),
  queryCache({ ttl: CACHE_TTL.SHORT }),
  getAllBookings
);

router.put(
  '/:id/assign',
  mongoIdValidation,
  assignProviderValidation,
  validate,
  authorize('admin'),
  assignProvider
);

router.put(
  '/:id/status',
  mongoIdValidation,
  updateStatusValidation,
  validate,
  authorize('admin', 'nurse', 'physiotherapist', 'medical_staff'),
  updateStatus
);

router.get(
  '/stats/overview',
  authorize('admin'),
  queryCache({ ttl: CACHE_TTL.MEDIUM }),
  getBookingStats
);

module.exports = router;
