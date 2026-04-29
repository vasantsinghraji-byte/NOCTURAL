/**
 * Authentication Validation Schemas
 * Comprehensive input validation for auth endpoints
 */

const { body, param, query, validationResult } = require('express-validator');
const logger = require('../utils/logger');
const {
  REGISTRATION_ROLES,
  FIELD_LIMITS,
  SPECIALIZATIONS,
  EMPLOYMENT_STATUSES,
  SHIFT_PREFERENCES
} = require('../constants/enums');

/**
 * Validation result handler
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    logger.warn('Validation failed', {
      endpoint: req.url,
      errors: errors.array(),
      ip: req.ip
    });

    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.param,
        message: err.msg,
        value: err.value
      }))
    });
  }

  next();
};

/**
 * Register validation
 */
const validateRegister = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength(FIELD_LIMITS.NAME).withMessage(`Name must be between ${FIELD_LIMITS.NAME.min} and ${FIELD_LIMITS.NAME.max} characters`)
    .matches(/^[a-zA-Z\s'-]+$/).withMessage('Name can only contain letters, spaces, hyphens, and apostrophes')
    .escape(),

  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail()
    .isLength({ max: FIELD_LIMITS.EMAIL.max }).withMessage('Email too long')
    .custom((value) => {
      // Block disposable email domains
      const disposableDomains = ['tempmail.com', 'guerrillamail.com', '10minutemail.com'];
      const domain = value.split('@')[1];
      if (disposableDomains.includes(domain)) {
        throw new Error('Disposable email addresses are not allowed');
      }
      return true;
    }),

  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength(FIELD_LIMITS.PASSWORD).withMessage(`Password must be between ${FIELD_LIMITS.PASSWORD.min} and ${FIELD_LIMITS.PASSWORD.max} characters`)
    .matches(FIELD_LIMITS.PASSWORD_PATTERN)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
    .not().matches(/^(.)\1+$/).withMessage('Password cannot be all the same character')
    .not().isIn(['password', 'Password123!', '12345678', 'Aa123456!'])
    .withMessage('Password is too common'),

  body('confirmPassword')
    .notEmpty().withMessage('Please confirm your password')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match');
      }
      return true;
    }),

  body('phone')
    .optional()
    .trim()
    .matches(FIELD_LIMITS.PHONE_E164).withMessage('Invalid phone number format (use E.164 format: +1234567890)'),

  body('role')
    .notEmpty().withMessage('Role is required')
    .isIn(REGISTRATION_ROLES).withMessage('Invalid role'),

  body('dateOfBirth')
    .optional()
    .isISO8601().withMessage('Invalid date format')
    .custom((value) => {
      const dob = new Date(value);
      const age = Math.floor((new Date() - dob) / (365.25 * 24 * 60 * 60 * 1000));
      if (age < 18) {
        throw new Error('You must be at least 18 years old');
      }
      if (age > 120) {
        throw new Error('Invalid date of birth');
      }
      return true;
    }),

  body('agreeToTerms')
    .notEmpty().withMessage('You must agree to the terms and conditions')
    .isBoolean().withMessage('Invalid value for terms agreement')
    .custom((value) => {
      if (value !== true) {
        throw new Error('You must agree to the terms and conditions');
      }
      return true;
    }),

  handleValidationErrors
];

/**
 * Login validation
 */
const validateLogin = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 1, max: 128 }).withMessage('Invalid password'),

  body('rememberMe')
    .optional()
    .isBoolean().withMessage('Remember me must be a boolean'),

  handleValidationErrors
];

/**
 * Forgot password validation
 */
const validateForgotPassword = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),

  handleValidationErrors
];

/**
 * Reset password validation
 */
const validateResetPassword = [
  param('token')
    .notEmpty().withMessage('Reset token is required')
    .isLength({ min: 10, max: 500 }).withMessage('Invalid reset token'),

  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength(FIELD_LIMITS.PASSWORD).withMessage(`Password must be between ${FIELD_LIMITS.PASSWORD.min} and ${FIELD_LIMITS.PASSWORD.max} characters`)
    .matches(FIELD_LIMITS.PASSWORD_PATTERN)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),

  body('confirmPassword')
    .notEmpty().withMessage('Please confirm your password')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match');
      }
      return true;
    }),

  handleValidationErrors
];

/**
 * Change password validation
 */
const validateChangePassword = [
  body('currentPassword')
    .notEmpty().withMessage('Current password is required'),

  body('newPassword')
    .notEmpty().withMessage('New password is required')
    .isLength(FIELD_LIMITS.PASSWORD).withMessage(`Password must be between ${FIELD_LIMITS.PASSWORD.min} and ${FIELD_LIMITS.PASSWORD.max} characters`)
    .matches(FIELD_LIMITS.PASSWORD_PATTERN)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
    .custom((value, { req }) => {
      if (value === req.body.currentPassword) {
        throw new Error('New password must be different from current password');
      }
      return true;
    }),

  body('confirmPassword')
    .notEmpty().withMessage('Please confirm your new password')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Passwords do not match');
      }
      return true;
    }),

  handleValidationErrors
];

/**
 * Verify email validation
 */
const validateVerifyEmail = [
  param('token')
    .notEmpty().withMessage('Verification token is required')
    .isLength({ min: 10, max: 500 }).withMessage('Invalid verification token'),

  handleValidationErrors
];

/**
 * Resend verification email validation
 */
const validateResendVerification = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),

  handleValidationErrors
];

/**
 * OAuth callback validation
 */
const validateOAuthCallback = [
  query('code')
    .notEmpty().withMessage('Authorization code is required')
    .isLength({ min: 10, max: 500 }).withMessage('Invalid authorization code'),

  query('state')
    .optional()
    .isLength({ max: 500 }).withMessage('Invalid state parameter'),

  handleValidationErrors
];

/**
 * Two-factor authentication setup validation
 */
const validate2FASetup = [
  body('password')
    .notEmpty().withMessage('Password is required for 2FA setup'),

  handleValidationErrors
];

/**
 * Two-factor authentication verification validation
 */
const validate2FAVerify = [
  body('token')
    .notEmpty().withMessage('2FA token is required')
    .matches(/^\d{6}$/).withMessage('2FA token must be 6 digits'),

  handleValidationErrors
];

/**
 * Refresh token validation
 */
const validateRefreshToken = [
  body('refreshToken')
    .notEmpty().withMessage('Refresh token is required')
    .isLength({ min: 10, max: 1000 }).withMessage('Invalid refresh token'),

  handleValidationErrors
];

/**
 * Logout validation
 */
const validateLogout = [
  body('allDevices')
    .optional()
    .isBoolean().withMessage('All devices must be a boolean'),

  handleValidationErrors
];

/**
 * Update profile validation
 */
const validateUpdateProfile = [
  body('role')
    .not().exists().withMessage('Role cannot be modified via profile update'),
  body('password')
    .not().exists().withMessage('Use the change-password endpoint to update your password'),
  body('isVerified')
    .not().exists().withMessage('Verification status cannot be modified'),
  body('email')
    .not().exists().withMessage('Email cannot be changed via profile update'),

  body('name')
    .optional()
    .trim()
    .isLength(FIELD_LIMITS.NAME).withMessage(`Name must be between ${FIELD_LIMITS.NAME.min} and ${FIELD_LIMITS.NAME.max} characters`)
    .matches(/^[a-zA-Z\s'-]+$/).withMessage('Name can only contain letters, spaces, hyphens, and apostrophes'),

  body('phone')
    .optional()
    .trim()
    .matches(FIELD_LIMITS.PHONE_E164).withMessage('Invalid phone number format'),

  body('bio')
    .optional()
    .trim()
    .isLength({ max: FIELD_LIMITS.BIO.max }).withMessage('Bio cannot exceed 500 characters'),

  body('professional.mciNumber')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Registration number cannot exceed 100 characters'),
  body('professional.stateMedicalCouncil')
    .optional()
    .trim()
    .isLength({ max: 150 }).withMessage('Registration council cannot exceed 150 characters'),
  body('professional.primarySpecialization')
    .optional()
    .isIn(SPECIALIZATIONS).withMessage('Invalid primary specialization'),
  body('professional.yearsOfExperience')
    .optional()
    .isInt({ min: 0, max: 80 }).withMessage('Years of experience must be between 0 and 80'),
  body('professional.currentEmploymentStatus')
    .optional()
    .isIn(EMPLOYMENT_STATUSES).withMessage('Invalid employment status'),
  body('professional.proceduralSkills')
    .optional()
    .isArray({ max: 50 }).withMessage('Procedural skills must be a list'),
  body('professional.proceduralSkills.*')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Skill cannot exceed 100 characters'),
  body('professional.preferredShiftTimes')
    .optional()
    .isArray({ max: 10 }).withMessage('Preferred times must be a list'),
  body('professional.preferredShiftTimes.*')
    .optional()
    .isIn(SHIFT_PREFERENCES).withMessage('Invalid preferred time'),
  body('professional.serviceRadius')
    .optional()
    .isInt({ min: 5, max: 100 }).withMessage('Service radius must be between 5 and 100 km'),
  body('professional.minimumRate')
    .optional()
    .isInt({ min: 0, max: 100000 }).withMessage('Minimum rate must be a positive amount'),

  body('location.city')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('City cannot exceed 100 characters'),

  body('bankDetails.accountHolderName')
    .optional()
    .trim()
    .isLength({ max: 120 }).withMessage('Account holder name cannot exceed 120 characters'),
  body('bankDetails.accountNumber')
    .optional()
    .trim()
    .matches(/^[0-9]{6,20}$/).withMessage('Invalid bank account number'),
  body('bankDetails.ifscCode')
    .optional()
    .trim()
    .matches(/^[A-Z]{4}0[A-Z0-9]{6}$/i).withMessage('Invalid IFSC code'),
  body('bankDetails.bankName')
    .optional()
    .trim()
    .isLength({ max: 120 }).withMessage('Bank name cannot exceed 120 characters'),
  body('onboardingCompleted')
    .optional()
    .isBoolean().withMessage('Onboarding completed must be a boolean'),

  handleValidationErrors
];

/**
 * Verify phone validation
 */
const validateVerifyPhone = [
  body('phone')
    .notEmpty().withMessage('Phone number is required')
    .matches(/^\+?[1-9]\d{1,14}$/).withMessage('Invalid phone number format'),

  body('code')
    .notEmpty().withMessage('Verification code is required')
    .matches(/^\d{4,6}$/).withMessage('Verification code must be 4-6 digits'),

  handleValidationErrors
];

module.exports = {
  validateRegister,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
  validateChangePassword,
  validateVerifyEmail,
  validateVerifyPhone,
  validateResendVerification,
  validateOAuthCallback,
  validate2FASetup,
  validate2FAVerify,
  validateRefreshToken,
  validateLogout,
  validateUpdateProfile,
  handleValidationErrors
};
