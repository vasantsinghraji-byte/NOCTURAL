/**
 * Health Intake Validation Schemas
 * Input validation for health intake workflow endpoints
 */

const { body, param, query } = require('express-validator');
const { handleValidationErrors } = require('./authValidator');
const { SEVERITY_LEVELS } = require('../constants/healthConstants');

/**
 * Validate intake draft save
 */
const validateSaveIntakeDraft = [
  body('conditions')
    .optional()
    .isArray().withMessage('Conditions must be an array'),

  body('conditions.*.name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 }).withMessage('Condition name must be 2-200 characters'),

  body('allergies')
    .optional()
    .isArray().withMessage('Allergies must be an array'),

  body('allergies.*.allergen')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 }).withMessage('Allergen name must be 2-200 characters'),

  body('currentMedications')
    .optional()
    .isArray().withMessage('Medications must be an array'),

  body('surgeries')
    .optional()
    .isArray().withMessage('Surgeries must be an array'),

  body('familyHistory')
    .optional()
    .isArray().withMessage('Family history must be an array'),

  body('habits')
    .optional()
    .isObject().withMessage('Habits must be an object'),

  body('immunizations')
    .optional()
    .isArray().withMessage('Immunizations must be an array'),

  body('lifestyle')
    .optional()
    .isObject().withMessage('Lifestyle must be an object'),

  handleValidationErrors
];

/**
 * Validate intake submission
 */
const validateSubmitIntake = [
  // At minimum, habits info is required
  body('habits')
    .notEmpty().withMessage('Lifestyle/habits information is required')
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

  body('conditions')
    .optional()
    .isArray().withMessage('Conditions must be an array'),

  body('conditions.*.name')
    .optional()
    .trim()
    .notEmpty().withMessage('Condition name is required')
    .isLength({ min: 2, max: 200 }).withMessage('Condition name must be 2-200 characters'),

  body('conditions.*.severity')
    .optional()
    .isIn(Object.values(SEVERITY_LEVELS)).withMessage('Invalid severity level'),

  body('conditions.*.diagnosedDate')
    .optional()
    .isISO8601().withMessage('Invalid diagnosis date'),

  body('allergies')
    .optional()
    .isArray().withMessage('Allergies must be an array'),

  body('allergies.*.allergen')
    .optional()
    .trim()
    .notEmpty().withMessage('Allergen is required')
    .isLength({ min: 2, max: 200 }).withMessage('Allergen must be 2-200 characters'),

  body('allergies.*.reactionType')
    .optional()
    .trim()
    .isLength({ max: 200 }).withMessage('Reaction type too long'),

  body('allergies.*.severity')
    .optional()
    .isIn(Object.values(SEVERITY_LEVELS)).withMessage('Invalid allergy severity'),

  body('currentMedications')
    .optional()
    .isArray().withMessage('Medications must be an array'),

  body('currentMedications.*.name')
    .optional()
    .trim()
    .notEmpty().withMessage('Medication name is required')
    .isLength({ min: 2, max: 200 }).withMessage('Medication name must be 2-200 characters'),

  body('currentMedications.*.dosage')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Dosage too long'),

  body('currentMedications.*.frequency')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Frequency too long'),

  body('surgeries')
    .optional()
    .isArray().withMessage('Surgeries must be an array'),

  body('surgeries.*.name')
    .optional()
    .trim()
    .notEmpty().withMessage('Surgery name is required')
    .isLength({ min: 2, max: 200 }).withMessage('Surgery name must be 2-200 characters'),

  body('surgeries.*.date')
    .optional()
    .isISO8601().withMessage('Invalid surgery date'),

  body('surgeries.*.hospital')
    .optional()
    .trim()
    .isLength({ max: 200 }).withMessage('Hospital name too long'),

  body('familyHistory')
    .optional()
    .isArray().withMessage('Family history must be an array'),

  body('familyHistory.*.relation')
    .optional()
    .isIn(['FATHER', 'MOTHER', 'SIBLING', 'GRANDPARENT', 'UNCLE_AUNT', 'OTHER'])
    .withMessage('Invalid relation'),

  body('familyHistory.*.condition')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 }).withMessage('Condition must be 2-200 characters'),

  body('immunizations')
    .optional()
    .isArray().withMessage('Immunizations must be an array'),

  body('immunizations.*.name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 }).withMessage('Immunization name must be 2-200 characters'),

  body('immunizations.*.dateGiven')
    .optional()
    .isISO8601().withMessage('Invalid immunization date'),

  handleValidationErrors
];

/**
 * Validate intake ID param
 */
const validateIntakeId = [
  param('intakeId')
    .notEmpty().withMessage('Intake ID is required')
    .isMongoId().withMessage('Invalid intake ID'),

  handleValidationErrors
];

/**
 * Validate assign reviewer
 */
const validateAssignReviewer = [
  param('intakeId')
    .notEmpty().withMessage('Intake ID is required')
    .isMongoId().withMessage('Invalid intake ID'),

  body('doctorId')
    .notEmpty().withMessage('Doctor ID is required')
    .isMongoId().withMessage('Invalid doctor ID'),

  handleValidationErrors
];

/**
 * Validate intake approval
 */
const validateApproveIntake = [
  param('intakeId')
    .notEmpty().withMessage('Intake ID is required')
    .isMongoId().withMessage('Invalid intake ID'),

  body('reviewNotes')
    .optional()
    .trim()
    .isLength({ max: 2000 }).withMessage('Review notes too long'),

  handleValidationErrors
];

/**
 * Validate request changes
 */
const validateRequestChanges = [
  param('intakeId')
    .notEmpty().withMessage('Intake ID is required')
    .isMongoId().withMessage('Invalid intake ID'),

  body('changesRequired')
    .isArray({ min: 1 }).withMessage('At least one change request is required'),

  body('changesRequired.*.field')
    .trim()
    .notEmpty().withMessage('Field is required for each change')
    .isLength({ max: 100 }).withMessage('Field name too long'),

  body('changesRequired.*.message')
    .trim()
    .notEmpty().withMessage('Message is required for each change')
    .isLength({ min: 10, max: 500 }).withMessage('Message must be 10-500 characters'),

  body('notes')
    .optional()
    .trim()
    .isLength({ max: 2000 }).withMessage('Notes too long'),

  handleValidationErrors
];

/**
 * Validate reject intake
 */
const validateRejectIntake = [
  param('intakeId')
    .notEmpty().withMessage('Intake ID is required')
    .isMongoId().withMessage('Invalid intake ID'),

  body('rejectionReason')
    .trim()
    .notEmpty().withMessage('Rejection reason is required')
    .isLength({ min: 20, max: 1000 }).withMessage('Rejection reason must be 20-1000 characters'),

  handleValidationErrors
];

/**
 * Validate pending intakes query
 */
const validatePendingIntakesQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),

  query('status')
    .optional()
    .isIn(['PENDING_PATIENT', 'PENDING_REVIEW', 'CHANGES_REQUESTED'])
    .withMessage('Invalid status'),

  query('assignedOnly')
    .optional()
    .isBoolean().withMessage('assignedOnly must be a boolean'),

  handleValidationErrors
];

module.exports = {
  validateSaveIntakeDraft,
  validateSubmitIntake,
  validateIntakeId,
  validateAssignReviewer,
  validateApproveIntake,
  validateRequestChanges,
  validateRejectIntake,
  validatePendingIntakesQuery
};
