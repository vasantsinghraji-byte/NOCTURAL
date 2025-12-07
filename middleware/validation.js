const { body, param, query, validationResult } = require('express-validator');
const { ALL_ROLES } = require('../constants');

// Validation error handler
exports.validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.param,
        message: err.msg
      }))
    });
  }
  next();
};

// Auth validation rules
exports.registerValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2-100 characters')
    .matches(/^[a-zA-Z\s]+$/).withMessage('Name can only contain letters and spaces'),

  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Must be a valid email address')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),

  body('role')
    .notEmpty().withMessage('Role is required')
    .isIn(ALL_ROLES).withMessage('Invalid role')
];

exports.loginValidation = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Must be a valid email address')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required')
];

// Duty validation rules
exports.createDutyValidation = [
  body('title')
    .trim()
    .notEmpty().withMessage('Title is required')
    .isLength({ max: 200 }).withMessage('Title too long'),

  body('department')
    .notEmpty().withMessage('Department is required')
    .isIn(['Emergency', 'ICU', 'OPD', 'Surgery', 'General Ward', 'Maternity', 'Pediatrics', 'Psychiatry', 'Other'])
    .withMessage('Invalid department'),

  body('specialty')
    .notEmpty().withMessage('Specialty is required'),

  body('date')
    .notEmpty().withMessage('Date is required')
    .isISO8601().withMessage('Invalid date format'),

  body('startTime')
    .notEmpty().withMessage('Start time is required')
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Invalid time format (HH:MM)'),

  body('endTime')
    .notEmpty().withMessage('End time is required')
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Invalid time format (HH:MM)'),

  body('hourlyRate')
    .isFloat({ min: 0 }).withMessage('Hourly rate must be a positive number'),

  body('totalCompensation')
    .isFloat({ min: 0 }).withMessage('Total compensation must be a positive number')
];

// Application validation
exports.applicationValidation = [
  body('duty')
    .notEmpty().withMessage('Duty ID is required')
    .isMongoId().withMessage('Invalid duty ID'),

  body('coverLetter')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Cover letter too long (max 1000 characters)')
];

// Payment validation
exports.paymentValidation = [
  body('duty')
    .notEmpty().withMessage('Duty ID is required')
    .isMongoId().withMessage('Invalid duty ID'),

  body('doctor')
    .notEmpty().withMessage('Doctor ID is required')
    .isMongoId().withMessage('Invalid doctor ID'),

  body('grossAmount')
    .isFloat({ min: 0 }).withMessage('Gross amount must be a positive number')
];

// MongoDB ID validation
exports.validateMongoId = [
  param('id')
    .isMongoId().withMessage('Invalid ID format')
];

// Sanitize user input
exports.sanitizeInput = (req, res, next) => {
  // Remove any HTML tags from string inputs
  const sanitizeString = (str) => {
    if (typeof str === 'string') {
      return str.replace(/<[^>]*>/g, '');
    }
    return str;
  };

  // Recursively sanitize object (returns new object to avoid mutation errors)
  const sanitizeObject = (obj) => {
    const sanitized = {};
    for (let key in obj) {
      if (typeof obj[key] === 'string') {
        sanitized[key] = sanitizeString(obj[key]);
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitized[key] = sanitizeObject(obj[key]);
      } else {
        sanitized[key] = obj[key];
      }
    }
    return sanitized;
  };

  // Only sanitize req.body as it's mutable
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }

  // Create safe copies of query and params if they exist
  if (req.query && typeof req.query === 'object') {
    req._sanitizedQuery = sanitizeObject(req.query);
  }
  if (req.params && typeof req.params === 'object') {
    req._sanitizedParams = sanitizeObject(req.params);
  }

  next();
};
