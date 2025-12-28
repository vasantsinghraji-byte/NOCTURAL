/**
 * Patient Analytics Routes
 *
 * Routes for patient analytics tab:
 * - Investigation reports (upload, AI analysis, doctor review)
 * - Diabetes tracker (RBS, HBA1C readings, charts)
 * - Hypertension tracker (BP readings, charts)
 *
 * All routes require patient authentication.
 */

const express = require('express');
const router = express.Router();
const { protectPatient } = require('../middleware/patientAuth');
const { auditHealthAccess } = require('../middleware/healthDataAccess');
const patientAnalyticsController = require('../controllers/patientAnalyticsController');
const { createReportUpload } = require('../middleware/upload');
const { ALLOWED_RESOURCES, AUDIT_ACTIONS } = require('../constants/healthConstants');

// All routes require patient authentication
router.use(protectPatient);

// =====================
// Analytics Overview
// =====================

/**
 * @route   GET /api/v1/patient-analytics/overview
 * @desc    Get complete analytics overview
 * @access  Private (Patient)
 */
router.get(
  '/overview',
  auditHealthAccess(ALLOWED_RESOURCES.FULL_HISTORY, AUDIT_ACTIONS.VIEW),
  patientAnalyticsController.getAnalyticsOverview
);

// =====================
// Investigation Reports
// =====================

/**
 * @route   GET /api/v1/patient-analytics/reports/summary
 * @desc    Get reports analytics summary
 * @access  Private (Patient)
 */
router.get(
  '/reports/summary',
  patientAnalyticsController.getReportsSummary
);

/**
 * @route   POST /api/v1/patient-analytics/reports
 * @desc    Upload investigation report
 * @access  Private (Patient)
 */
router.post(
  '/reports',
  createReportUpload().array('files', 10),
  patientAnalyticsController.uploadReport
);

/**
 * @route   GET /api/v1/patient-analytics/reports
 * @desc    Get patient's investigation reports
 * @access  Private (Patient)
 */
router.get(
  '/reports',
  patientAnalyticsController.getReports
);

/**
 * @route   GET /api/v1/patient-analytics/reports/:reportId
 * @desc    Get single report details
 * @access  Private (Patient)
 */
router.get(
  '/reports/:reportId',
  patientAnalyticsController.getReportDetails
);

/**
 * @route   POST /api/v1/patient-analytics/reports/:reportId/retry-analysis
 * @desc    Retry failed AI analysis
 * @access  Private (Patient)
 */
router.post(
  '/reports/:reportId/retry-analysis',
  patientAnalyticsController.retryAnalysis
);

/**
 * @route   POST /api/v1/patient-analytics/reports/:reportId/request-review
 * @desc    Request doctor review
 * @access  Private (Patient)
 */
router.post(
  '/reports/:reportId/request-review',
  patientAnalyticsController.requestDoctorReview
);

/**
 * @route   POST /api/v1/patient-analytics/reports/:reportId/questions
 * @desc    Ask question about reviewed report
 * @access  Private (Patient)
 */
router.post(
  '/reports/:reportId/questions',
  patientAnalyticsController.askQuestion
);

/**
 * @route   POST /api/v1/patient-analytics/reports/:reportId/acknowledge
 * @desc    Acknowledge reviewed report
 * @access  Private (Patient)
 */
router.post(
  '/reports/:reportId/acknowledge',
  patientAnalyticsController.acknowledgeReport
);

/**
 * @route   DELETE /api/v1/patient-analytics/reports/:reportId
 * @desc    Delete report
 * @access  Private (Patient)
 */
router.delete(
  '/reports/:reportId',
  patientAnalyticsController.deleteReport
);

/**
 * @route   GET /api/v1/patient-analytics/available-doctors
 * @desc    Get available doctors for review
 * @access  Private (Patient)
 */
router.get(
  '/available-doctors',
  patientAnalyticsController.getAvailableDoctors
);

/**
 * @route   GET /api/v1/patient-analytics/specializations
 * @desc    Get available specializations
 * @access  Private (Patient)
 */
router.get(
  '/specializations',
  patientAnalyticsController.getSpecializations
);

// =====================
// Diabetes Tracker
// =====================

/**
 * @route   GET /api/v1/patient-analytics/diabetes/summary
 * @desc    Get diabetes tracker summary
 * @access  Private (Patient)
 */
router.get(
  '/diabetes/summary',
  auditHealthAccess(ALLOWED_RESOURCES.HEALTH_METRIC, AUDIT_ACTIONS.VIEW),
  patientAnalyticsController.getDiabetesSummary
);

/**
 * @route   GET /api/v1/patient-analytics/diabetes/chart
 * @desc    Get diabetes chart data
 * @access  Private (Patient)
 */
router.get(
  '/diabetes/chart',
  auditHealthAccess(ALLOWED_RESOURCES.HEALTH_METRIC, AUDIT_ACTIONS.VIEW),
  patientAnalyticsController.getDiabetesChart
);

/**
 * @route   POST /api/v1/patient-analytics/diabetes/readings
 * @desc    Record diabetes reading (RBS, HBA1C, etc.)
 * @access  Private (Patient)
 */
router.post(
  '/diabetes/readings',
  auditHealthAccess(ALLOWED_RESOURCES.HEALTH_METRIC, AUDIT_ACTIONS.CREATE),
  patientAnalyticsController.recordDiabetesReading
);

/**
 * @route   PUT /api/v1/patient-analytics/diabetes/targets/:metricType
 * @desc    Update diabetes target
 * @access  Private (Patient)
 */
router.put(
  '/diabetes/targets/:metricType',
  patientAnalyticsController.updateDiabetesTarget
);

/**
 * @route   DELETE /api/v1/patient-analytics/diabetes/targets/:metricType
 * @desc    Reset diabetes target to default
 * @access  Private (Patient)
 */
router.delete(
  '/diabetes/targets/:metricType',
  patientAnalyticsController.resetDiabetesTarget
);

// =====================
// Hypertension Tracker
// =====================

/**
 * @route   GET /api/v1/patient-analytics/hypertension/summary
 * @desc    Get hypertension tracker summary
 * @access  Private (Patient)
 */
router.get(
  '/hypertension/summary',
  auditHealthAccess(ALLOWED_RESOURCES.HEALTH_METRIC, AUDIT_ACTIONS.VIEW),
  patientAnalyticsController.getHypertensionSummary
);

/**
 * @route   GET /api/v1/patient-analytics/hypertension/chart
 * @desc    Get hypertension chart data
 * @access  Private (Patient)
 */
router.get(
  '/hypertension/chart',
  auditHealthAccess(ALLOWED_RESOURCES.HEALTH_METRIC, AUDIT_ACTIONS.VIEW),
  patientAnalyticsController.getHypertensionChart
);

/**
 * @route   POST /api/v1/patient-analytics/hypertension/readings
 * @desc    Record blood pressure reading
 * @access  Private (Patient)
 */
router.post(
  '/hypertension/readings',
  auditHealthAccess(ALLOWED_RESOURCES.HEALTH_METRIC, AUDIT_ACTIONS.CREATE),
  patientAnalyticsController.recordBPReading
);

/**
 * @route   PUT /api/v1/patient-analytics/hypertension/targets/:metricType
 * @desc    Update hypertension target
 * @access  Private (Patient)
 */
router.put(
  '/hypertension/targets/:metricType',
  patientAnalyticsController.updateHypertensionTarget
);

/**
 * @route   DELETE /api/v1/patient-analytics/hypertension/targets/:metricType
 * @desc    Reset hypertension target to default
 * @access  Private (Patient)
 */
router.delete(
  '/hypertension/targets/:metricType',
  patientAnalyticsController.resetHypertensionTarget
);

// =====================
// Tracker Settings
// =====================

/**
 * @route   GET /api/v1/patient-analytics/trackers/summary
 * @desc    Get all trackers summary
 * @access  Private (Patient)
 */
router.get(
  '/trackers/summary',
  auditHealthAccess(ALLOWED_RESOURCES.HEALTH_METRIC, AUDIT_ACTIONS.VIEW),
  patientAnalyticsController.getAllTrackersSummary
);

/**
 * @route   PUT /api/v1/patient-analytics/trackers/:trackerType/reminders
 * @desc    Update tracker reminder settings
 * @access  Private (Patient)
 */
router.put(
  '/trackers/:trackerType/reminders',
  patientAnalyticsController.updateReminderSettings
);

/**
 * @route   PUT /api/v1/patient-analytics/trackers/:trackerType/toggle
 * @desc    Toggle tracker enabled/disabled
 * @access  Private (Patient)
 */
router.put(
  '/trackers/:trackerType/toggle',
  patientAnalyticsController.toggleTracker
);

// =====================
// Unified Target Management
// =====================

/**
 * @route   GET /api/v1/patient-analytics/targets/:trackerType
 * @desc    Get target configuration for a tracker
 * @access  Private (Patient)
 */
router.get(
  '/targets/:trackerType',
  patientAnalyticsController.getTargets
);

/**
 * @route   POST /api/v1/patient-analytics/targets
 * @desc    Save target configuration for a tracker
 * @access  Private (Patient)
 */
router.post(
  '/targets',
  patientAnalyticsController.saveTargets
);

module.exports = router;
