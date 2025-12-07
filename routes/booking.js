/**
 * Booking Routes
 *
 * API routes for nurse/physiotherapist booking operations
 * Booking creation, status updates, reviews, and management
 */

const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { authorize } = require('../middleware/auth');
const { protectBoth } = require('../middleware/patientAuth');
const { queryCache } = require('../middleware/queryCache');
const { CACHE_TTL } = require('../constants');
const {
  createBooking,
  getBooking,
  getAllBookings,
  getMyBookings,
  getProviderBookings,
  assignProvider,
  updateStatus,
  startService,
  completeService,
  addReview,
  cancelBooking,
  getBookingStats,
  confirmBooking,
  markEnRoute
} = require('../controllers/bookingController');

// Validation rules
const createBookingValidation = [
  body('serviceType')
    .notEmpty()
    .withMessage('Service type is required')
    .isIn([
      'INJECTION', 'IV_DRIP', 'WOUND_DRESSING', 'CATHETER_CARE',
      'POST_SURGERY_CARE', 'ELDERLY_CARE', 'BABY_CARE',
      'PHYSIOTHERAPY_SESSION', 'BACK_PAIN_THERAPY', 'KNEE_PAIN_THERAPY',
      'SPORTS_INJURY_THERAPY', 'STROKE_REHAB', 'POST_SURGERY_REHAB',
      'ELDERLY_CARE_PACKAGE', 'POST_SURGERY_PACKAGE', 'PHYSIO_PACKAGE_5',
      'PHYSIO_PACKAGE_10', 'PHYSIO_PACKAGE_15', 'HOME_NURSING_MONTHLY',
      'NEWBORN_CARE_PACKAGE'
    ])
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
  body('serviceLocation.street')
    .trim()
    .notEmpty()
    .withMessage('Service location street is required'),
  body('serviceLocation.city')
    .trim()
    .notEmpty()
    .withMessage('Service location city is required'),
  body('serviceLocation.pincode')
    .trim()
    .notEmpty()
    .withMessage('Pincode is required')
    .matches(/^\d{6}$/)
    .withMessage('Please provide a valid 6-digit pincode'),
  body('serviceLocation.coordinates.lat')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Invalid latitude'),
  body('serviceLocation.coordinates.lng')
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
    .withMessage('Frequency required for packages')
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
    .isIn(['REQUESTED', 'SEARCHING', 'ASSIGNED', 'CONFIRMED', 'EN_ROUTE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
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
  authorize('nurse', 'physiotherapist'),
  queryCache({ ttl: CACHE_TTL.SHORT }),
  getProviderBookings
);

// Booking detail - accessible by patient, provider, or admin
router.get(
  '/:id',
  mongoIdValidation,
  validate,
  queryCache({ ttl: CACHE_TTL.SHORT }),
  getBooking
);

// Provider actions
router.put(
  '/:id/confirm',
  mongoIdValidation,
  validate,
  authorize('nurse', 'physiotherapist'),
  confirmBooking
);

router.put(
  '/:id/en-route',
  mongoIdValidation,
  validate,
  authorize('nurse', 'physiotherapist'),
  markEnRoute
);

router.put(
  '/:id/start',
  mongoIdValidation,
  validate,
  authorize('nurse', 'physiotherapist'),
  startService
);

router.put(
  '/:id/complete',
  mongoIdValidation,
  completeServiceValidation,
  validate,
  authorize('nurse', 'physiotherapist'),
  completeService
);

// Patient actions
router.post(
  '/:id/review',
  mongoIdValidation,
  reviewValidation,
  validate,
  addReview
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
  authorize('admin', 'nurse', 'physiotherapist'),
  updateStatus
);

router.get(
  '/stats/overview',
  authorize('admin'),
  queryCache({ ttl: CACHE_TTL.MEDIUM }),
  getBookingStats
);

module.exports = router;
