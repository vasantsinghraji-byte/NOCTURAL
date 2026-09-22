/**
 * Emergency SOS Validators
 */

const { body, param } = require('express-validator');
const { EMERGENCY_STATUSES } = require('../constants/enums');

const ALLOWED_EMERGENCY_TYPES = [
  'WOUND_BLEEDING', 'FRACTURE_SUSPECTED', 'BREATHING_DIFFICULTY',
  'CHEST_PAIN', 'ALLERGIC_REACTION', 'BURN_INJURY',
  'FAINTING_UNCONSCIOUS', 'SEIZURE', 'DIABETIC_EMERGENCY',
  'IV_DRIP_URGENT', 'INJECTION_URGENT', 'FIRST_AID',
  'OTHER'
];

exports.triggerEmergencyValidation = [
  body('emergencyType')
    .notEmpty().withMessage('Emergency type is required')
    .isIn(ALLOWED_EMERGENCY_TYPES).withMessage('Invalid emergency type'),
  body('patientLocation.coordinates')
    .isArray({ min: 2, max: 2 }).withMessage('Patient location coordinates must be [longitude, latitude]'),
  body('patientLocation.coordinates.*')
    .isFloat().withMessage('Coordinates must be valid numbers'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Description must not exceed 500 characters')
];

exports.updateEmergencyStatusValidation = [
  param('id')
    .isMongoId().withMessage('Invalid emergency booking ID'),
  body('status')
    .notEmpty().withMessage('Status is required')
    .isIn(EMERGENCY_STATUSES).withMessage('Invalid emergency status')
];
