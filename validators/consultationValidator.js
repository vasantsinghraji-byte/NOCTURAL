/**
 * Consultation Validators
 */

const { body, param } = require('express-validator');
const { CONSULTATION_TYPES } = require('../constants/enums');

exports.requestConsultationValidation = [
  body('chiefComplaint')
    .trim()
    .notEmpty().withMessage('Please describe your medical concern or symptom')
    .isLength({ min: 5, max: 1000 }).withMessage('Complaint must be between 5 and 1000 characters'),
  body('type')
    .optional()
    .isIn(CONSULTATION_TYPES).withMessage('Invalid consultation type'),
  body('requestedSpecialization')
    .optional()
    .trim()
    .notEmpty().withMessage('Specialization cannot be empty')
];

exports.completeConsultationValidation = [
  param('id')
    .isMongoId().withMessage('Invalid consultation ID'),
  body('assessment.diagnosis')
    .optional()
    .trim(),
  body('prescription.medicines')
    .optional()
    .isArray().withMessage('Medicines must be an array'),
  body('prescription.labTests')
    .optional()
    .isArray().withMessage('Lab tests must be an array')
];

exports.chatMessageValidation = [
  param('id')
    .isMongoId().withMessage('Invalid consultation ID'),
  body('message')
    .trim()
    .notEmpty().withMessage('Message text is required')
    .isLength({ max: 2000 }).withMessage('Message must not exceed 2000 characters')
];
