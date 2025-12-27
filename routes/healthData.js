/**
 * Health Data Routes
 *
 * Routes for health records and metrics endpoints.
 * All routes require patient authentication.
 */

const express = require('express');
const router = express.Router();
const { protectPatient } = require('../middleware/patientAuth');
const { auditHealthAccess, verifyPatientSelfAccess } = require('../middleware/healthDataAccess');
const healthDataController = require('../controllers/healthDataController');
const {
  validateHealthRecordUpdate,
  validateRecordMetric,
  validateRecordMultipleMetrics,
  validateGetMetrics
} = require('../validators/healthDataValidator');
const { ALLOWED_RESOURCES, AUDIT_ACTIONS } = require('../constants/healthConstants');

// All routes require patient authentication
router.use(protectPatient);

// ==================== Health Records ====================

/**
 * @route   GET /api/v1/health-records/latest
 * @desc    Get latest approved health record
 * @access  Private (Patient)
 */
router.get(
  '/latest',
  auditHealthAccess(ALLOWED_RESOURCES.HEALTH_RECORD, AUDIT_ACTIONS.VIEW),
  healthDataController.getLatestRecord
);

/**
 * @route   GET /api/v1/health-records/history
 * @desc    Get health record version history
 * @access  Private (Patient)
 */
router.get(
  '/history',
  auditHealthAccess(ALLOWED_RESOURCES.HEALTH_RECORD, AUDIT_ACTIONS.VIEW),
  healthDataController.getRecordHistory
);

/**
 * @route   GET /api/v1/health-records/version/:version
 * @desc    Get specific record version
 * @access  Private (Patient)
 */
router.get(
  '/version/:version',
  auditHealthAccess(ALLOWED_RESOURCES.HEALTH_RECORD, AUDIT_ACTIONS.VIEW),
  healthDataController.getRecordByVersion
);

/**
 * @route   POST /api/v1/health-records
 * @desc    Append health record update
 * @access  Private (Patient)
 */
router.post(
  '/',
  verifyPatientSelfAccess,
  validateHealthRecordUpdate,
  auditHealthAccess(ALLOWED_RESOURCES.HEALTH_RECORD, AUDIT_ACTIONS.UPDATE),
  healthDataController.appendHealthUpdate
);

/**
 * @route   GET /api/v1/health-records/notes
 * @desc    Get patient's visible doctor notes
 * @access  Private (Patient)
 */
router.get(
  '/notes',
  auditHealthAccess(ALLOWED_RESOURCES.DOCTOR_NOTE, AUDIT_ACTIONS.VIEW),
  healthDataController.getPatientNotes
);

// ==================== Health Metrics ====================

/**
 * @route   GET /api/v1/health-records/metrics
 * @desc    Get health metrics
 * @access  Private (Patient)
 */
router.get(
  '/metrics',
  validateGetMetrics,
  auditHealthAccess(ALLOWED_RESOURCES.HEALTH_METRIC, AUDIT_ACTIONS.VIEW),
  healthDataController.getMetrics
);

/**
 * @route   GET /api/v1/health-records/metrics/latest
 * @desc    Get latest metrics by type
 * @access  Private (Patient)
 */
router.get(
  '/metrics/latest',
  auditHealthAccess(ALLOWED_RESOURCES.HEALTH_METRIC, AUDIT_ACTIONS.VIEW),
  healthDataController.getLatestMetrics
);

/**
 * @route   POST /api/v1/health-records/metrics
 * @desc    Record a health metric
 * @access  Private (Patient)
 */
router.post(
  '/metrics',
  verifyPatientSelfAccess,
  validateRecordMetric,
  auditHealthAccess(ALLOWED_RESOURCES.HEALTH_METRIC, AUDIT_ACTIONS.CREATE),
  healthDataController.recordMetric
);

/**
 * @route   POST /api/v1/health-records/metrics/batch
 * @desc    Record multiple metrics
 * @access  Private (Patient)
 */
router.post(
  '/metrics/batch',
  verifyPatientSelfAccess,
  validateRecordMultipleMetrics,
  auditHealthAccess(ALLOWED_RESOURCES.HEALTH_METRIC, AUDIT_ACTIONS.CREATE),
  healthDataController.recordMultipleMetrics
);

module.exports = router;
