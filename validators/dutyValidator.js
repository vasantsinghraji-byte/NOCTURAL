/**
 * Duty Validation Schemas
 * Comprehensive input validation for duty/shift endpoints
 */

const { body, param, query } = require('express-validator');
const { handleValidationErrors } = require('./authValidator');

/**
 * Create duty validation
 */
const validateCreateDuty = [
  body('title')
    .trim()
    .notEmpty().withMessage('Title is required')
    .isLength({ min: 5, max: 200 }).withMessage('Title must be between 5 and 200 characters')
    .escape(),

  body('hospital')
    .trim()
    .notEmpty().withMessage('Hospital is required')
    .isLength({ max: 200 }).withMessage('Hospital name too long'),

  body('hospitalName')
    .trim()
    .notEmpty().withMessage('Hospital name is required')
    .isLength({ max: 200 }).withMessage('Hospital name too long'),

  body('department')
    .notEmpty().withMessage('Department is required')
    .isIn(['Emergency', 'ICU', 'OPD', 'Surgery', 'General Ward', 'Maternity', 'Pediatrics', 'Psychiatry', 'Other'])
    .withMessage('Invalid department'),

  body('specialty')
    .notEmpty().withMessage('Specialty is required')
    .isIn([
      'Internal Medicine',
      'Emergency Medicine',
      'General Surgery',
      'Anaesthesiology',
      'Intensive Care / Critical Care Medicine',
      'Obstetrics & Gynaecology',
      'Orthopaedics',
      'Urology',
      'Neurosurgery',
      'ENT (Otolaryngology)',
      'Cardiothoracic Surgery',
      'General Paediatrics',
      'Neonatology',
      'General Psychiatry',
      'Radiology',
      'Pathology / Laboratory Medicine',
      'Palliative Medicine',
      'General Medicine',
      'Other'
    ]).withMessage('Invalid specialty'),

  body('description')
    .trim()
    .notEmpty().withMessage('Description is required')
    .isLength({ min: 20, max: 2000 }).withMessage('Description must be between 20 and 2000 characters'),

  body('date')
    .notEmpty().withMessage('Date is required')
    .isISO8601().withMessage('Invalid date format')
    .custom((value) => {
      const dutyDate = new Date(value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (dutyDate < today) {
        throw new Error('Duty date cannot be in the past');
      }

      // Not more than 6 months in the future
      const sixMonthsLater = new Date();
      sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);

      if (dutyDate > sixMonthsLater) {
        throw new Error('Duty date cannot be more than 6 months in the future');
      }

      return true;
    }),

  body('startTime')
    .notEmpty().withMessage('Start time is required')
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Invalid time format (use HH:MM)'),

  body('endTime')
    .notEmpty().withMessage('End time is required')
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Invalid time format (use HH:MM)'),

  body('duration')
    .notEmpty().withMessage('Duration is required')
    .isInt({ min: 1, max: 24 }).withMessage('Duration must be between 1 and 24 hours'),

  body('hourlyRate')
    .notEmpty().withMessage('Hourly rate is required')
    .isFloat({ min: 0, max: 10000 }).withMessage('Hourly rate must be between 0 and 10000'),

  body('overtimeRate')
    .optional()
    .isFloat({ min: 0, max: 15000 }).withMessage('Overtime rate must be between 0 and 15000'),

  body('platformFee')
    .optional()
    .isFloat({ min: 0, max: 50 }).withMessage('Platform fee must be between 0 and 50 percent'),

  body('requirements.minimumExperience')
    .optional()
    .isIn(['0-2 years', '2-5 years', '5+ years', 'Any']).withMessage('Invalid experience requirement'),

  body('requirements.requiredSkills')
    .optional()
    .isArray().withMessage('Required skills must be an array')
    .custom((value) => {
      if (value.length > 20) {
        throw new Error('Too many required skills (max 20)');
      }
      return true;
    }),

  body('requirements.expectedPatientLoad')
    .optional()
    .isIn(['Light', 'Moderate', 'Heavy']).withMessage('Invalid patient load'),

  body('location')
    .trim()
    .notEmpty().withMessage('Location is required')
    .isLength({ max: 500 }).withMessage('Location too long'),

  body('coordinates.lat')
    .optional()
    .isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),

  body('coordinates.lng')
    .optional()
    .isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),

  body('urgency')
    .optional()
    .isIn(['NORMAL', 'URGENT', 'EMERGENCY']).withMessage('Invalid urgency level'),

  body('positionsNeeded')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Positions needed must be between 1 and 100'),

  handleValidationErrors
];

/**
 * Update duty validation
 */
const validateUpdateDuty = [
  param('id')
    .notEmpty().withMessage('Duty ID is required')
    .isMongoId().withMessage('Invalid duty ID'),

  body('title')
    .optional()
    .trim()
    .isLength({ min: 5, max: 200 }).withMessage('Title must be between 5 and 200 characters'),

  body('description')
    .optional()
    .trim()
    .isLength({ min: 20, max: 2000 }).withMessage('Description must be between 20 and 2000 characters'),

  body('hourlyRate')
    .optional()
    .isFloat({ min: 0, max: 10000 }).withMessage('Hourly rate must be between 0 and 10000'),

  body('status')
    .optional()
    .isIn(['OPEN', 'FILLED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).withMessage('Invalid status'),

  handleValidationErrors
];

/**
 * Get duty validation
 */
const validateGetDuty = [
  param('id')
    .notEmpty().withMessage('Duty ID is required')
    .isMongoId().withMessage('Invalid duty ID'),

  handleValidationErrors
];

/**
 * Delete duty validation
 */
const validateDeleteDuty = [
  param('id')
    .notEmpty().withMessage('Duty ID is required')
    .isMongoId().withMessage('Invalid duty ID'),

  handleValidationErrors
];

/**
 * Search duties validation
 */
const validateSearchDuties = [
  query('specialty')
    .optional()
    .isIn([
      'Internal Medicine',
      'Emergency Medicine',
      'General Surgery',
      'Anaesthesiology',
      'Intensive Care / Critical Care Medicine',
      'Obstetrics & Gynaecology',
      'Orthopaedics',
      'Urology',
      'Neurosurgery',
      'ENT (Otolaryngology)',
      'Cardiothoracic Surgery',
      'General Paediatrics',
      'Neonatology',
      'General Psychiatry',
      'Radiology',
      'Pathology / Laboratory Medicine',
      'Palliative Medicine',
      'General Medicine',
      'Other'
    ]).withMessage('Invalid specialty'),

  query('department')
    .optional()
    .isIn(['Emergency', 'ICU', 'OPD', 'Surgery', 'General Ward', 'Maternity', 'Pediatrics', 'Psychiatry', 'Other'])
    .withMessage('Invalid department'),

  query('status')
    .optional()
    .isIn(['OPEN', 'FILLED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
    .withMessage('Invalid status'),

  query('urgency')
    .optional()
    .isIn(['NORMAL', 'URGENT', 'EMERGENCY'])
    .withMessage('Invalid urgency'),

  query('date')
    .optional()
    .isISO8601().withMessage('Invalid date format'),

  query('minRate')
    .optional()
    .isFloat({ min: 0 }).withMessage('Minimum rate must be positive'),

  query('maxRate')
    .optional()
    .isFloat({ min: 0 }).withMessage('Maximum rate must be positive'),

  query('location')
    .optional()
    .trim()
    .isLength({ max: 200 }).withMessage('Location search too long'),

  query('radius')
    .optional()
    .isInt({ min: 1, max: 500 }).withMessage('Radius must be between 1 and 500 km'),

  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),

  query('sort')
    .optional()
    .isIn(['date', '-date', 'hourlyRate', '-hourlyRate', 'createdAt', '-createdAt'])
    .withMessage('Invalid sort option'),

  handleValidationErrors
];

/**
 * Apply to duty validation
 */
const validateApplyToDuty = [
  param('id')
    .notEmpty().withMessage('Duty ID is required')
    .isMongoId().withMessage('Invalid duty ID'),

  body('coverLetter')
    .trim()
    .notEmpty().withMessage('Cover letter is required')
    .isLength({ min: 50, max: 2000 }).withMessage('Cover letter must be between 50 and 2000 characters'),

  body('availability.confirmed')
    .optional()
    .isBoolean().withMessage('Availability confirmation must be a boolean'),

  handleValidationErrors
];

/**
 * Assign doctor to duty validation
 */
const validateAssignDoctor = [
  param('id')
    .notEmpty().withMessage('Duty ID is required')
    .isMongoId().withMessage('Invalid duty ID'),

  body('doctorId')
    .notEmpty().withMessage('Doctor ID is required')
    .isMongoId().withMessage('Invalid doctor ID'),

  body('assignedAt')
    .optional()
    .isISO8601().withMessage('Invalid assignment date'),

  handleValidationErrors
];

/**
 * Cancel duty validation
 */
const validateCancelDuty = [
  param('id')
    .notEmpty().withMessage('Duty ID is required')
    .isMongoId().withMessage('Invalid duty ID'),

  body('reason')
    .trim()
    .notEmpty().withMessage('Cancellation reason is required')
    .isLength({ min: 10, max: 500 }).withMessage('Reason must be between 10 and 500 characters'),

  handleValidationErrors
];

/**
 * Mark duty complete validation
 */
const validateCompleteDuty = [
  param('id')
    .notEmpty().withMessage('Duty ID is required')
    .isMongoId().withMessage('Invalid duty ID'),

  body('actualStartTime')
    .optional()
    .isISO8601().withMessage('Invalid start time'),

  body('actualEndTime')
    .optional()
    .isISO8601().withMessage('Invalid end time'),

  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Notes too long'),

  handleValidationErrors
];

/**
 * Update application status validation
 */
const validateUpdateApplicationStatus = [
  param('id')
    .notEmpty().withMessage('Application ID is required')
    .isMongoId().withMessage('Invalid application ID'),

  body('status')
    .notEmpty().withMessage('Status is required')
    .isIn(['pending', 'accepted', 'rejected', 'cancelled'])
    .withMessage('Invalid status'),

  body('reason')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Reason too long'),

  handleValidationErrors
];

/**
 * Withdraw application validation
 */
const validateWithdrawApplication = [
  param('id')
    .notEmpty().withMessage('Application ID is required')
    .isMongoId().withMessage('Invalid application ID'),

  body('reason')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Reason too long'),

  handleValidationErrors
];

/**
 * Get application validation
 */
const validateGetApplication = [
  param('id')
    .notEmpty().withMessage('Application ID is required')
    .isMongoId().withMessage('Invalid application ID'),

  handleValidationErrors
];

module.exports = {
  validateCreateDuty,
  validateUpdateDuty,
  validateGetDuty,
  validateDeleteDuty,
  validateSearchDuties,
  validateApplyToDuty,
  validateAssignDoctor,
  validateCancelDuty,
  validateCompleteDuty,
  validateUpdateApplicationStatus,
  validateWithdrawApplication,
  validateGetApplication
};
