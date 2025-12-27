/**
 * Patient Dashboard Controller
 *
 * HTTP request handlers for patient dashboard endpoints.
 * Thin layer that delegates to patientDashboardService.
 */

const patientDashboardService = require('../services/patientDashboardService');
const responseHelper = require('../utils/responseHelper');

/**
 * @desc    Get dashboard overview
 * @route   GET /api/v1/patient-dashboard
 * @access  Private (Patient)
 */
exports.getDashboardOverview = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const overview = await patientDashboardService.getDashboardOverview(patientId);

    responseHelper.sendSuccess(res, { overview }, 'Dashboard loaded successfully');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get health summary
 * @route   GET /api/v1/patient-dashboard/health-summary
 * @access  Private (Patient)
 */
exports.getHealthSummary = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const summary = await patientDashboardService.getHealthSummary(patientId);

    responseHelper.sendSuccess(res, { summary }, 'Health summary loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get active bookings
 * @route   GET /api/v1/patient-dashboard/bookings/active
 * @access  Private (Patient)
 */
exports.getActiveBookings = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const bookings = await patientDashboardService.getActiveBookings(patientId);

    responseHelper.sendSuccess(res, { bookings }, 'Active bookings loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get booking history
 * @route   GET /api/v1/patient-dashboard/bookings/history
 * @access  Private (Patient)
 */
exports.getBookingHistory = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const { page, limit, status, startDate, endDate } = req.query;

    const options = {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 10,
      status,
      startDate,
      endDate
    };

    const result = await patientDashboardService.getBookingHistory(patientId, options);

    responseHelper.sendPaginated(
      res,
      result.bookings,
      result.pagination,
      'Booking history loaded'
    );
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get medical timeline
 * @route   GET /api/v1/patient-dashboard/timeline
 * @access  Private (Patient)
 */
exports.getMedicalTimeline = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const { page, limit, startDate, endDate } = req.query;

    const options = {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      startDate,
      endDate
    };

    const result = await patientDashboardService.getMedicalTimeline(patientId, options);

    responseHelper.sendPaginated(
      res,
      result.events,
      result.pagination,
      'Medical timeline loaded'
    );
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get emergency card data
 * @route   GET /api/v1/patient-dashboard/emergency-card
 * @access  Private (Patient)
 */
exports.getEmergencyCard = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const card = await patientDashboardService.getEmergencyCard(patientId);

    if (!card) {
      return responseHelper.sendSuccess(res, { card: null }, 'No emergency card available. Complete health intake first.');
    }

    responseHelper.sendSuccess(res, { card }, 'Emergency card loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Generate emergency QR token
 * @route   POST /api/v1/patient-dashboard/emergency-card/qr
 * @access  Private (Patient)
 */
exports.generateEmergencyQR = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const { expiryHours = 24 } = req.body;

    const qrData = await patientDashboardService.generateEmergencyQR(patientId, expiryHours);

    responseHelper.sendCreated(res, { qr: qrData }, 'Emergency QR generated');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get patient statistics
 * @route   GET /api/v1/patient-dashboard/stats
 * @access  Private (Patient)
 */
exports.getPatientStats = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const stats = await patientDashboardService.getPatientStats(patientId);

    responseHelper.sendSuccess(res, { stats }, 'Statistics loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};
