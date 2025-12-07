/**
 * Authentication Validation Schemas
 * Comprehensive input validation for auth endpoints
 */

const { body, param, query, validationResult } = require('express-validator');
const logger = require('../utils/logger');

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
    .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s'-]+$/).withMessage('Name can only contain letters, spaces, hyphens, and apostrophes')
    .escape(),

  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail()
    .isLength({ max: 255 }).withMessage('Email too long')
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
    .isLength({ min: 8, max: 128 }).withMessage('Password must be between 8 and 128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]/)
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
    .matches(/^\+?[1-9]\d{1,14}$/).withMessage('Invalid phone number format (use E.164 format: +1234567890)'),

  body('role')
    .notEmpty().withMessage('Role is required')
    .isIn(['doctor', 'nurse', 'physiotherapist', 'patient']).withMessage('Invalid role'),

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
    .isLength({ min: 8, max: 128 }).withMessage('Password must be between 8 and 128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]/)
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
    .isLength({ min: 8, max: 128 }).withMessage('Password must be between 8 and 128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]/)
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
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s'-]+$/).withMessage('Name can only contain letters, spaces, hyphens, and apostrophes'),

  body('phone')
    .optional()
    .trim()
    .matches(/^\+?[1-9]\d{1,14}$/).withMessage('Invalid phone number format'),

  body('bio')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Bio cannot exceed 500 characters'),

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
