/**
 * Patient Routes
 *
 * API routes for patient (B2C customer) operations
 * Authentication, profile management, addresses, medical history
 */

const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { validate } = require('../middleware/validation');
const { protectPatient } = require('../middleware/patientAuth');
const { rejectHoneypotSubmissions } = require('../middleware/spamTrap');
const idempotency = require('../middleware/idempotency');
const {
  register,
  login,
  getMe,
  updateMe,
  addAddress,
  updateAddress,
  deleteAddress,
  addMedicalHistory,
  updateMedicalHabits,
  getBookingStats,
  verifyPassword,
  changePassword,
  listSessions,
  revokeSession,
  revokeAllSessions
} = require('../controllers/patientController');

// Validation rules
const registerValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase, and number'),
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required')
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Please provide a valid 10-digit Indian phone number')
];

const loginValidation = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

const verifyPasswordValidation = [
  body('password')
    .isString().withMessage('Password must be a string')
    .notEmpty().withMessage('Password is required')
];

const changePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8, max: 128 })
    .withMessage('New password must be between 8 and 128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must contain uppercase, lowercase, and number'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.newPassword) {
      throw new Error('Passwords do not match');
    }
    return true;
  }),
  body('webauthnConfirmationId')
    .optional()
    .isMongoId()
    .withMessage('Invalid WebAuthn confirmation ID')
];

const addressValidation = [
  body('label')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Label must be between 2 and 50 characters'),
  body('street')
    .trim()
    .notEmpty()
    .withMessage('Street address is required'),
  body('city')
    .trim()
    .notEmpty()
    .withMessage('City is required'),
  body('state')
    .trim()
    .notEmpty()
    .withMessage('State is required'),
  body('pincode')
    .trim()
    .notEmpty()
    .withMessage('Pincode is required')
    .matches(/^\d{6}$/)
    .withMessage('Please provide a valid 6-digit pincode'),
  body('coordinates.lat')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Invalid latitude'),
  body('coordinates.lng')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Invalid longitude')
];

const medicalHistoryValidation = [
  param('category')
    .isIn(['conditions', 'allergies', 'currentMedications', 'surgeries', 'familyHistory'])
    .withMessage('Invalid medical history category')
];

const mongoIdValidation = [
  param('addressId')
    .isMongoId()
    .withMessage('Invalid address ID')
];

// Public routes
router.post('/register', rejectHoneypotSubmissions, registerValidation, validate, register);
router.post('/login', loginValidation, validate, login);

// Protected routes - require patient authentication
router.use(protectPatient);

// Profile routes
router.route('/me')
  .get(getMe)
  .put(updateMe);

router.get('/me/stats', getBookingStats);
router.post('/me/verify-password', verifyPasswordValidation, validate, verifyPassword);
router.put('/me/change-password', changePasswordValidation, validate, idempotency({ route: 'patients/change-password', required: true }), changePassword);
router.get('/me/sessions', listSessions);
router.delete('/me/sessions/:sessionId', revokeSession);
router.delete('/me/sessions', revokeAllSessions);

// Address routes
router.route('/me/addresses')
  .post(addressValidation, validate, addAddress);

router.route('/me/addresses/:addressId')
  .put(mongoIdValidation, addressValidation, validate, updateAddress)
  .delete(mongoIdValidation, validate, deleteAddress);

// Medical history routes
router.post(
  '/me/medical-history/:category',
  medicalHistoryValidation,
  validate,
  addMedicalHistory
);

router.put('/me/medical-history/habits', updateMedicalHabits);

module.exports = router;
