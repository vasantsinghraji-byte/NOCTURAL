/**
 * User Profile Validation Schemas
 */

const { body, param, query } = require('express-validator');
const { handleValidationErrors } = require('./authValidator');

/**
 * Update profile validation
 */
const validateUpdateProfile = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s'-]+$/).withMessage('Name can only contain letters, spaces, hyphens, and apostrophes'),

  body('phone')
    .optional()
    .trim()
    .matches(/^\+?[1-9]\d{1,14}$/).withMessage('Invalid phone number format'),

  body('dateOfBirth')
    .optional()
    .isISO8601().withMessage('Invalid date format'),

  body('gender')
    .optional()
    .isIn(['male', 'female', 'other', 'prefer_not_to_say']).withMessage('Invalid gender'),

  body('address.street')
    .optional()
    .trim()
    .isLength({ max: 200 }).withMessage('Street address too long'),

  body('address.city')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('City name too long'),

  body('address.state')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('State name too long'),

  body('address.zipCode')
    .optional()
    .trim()
    .matches(/^\d{5,6}$/).withMessage('Invalid ZIP code'),

  body('professional.mciNumber')
    .optional()
    .trim()
    .isLength({ max: 50 }).withMessage('MCI number too long'),

  body('professional.primarySpecialization')
    .optional()
    .isString().withMessage('Primary specialization must be a string'),

  body('professional.yearsOfExperience')
    .optional()
    .isInt({ min: 0, max: 70 }).withMessage('Years of experience must be between 0 and 70'),

  body('professional.serviceRadius')
    .optional()
    .isInt({ min: 1, max: 500 }).withMessage('Service radius must be between 1 and 500 km'),

  body('professional.minimumRate')
    .optional()
    .isFloat({ min: 0, max: 10000 }).withMessage('Minimum rate must be between 0 and 10000'),

  handleValidationErrors
];

/**
 * Upload document validation
 */
const validateUploadDocument = [
  body('documentType')
    .notEmpty().withMessage('Document type is required')
    .isIn(['mciCertificate', 'photoId', 'mbbsDegree', 'additionalCertificate'])
    .withMessage('Invalid document type'),

  body('name')
    .optional()
    .trim()
    .isLength({ max: 200 }).withMessage('Document name too long'),

  handleValidationErrors
];

/**
 * Update bank details validation
 */
const validateUpdateBankDetails = [
  body('accountHolderName')
    .trim()
    .notEmpty().withMessage('Account holder name is required')
    .isLength({ max: 100 }).withMessage('Account holder name too long'),

  body('accountNumber')
    .trim()
    .notEmpty().withMessage('Account number is required')
    .matches(/^\d{9,18}$/).withMessage('Invalid account number format'),

  body('ifscCode')
    .trim()
    .notEmpty().withMessage('IFSC code is required')
    .matches(/^[A-Z]{4}0[A-Z0-9]{6}$/).withMessage('Invalid IFSC code format'),

  body('bankName')
    .trim()
    .notEmpty().withMessage('Bank name is required')
    .isLength({ max: 100 }).withMessage('Bank name too long'),

  body('branchName')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Branch name too long'),

  body('panCard')
    .optional()
    .trim()
    .matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/).withMessage('Invalid PAN card format'),

  body('gstNumber')
    .optional()
    .trim()
    .matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
    .withMessage('Invalid GST number format'),

  handleValidationErrors
];

/**
 * Get user validation
 */
const validateGetUser = [
  param('id')
    .notEmpty().withMessage('User ID is required')
    .isMongoId().withMessage('Invalid user ID'),

  handleValidationErrors
];

/**
 * Search users validation
 */
const validateSearchUsers = [
  query('role')
    .optional()
    .isIn(['doctor', 'nurse', 'physiotherapist', 'patient', 'admin', 'hospital'])
    .withMessage('Invalid role'),

  query('specialty')
    .optional()
    .isString().withMessage('Specialty must be a string'),

  query('location')
    .optional()
    .trim()
    .isLength({ max: 200 }).withMessage('Location search too long'),

  query('radius')
    .optional()
    .isInt({ min: 1, max: 500 }).withMessage('Radius must be between 1 and 500 km'),

  query('minExperience')
    .optional()
    .isInt({ min: 0 }).withMessage('Minimum experience must be positive'),

  query('minRating')
    .optional()
    .isFloat({ min: 0, max: 5 }).withMessage('Minimum rating must be between 0 and 5'),

  query('availability')
    .optional()
    .isBoolean().withMessage('Availability must be a boolean'),

  query('verified')
    .optional()
    .isBoolean().withMessage('Verified must be a boolean'),

  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),

  handleValidationErrors
];

/**
 * Update notification settings validation
 */
const validateUpdateNotificationSettings = [
  body('email')
    .optional()
    .isBoolean().withMessage('Email notification setting must be a boolean'),

  body('sms')
    .optional()
    .isBoolean().withMessage('SMS notification setting must be a boolean'),

  body('push')
    .optional()
    .isBoolean().withMessage('Push notification setting must be a boolean'),

  body('newShifts')
    .optional()
    .isBoolean().withMessage('New shifts notification setting must be a boolean'),

  body('applicationStatus')
    .optional()
    .isBoolean().withMessage('Application status notification setting must be a boolean'),

  body('payments')
    .optional()
    .isBoolean().withMessage('Payments notification setting must be a boolean'),

  body('reviews')
    .optional()
    .isBoolean().withMessage('Reviews notification setting must be a boolean'),

  handleValidationErrors
];

/**
 * Deactivate account validation
 */
const validateDeactivateAccount = [
  body('password')
    .notEmpty().withMessage('Password is required to deactivate account'),

  body('reason')
    .trim()
    .notEmpty().withMessage('Reason for deactivation is required')
    .isLength({ min: 10, max: 500 }).withMessage('Reason must be between 10 and 500 characters'),

  body('feedback')
    .optional()
    .trim()
    .isLength({ max: 2000 }).withMessage('Feedback too long'),

  handleValidationErrors
];

module.exports = {
  validateUpdateProfile,
  validateUploadDocument,
  validateUpdateBankDetails,
  validateGetUser,
  validateSearchUsers,
  validateUpdateNotificationSettings,
  validateDeactivateAccount
};
