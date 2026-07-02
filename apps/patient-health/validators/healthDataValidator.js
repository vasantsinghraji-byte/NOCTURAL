/**
 * Health Data Validation Schemas
 * Input validation for health data endpoints
 */

const { body, param, query } = require('express-validator');
const { handleValidationErrors } = require('./authValidator');
const { METRIC_TYPES, ANALYTICS_PERIODS, ALLERGY_SEVERITY, CONDITION_SEVERITY } = require('../constants/healthConstants');

/**
 * Validate health metric recording
 */
const validateRecordMetric = [
  body('metricType')
    .notEmpty().withMessage('Metric type is required')
    .isIn(Object.values(METRIC_TYPES)).withMessage('Invalid metric type'),

  body('value')
    .notEmpty().withMessage('Value is required')
    .isFloat().withMessage('Value must be a number')
    .custom((value, { req }) => {
      // Validate reasonable ranges for each metric type
      const type = req.body.metricType;
      const ranges = {
        [METRIC_TYPES.BP_SYSTOLIC]: { min: 50, max: 300 },
        [METRIC_TYPES.BP_DIASTOLIC]: { min: 30, max: 200 },
        [METRIC_TYPES.HEART_RATE]: { min: 20, max: 250 },
        [METRIC_TYPES.TEMPERATURE]: { min: 30, max: 45 },
        [METRIC_TYPES.OXYGEN]: { min: 50, max: 100 },
        [METRIC_TYPES.BLOOD_SUGAR]: { min: 20, max: 600 },
        [METRIC_TYPES.WEIGHT]: { min: 1, max: 500 },
        [METRIC_TYPES.HEIGHT]: { min: 30, max: 300 },
        [METRIC_TYPES.BMI]: { min: 5, max: 100 }
      };

      if (ranges[type]) {
        if (value < ranges[type].min || value > ranges[type].max) {
          throw new Error(`${type} value must be between ${ranges[type].min} and ${ranges[type].max}`);
        }
      }
      return true;
    }),

  body('unit')
    .optional()
    .trim()
    .isLength({ max: 20 }).withMessage('Unit too long'),

  body('measuredAt')
    .optional()
    .isISO8601().withMessage('Invalid date format')
    .custom((value) => {
      const date = new Date(value);
      const now = new Date();
      if (date > now) {
        throw new Error('Measurement date cannot be in the future');
      }
      // Not more than 1 year in the past
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      if (date < oneYearAgo) {
        throw new Error('Measurement date cannot be more than 1 year in the past');
      }
      return true;
    }),

  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Notes too long'),

  handleValidationErrors
];

/**
 * Validate multiple metrics recording
 */
const validateRecordMultipleMetrics = [
  body('metrics')
    .isArray({ min: 1, max: 10 }).withMessage('Metrics must be an array with 1-10 items'),

  body('metrics.*.metricType')
    .notEmpty().withMessage('Metric type is required for each metric')
    .isIn(Object.values(METRIC_TYPES)).withMessage('Invalid metric type'),

  body('metrics.*.value')
    .notEmpty().withMessage('Value is required for each metric')
    .isFloat().withMessage('Value must be a number'),

  body('metrics.*.measuredAt')
    .optional()
    .isISO8601().withMessage('Invalid date format'),

  handleValidationErrors
];

/**
 * Validate health record update
 */
const validateHealthRecordUpdate = [
  body('conditions')
    .optional()
    .isArray().withMessage('Conditions must be an array'),

  body('conditions.*.name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 }).withMessage('Condition name must be 2-200 characters'),

  body('conditions.*.severity')
    .optional()
    .isIn(Object.values(CONDITION_SEVERITY)).withMessage('Invalid severity level'),

  body('allergies')
    .optional()
    .isArray().withMessage('Allergies must be an array'),

  body('allergies.*.allergen')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 }).withMessage('Allergen name must be 2-200 characters'),

  body('allergies.*.severity')
    .optional()
    .isIn(Object.values(ALLERGY_SEVERITY)).withMessage('Invalid allergy severity'),

  body('currentMedications')
    .optional()
    .isArray().withMessage('Medications must be an array'),

  body('currentMedications.*.name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 }).withMessage('Medication name must be 2-200 characters'),

  body('currentMedications.*.dosage')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Dosage too long'),

  body('surgeries')
    .optional()
    .isArray().withMessage('Surgeries must be an array'),

  body('surgeries.*.name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 }).withMessage('Surgery name must be 2-200 characters'),

  body('familyHistory')
    .optional()
    .isArray().withMessage('Family history must be an array'),

  body('habits')
    .optional()
    .isObject().withMessage('Habits must be an object'),

  body('habits.smokingStatus')
    .optional()
    .isIn(['NEVER', 'FORMER', 'CURRENT', 'OCCASIONAL']).withMessage('Invalid smoking status'),

  body('habits.alcoholConsumption')
    .optional()
    .isIn(['NONE', 'OCCASIONAL', 'MODERATE', 'HEAVY']).withMessage('Invalid alcohol consumption'),

  body('habits.exerciseFrequency')
    .optional()
    .isIn(['NEVER', 'RARELY', 'WEEKLY', 'DAILY']).withMessage('Invalid exercise frequency'),

  body('habits.dietType')
    .optional()
    .isIn(['VEGETARIAN', 'NON_VEGETARIAN', 'VEGAN', 'PESCATARIAN', 'OTHER']).withMessage('Invalid diet type'),

  handleValidationErrors
];

/**
 * Validate health analytics query
 */
const validateAnalyticsQuery = [
  query('metricTypes')
    .optional()
    .custom((value) => {
      const types = Array.isArray(value) ? value : value.split(',');
      const validTypes = Object.values(METRIC_TYPES);
      const invalid = types.filter(t => !validTypes.includes(t));
      if (invalid.length > 0) {
        throw new Error(`Invalid metric types: ${invalid.join(', ')}`);
      }
      return true;
    }),

  query('period')
    .optional()
    .isIn(Object.values(ANALYTICS_PERIODS)).withMessage('Invalid period'),

  query('startDate')
    .optional()
    .isISO8601().withMessage('Invalid start date format'),

  query('endDate')
    .optional()
    .isISO8601().withMessage('Invalid end date format')
    .custom((value, { req }) => {
      if (req.query.startDate && new Date(value) < new Date(req.query.startDate)) {
        throw new Error('End date must be after start date');
      }
      return true;
    }),

  handleValidationErrors
];

/**
 * Validate get metrics query
 */
const validateGetMetrics = [
  query('metricType')
    .optional()
    .isIn(Object.values(METRIC_TYPES)).withMessage('Invalid metric type'),

  query('startDate')
    .optional()
    .isISO8601().withMessage('Invalid start date'),

  query('endDate')
    .optional()
    .isISO8601().withMessage('Invalid end date'),

  query('abnormalOnly')
    .optional()
    .isBoolean().withMessage('abnormalOnly must be a boolean'),

  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),

  handleValidationErrors
];

/**
 * Validate patient ID param
 */
const validatePatientId = [
  param('patientId')
    .notEmpty().withMessage('Patient ID is required')
    .isMongoId().withMessage('Invalid patient ID'),

  handleValidationErrors
];

/**
 * Validate record ID param
 */
const validateRecordId = [
  param('recordId')
    .notEmpty().withMessage('Record ID is required')
    .isMongoId().withMessage('Invalid record ID'),

  handleValidationErrors
];

/**
 * Validate metric ID param
 */
const validateMetricId = [
  param('metricId')
    .notEmpty().withMessage('Metric ID is required')
    .isMongoId().withMessage('Invalid metric ID'),

  handleValidationErrors
];

/**
 * Validate emergency QR generation
 */
const validateGenerateQR = [
  body('expiryHours')
    .optional()
    .isInt({ min: 1, max: 72 }).withMessage('Expiry must be between 1 and 72 hours'),

  handleValidationErrors
];

/**
 * Validate doctor note creation
 */
const validateDoctorNote = [
  param('patientId')
    .notEmpty().withMessage('Patient ID is required')
    .isMongoId().withMessage('Invalid patient ID'),

  body('noteType')
    .notEmpty().withMessage('Note type is required')
    .isIn(['CONSULTATION', 'OBSERVATION', 'RECOMMENDATION', 'PRESCRIPTION', 'INTAKE_REVIEW', 'FOLLOW_UP'])
    .withMessage('Invalid note type'),

  body('title')
    .trim()
    .notEmpty().withMessage('Title is required')
    .isLength({ min: 3, max: 200 }).withMessage('Title must be 3-200 characters'),

  body('content')
    .trim()
    .notEmpty().withMessage('Content is required')
    .isLength({ min: 10, max: 5000 }).withMessage('Content must be 10-5000 characters'),

  body('diagnosis')
    .optional()
    .isArray().withMessage('Diagnosis must be an array'),

  body('diagnosis.*.code')
    .optional()
    .trim()
    .isLength({ max: 20 }).withMessage('Diagnosis code too long'),

  body('diagnosis.*.description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Diagnosis description too long'),

  body('prescriptions')
    .optional()
    .isArray().withMessage('Prescriptions must be an array'),

  body('prescriptions.*.medication')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 }).withMessage('Medication name must be 2-200 characters'),

  body('isConfidential')
    .optional()
    .isBoolean().withMessage('isConfidential must be a boolean'),

  handleValidationErrors
];

/**
 * Validate timeline query
 */
const validateTimelineQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),

  query('startDate')
    .optional()
    .isISO8601().withMessage('Invalid start date'),

  query('endDate')
    .optional()
    .isISO8601().withMessage('Invalid end date'),

  handleValidationErrors
];

/**
 * Validate booking history query
 */
const validateBookingHistoryQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),

  query('status')
    .optional()
    .isIn(['REQUESTED', 'SEARCHING', 'ASSIGNED', 'CONFIRMED', 'EN_ROUTE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
    .withMessage('Invalid status'),

  query('startDate')
    .optional()
    .isISO8601().withMessage('Invalid start date'),

  query('endDate')
    .optional()
    .isISO8601().withMessage('Invalid end date'),

  handleValidationErrors
];

module.exports = {
  validateRecordMetric,
  validateRecordMultipleMetrics,
  validateHealthRecordUpdate,
  validateAnalyticsQuery,
  validateGetMetrics,
  validatePatientId,
  validateRecordId,
  validateMetricId,
  validateGenerateQR,
  validateDoctorNote,
  validateTimelineQuery,
  validateBookingHistoryQuery
};
