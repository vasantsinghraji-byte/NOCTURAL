/**
 * Health Intake Routes
 *
 * Routes for health intake workflow.
 * Includes patient, doctor, and admin endpoints.
 */

const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { protectPatient } = require('../middleware/patientAuth');
const { checkIntakeAssignment, auditHealthAccess } = require('../middleware/healthDataAccess');
const healthIntakeController = require('../controllers/healthIntakeController');
const {
  validateSaveIntakeDraft,
  validateSubmitIntake,
  validateIntakeId,
  validateAssignReviewer,
  validateApproveIntake,
  validateRequestChanges,
  validateRejectIntake,
  validatePendingIntakesQuery
} = require('../validators/healthIntakeValidator');
const { ALLOWED_RESOURCES, AUDIT_ACTIONS } = require('../constants/healthConstants');

// ==================== Patient Endpoints ====================

/**
 * @route   GET /api/v1/health-intake/status
 * @desc    Get current intake status
 * @access  Private (Patient)
 */
router.get(
  '/status',
  protectPatient,
  healthIntakeController.getIntakeStatus
);

/**
 * @route   GET /api/v1/health-intake/form
 * @desc    Get intake form with any existing draft
 * @access  Private (Patient)
 */
router.get(
  '/form',
  protectPatient,
  healthIntakeController.getIntakeForm
);

/**
 * @route   POST /api/v1/health-intake/draft
 * @desc    Save intake draft
 * @access  Private (Patient)
 */
router.post(
  '/draft',
  protectPatient,
  validateSaveIntakeDraft,
  healthIntakeController.saveIntakeDraft
);

/**
 * @route   POST /api/v1/health-intake/submit
 * @desc    Submit intake for review
 * @access  Private (Patient)
 */
router.post(
  '/submit',
  protectPatient,
  validateSubmitIntake,
  auditHealthAccess(ALLOWED_RESOURCES.HEALTH_RECORD, AUDIT_ACTIONS.CREATE),
  healthIntakeController.submitIntake
);

// ==================== Doctor Endpoints ====================

/**
 * @route   GET /api/v1/health-intake/my-reviews
 * @desc    Get intakes assigned to this doctor
 * @access  Private (Doctor)
 */
router.get(
  '/my-reviews',
  protect,
  authorize('doctor'),
  healthIntakeController.getMyPendingIntakes
);

/**
 * @route   GET /api/v1/health-intake/:intakeId
 * @desc    Get intake details for review
 * @access  Private (Doctor - assigned only)
 */
router.get(
  '/:intakeId',
  protect,
  authorize('doctor', 'admin'),
  validateIntakeId,
  checkIntakeAssignment,
  auditHealthAccess(ALLOWED_RESOURCES.HEALTH_RECORD, AUDIT_ACTIONS.VIEW),
  healthIntakeController.getIntakeDetails
);

/**
 * @route   POST /api/v1/health-intake/:intakeId/approve
 * @desc    Approve intake
 * @access  Private (Doctor - assigned only)
 */
router.post(
  '/:intakeId/approve',
  protect,
  authorize('doctor'),
  validateApproveIntake,
  checkIntakeAssignment,
  auditHealthAccess(ALLOWED_RESOURCES.HEALTH_RECORD, AUDIT_ACTIONS.UPDATE),
  healthIntakeController.approveIntake
);

/**
 * @route   POST /api/v1/health-intake/:intakeId/request-changes
 * @desc    Request changes on intake
 * @access  Private (Doctor - assigned only)
 */
router.post(
  '/:intakeId/request-changes',
  protect,
  authorize('doctor'),
  validateRequestChanges,
  checkIntakeAssignment,
  auditHealthAccess(ALLOWED_RESOURCES.HEALTH_RECORD, AUDIT_ACTIONS.UPDATE),
  healthIntakeController.requestChanges
);

/**
 * @route   POST /api/v1/health-intake/:intakeId/reject
 * @desc    Reject intake
 * @access  Private (Doctor - assigned only)
 */
router.post(
  '/:intakeId/reject',
  protect,
  authorize('doctor'),
  validateRejectIntake,
  checkIntakeAssignment,
  auditHealthAccess(ALLOWED_RESOURCES.HEALTH_RECORD, AUDIT_ACTIONS.UPDATE),
  healthIntakeController.rejectIntake
);

// ==================== Admin Endpoints ====================

/**
 * @route   GET /api/v1/health-intake/pending
 * @desc    Get all pending intakes
 * @access  Private (Admin)
 */
router.get(
  '/admin/pending',
  protect,
  authorize('admin'),
  validatePendingIntakesQuery,
  healthIntakeController.getPendingIntakes
);

/**
 * @route   POST /api/v1/health-intake/:intakeId/assign
 * @desc    Assign doctor to review intake
 * @access  Private (Admin)
 */
router.post(
  '/:intakeId/assign',
  protect,
  authorize('admin'),
  validateAssignReviewer,
  healthIntakeController.assignReviewer
);

/**
 * @route   GET /api/v1/health-intake/admin/stats
 * @desc    Get intake statistics
 * @access  Private (Admin)
 */
router.get(
  '/admin/stats',
  protect,
  authorize('admin'),
  healthIntakeController.getIntakeStats
);

module.exports = router;
