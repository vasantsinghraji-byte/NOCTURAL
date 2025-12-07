const { validationResult, matchedData } = require('express-validator');
const logger = require('../utils/logger');

/**
 * Middleware to validate request data using express-validator rules
 * @param {Array} validations - Array of express-validator validation chains
 * @param {boolean} sanitize - Whether to sanitize and return only validated data
 */
const validateRequest = (validations, sanitize = true) => {
  return async (req, res, next) => {
    // Run all validations
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Request validation failed', {
        path: req.path,
        errors: errors.array(),
        body: req.body,
        userId: req.user ? req.user._id : 'anonymous'
      });

      return res.status(400).json({
        success: false,
        message: 'Invalid request data',
        errors: errors.array()
      });
    }

    if (sanitize) {
      // Replace request body with only validated data
      req.body = matchedData(req, { locations: ['body'] });
    }

    next();
  };
};

// Common validation patterns
const commonValidations = {
  id: (field = 'id') => body(field)
    .trim()
    .notEmpty()
    .withMessage('ID is required')
    .isMongoId()
    .withMessage('Invalid ID format'),

  email: (field = 'email') => body(field)
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Invalid email format')
    .normalizeEmail(),

  password: (field = 'password') => body(field)
    .trim()
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
    .withMessage('Password must contain uppercase, lowercase, number and special character'),

  phone: (field = 'phone') => body(field)
    .optional()
    .trim()
    .matches(/^\+?[\d\s-()]{10,}$/)
    .withMessage('Invalid phone number format'),

  name: (field = 'name') => body(field)
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s.'-]+$/)
    .withMessage('Name contains invalid characters'),

  date: (field) => body(field)
    .optional()
    .isISO8601()
    .withMessage('Invalid date format')
    .toDate(),

  enum: (field, values) => body(field)
    .trim()
    .notEmpty()
    .withMessage(`${field} is required`)
    .isIn(values)
    .withMessage(`${field} must be one of: ${values.join(', ')}`)
};

module.exports = {
  validateRequest,
  commonValidations
};