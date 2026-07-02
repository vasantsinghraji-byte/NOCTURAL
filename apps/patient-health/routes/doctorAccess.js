/**
 * Doctor Access Routes
 *
 * Routes for doctor access control and audit logging.
 * Includes doctor, patient, admin, and public endpoints.
 */

const express = require('express');
const router = express.Router();
const { protect, authorize } = require('@nocturnal/shared').auth;
const { protectPatient } = require('../middleware/patientAuth');
const { emergencyQrLimiter } = require('@nocturnal/shared').rateLimiter;
const {
  validateHealthAccess,
  checkNotePermission,
  auditHealthAccess,
  rateLimitHealthAccess
} = require('../middleware/healthDataAccess');
const doctorAccessController = require('../controllers/doctorAccessController');
const { validatePatientId, validateDoctorNote } = require('../validators/healthDataValidator');
const { ALLOWED_RESOURCES, AUDIT_ACTIONS } = require('../constants/healthConstants');

const copyBodyPatientIdToParams = (req, res, next) => {
  if (req.body && req.body.patientId) {
    req.params.patientId = req.body.patientId;
  }
  next();
};

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

router.post(
  '/patients/read',
  protect,
  authorize('doctor', 'nurse', 'physiotherapist'),
  copyBodyPatientIdToParams,
  validatePatientId,
  validateHealthAccess(ALLOWED_RESOURCES.HEALTH_RECORD),
  rateLimitHealthAccess(100, 60 * 60 * 1000),
  auditHealthAccess(ALLOWED_RESOURCES.HEALTH_RECORD, AUDIT_ACTIONS.VIEW),
  doctorAccessController.getPatientData
);

router.post(
  '/patients/records',
  protect,
  authorize('doctor', 'nurse', 'physiotherapist'),
  copyBodyPatientIdToParams,
  validatePatientId,
  validateHealthAccess(ALLOWED_RESOURCES.HEALTH_RECORD),
  rateLimitHealthAccess(100, 60 * 60 * 1000),
  auditHealthAccess(ALLOWED_RESOURCES.HEALTH_RECORD, AUDIT_ACTIONS.VIEW),
  doctorAccessController.getPatientRecords
);

router.post(
  '/patients/metrics',
  protect,
  authorize('doctor', 'nurse', 'physiotherapist'),
  copyBodyPatientIdToParams,
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

router.post(
  '/audit-logs/search',
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
  emergencyQrLimiter,
  doctorAccessController.getEmergencyData
);

module.exports = router;
