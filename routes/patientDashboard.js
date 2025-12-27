/**
 * Patient Dashboard Routes
 *
 * Routes for patient analytics dashboard endpoints.
 * All routes require patient authentication.
 */

const express = require('express');
const router = express.Router();
const { protectPatient } = require('../middleware/patientAuth');
const { auditHealthAccess } = require('../middleware/healthDataAccess');
const patientDashboardController = require('../controllers/patientDashboardController');
const { validateGenerateQR, validateBookingHistoryQuery, validateTimelineQuery } = require('../validators/healthDataValidator');
const { ALLOWED_RESOURCES, AUDIT_ACTIONS } = require('../constants/healthConstants');

// All routes require patient authentication
router.use(protectPatient);

/**
 * @route   GET /api/v1/patient-dashboard
 * @desc    Get complete dashboard overview
 * @access  Private (Patient)
 */
router.get(
  '/',
  auditHealthAccess(ALLOWED_RESOURCES.FULL_HISTORY, AUDIT_ACTIONS.VIEW),
  patientDashboardController.getDashboardOverview
);

/**
 * @route   GET /api/v1/patient-dashboard/health-summary
 * @desc    Get health summary
 * @access  Private (Patient)
 */
router.get(
  '/health-summary',
  auditHealthAccess(ALLOWED_RESOURCES.HEALTH_RECORD, AUDIT_ACTIONS.VIEW),
  patientDashboardController.getHealthSummary
);

/**
 * @route   GET /api/v1/patient-dashboard/bookings/active
 * @desc    Get active/upcoming bookings
 * @access  Private (Patient)
 */
router.get(
  '/bookings/active',
  patientDashboardController.getActiveBookings
);

/**
 * @route   GET /api/v1/patient-dashboard/bookings/history
 * @desc    Get booking history with pagination
 * @access  Private (Patient)
 */
router.get(
  '/bookings/history',
  validateBookingHistoryQuery,
  patientDashboardController.getBookingHistory
);

/**
 * @route   GET /api/v1/patient-dashboard/timeline
 * @desc    Get medical timeline
 * @access  Private (Patient)
 */
router.get(
  '/timeline',
  validateTimelineQuery,
  auditHealthAccess(ALLOWED_RESOURCES.FULL_HISTORY, AUDIT_ACTIONS.VIEW),
  patientDashboardController.getMedicalTimeline
);

/**
 * @route   GET /api/v1/patient-dashboard/emergency-card
 * @desc    Get emergency card data
 * @access  Private (Patient)
 */
router.get(
  '/emergency-card',
  auditHealthAccess(ALLOWED_RESOURCES.EMERGENCY_SUMMARY, AUDIT_ACTIONS.VIEW),
  patientDashboardController.getEmergencyCard
);

/**
 * @route   POST /api/v1/patient-dashboard/emergency-card/qr
 * @desc    Generate emergency QR token
 * @access  Private (Patient)
 */
router.post(
  '/emergency-card/qr',
  validateGenerateQR,
  patientDashboardController.generateEmergencyQR
);

/**
 * @route   GET /api/v1/patient-dashboard/stats
 * @desc    Get patient statistics
 * @access  Private (Patient)
 */
router.get(
  '/stats',
  patientDashboardController.getPatientStats
);

module.exports = router;
