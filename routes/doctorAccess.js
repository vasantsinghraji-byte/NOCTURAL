/**
 * Doctor Access Routes
 *
 * Routes for doctor access control and audit logging.
 * Includes doctor, patient, admin, and public endpoints.
 */

const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { protectPatient } = require('../middleware/patientAuth');
const {
  validateHealthAccess,
  checkNotePermission,
  auditHealthAccess,
  rateLimitHealthAccess
} = require('../middleware/healthDataAccess');
const doctorAccessController = require('../controllers/doctorAccessController');
const { validatePatientId, validateDoctorNote } = require('../validators/healthDataValidator');
const { ALLOWED_RESOURCES, AUDIT_ACTIONS } = require('../constants/healthConstants');

// ==================== Doctor/Provider Endpoints ====================

/**
 * @route   GET /api/v1/doctor-access/my-tokens
 * @desc    Get doctor's active access tokens
 * @access  Private (Doctor/Nurse/Physiotherapist)
 */
router.get(
  '/my-tokens',
  protect,
  authorize('doctor', 'nurse', 'physiotherapist'),
  doctorAccessController.getMyAccessTokens
);

/**
 * @route   GET /api/v1/doctor-access/patients/:patientId
 * @desc    View patient data (requires valid access token)
 * @access  Private (Doctor/Nurse/Physiotherapist - with token)
 */
router.get(
  '/patients/:patientId',
  protect,
  authorize('doctor', 'nurse', 'physiotherapist'),
  validatePatientId,
  validateHealthAccess(ALLOWED_RESOURCES.HEALTH_RECORD),
  rateLimitHealthAccess(100, 60 * 60 * 1000), // 100 requests per hour per patient
  auditHealthAccess(ALLOWED_RESOURCES.HEALTH_RECORD, AUDIT_ACTIONS.VIEW),
  doctorAccessController.getPatientData
);

/**
 * @route   GET /api/v1/doctor-access/patients/:patientId/records
 * @desc    Get patient's health records
 * @access  Private (Doctor/Nurse/Physiotherapist - with token)
 */
router.get(
  '/patients/:patientId/records',
  protect,
  authorize('doctor', 'nurse', 'physiotherapist'),
  validatePatientId,
  validateHealthAccess(ALLOWED_RESOURCES.HEALTH_RECORD),
  rateLimitHealthAccess(100, 60 * 60 * 1000),
  auditHealthAccess(ALLOWED_RESOURCES.HEALTH_RECORD, AUDIT_ACTIONS.VIEW),
  doctorAccessController.getPatientRecords
);

/**
 * @route   GET /api/v1/doctor-access/patients/:patientId/metrics
 * @desc    Get patient's health metrics
 * @access  Private (Doctor/Nurse/Physiotherapist - with token)
 */
router.get(
  '/patients/:patientId/metrics',
  protect,
  authorize('doctor', 'nurse', 'physiotherapist'),
  validatePatientId,
  validateHealthAccess(ALLOWED_RESOURCES.HEALTH_METRIC),
  rateLimitHealthAccess(100, 60 * 60 * 1000),
  auditHealthAccess(ALLOWED_RESOURCES.HEALTH_METRIC, AUDIT_ACTIONS.VIEW),
  doctorAccessController.getPatientMetrics
);

/**
 * @route   POST /api/v1/doctor-access/patients/:patientId/notes
 * @desc    Add doctor note for patient
 * @access  Private (Doctor - with write token)
 */
router.post(
  '/patients/:patientId/notes',
  protect,
  authorize('doctor'),
  validateDoctorNote,
  checkNotePermission,
  auditHealthAccess(ALLOWED_RESOURCES.DOCTOR_NOTE, AUDIT_ACTIONS.CREATE),
  doctorAccessController.addDoctorNote
);

// ==================== Patient Endpoints ====================

/**
 * @route   GET /api/v1/doctor-access/who-has-access
 * @desc    See who has access to patient's data
 * @access  Private (Patient)
 */
router.get(
  '/who-has-access',
  protectPatient,
  doctorAccessController.getWhoHasAccess
);

/**
 * @route   POST /api/v1/doctor-access/revoke/:tokenId
 * @desc    Revoke doctor access (by patient)
 * @access  Private (Patient)
 */
router.post(
  '/revoke/:tokenId',
  protectPatient,
  doctorAccessController.revokeAccessByPatient
);

/**
 * @route   GET /api/v1/doctor-access/my-access-history
 * @desc    Get patient's access history
 * @access  Private (Patient)
 */
router.get(
  '/my-access-history',
  protectPatient,
  doctorAccessController.getMyAccessHistory
);

// ==================== Admin Endpoints ====================

/**
 * @route   POST /api/v1/doctor-access/grant
 * @desc    Grant doctor access to patient
 * @access  Private (Admin)
 */
router.post(
  '/grant',
  protect,
  authorize('admin'),
  doctorAccessController.grantAccess
);

/**
 * @route   POST /api/v1/doctor-access/revoke-admin/:tokenId
 * @desc    Revoke doctor access (by admin)
 * @access  Private (Admin)
 */
router.post(
  '/revoke-admin/:tokenId',
  protect,
  authorize('admin'),
  doctorAccessController.revokeAccessByAdmin
);

/**
 * @route   GET /api/v1/doctor-access/audit-logs
 * @desc    View all access logs
 * @access  Private (Admin)
 */
router.get(
  '/audit-logs',
  protect,
  authorize('admin'),
  doctorAccessController.getAuditLogs
);

/**
 * @route   GET /api/v1/doctor-access/stats
 * @desc    Get access statistics
 * @access  Private (Admin)
 */
router.get(
  '/stats',
  protect,
  authorize('admin'),
  doctorAccessController.getAccessStats
);

// ==================== Public Endpoint ====================

/**
 * @route   GET /api/v1/emergency/:qrToken
 * @desc    Get emergency data via QR token (public access)
 * @access  Public
 */
router.get(
  '/emergency/:qrToken',
  doctorAccessController.getEmergencyData
);

module.exports = router;
