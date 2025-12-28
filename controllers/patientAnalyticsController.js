/**
 * Patient Analytics Controller
 *
 * HTTP request handlers for patient analytics tab:
 * - Investigation reports upload and management
 * - Diabetes tracker
 * - Hypertension tracker
 */

const investigationReportService = require('../services/investigationReportService');
const healthTrackerService = require('../services/healthTrackerService');
const InvestigationReport = require('../models/investigationReport');
const responseHelper = require('../utils/responseHelper');
const { TRACKER_TYPES } = require('../constants/healthConstants');

// =====================
// Investigation Reports
// =====================

/**
 * @desc    Upload investigation report
 * @route   POST /api/v1/patient-analytics/reports
 * @access  Private (Patient)
 */
exports.uploadReport = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const files = req.files;

    if (!files || files.length === 0) {
      return responseHelper.sendError(res, 'At least one file is required', 400);
    }

    const report = await investigationReportService.createReport(patientId, req.body, files);

    responseHelper.sendSuccess(res, { report }, 'Report uploaded successfully. AI analysis started.', 201);
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get patient's investigation reports
 * @route   GET /api/v1/patient-analytics/reports
 * @access  Private (Patient)
 */
exports.getReports = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const { page, limit, reportType, status, startDate, endDate } = req.query;

    const result = await InvestigationReport.getPatientReports(patientId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 10,
      reportType,
      status,
      startDate,
      endDate
    });

    responseHelper.sendSuccess(res, result, 'Reports loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get single report details
 * @route   GET /api/v1/patient-analytics/reports/:reportId
 * @access  Private (Patient)
 */
exports.getReportDetails = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const { reportId } = req.params;

    const report = await investigationReportService.getReportDetails(reportId, patientId);

    responseHelper.sendSuccess(res, { report }, 'Report details loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Retry failed AI analysis
 * @route   POST /api/v1/patient-analytics/reports/:reportId/retry-analysis
 * @access  Private (Patient)
 */
exports.retryAnalysis = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const { reportId } = req.params;

    const report = await investigationReportService.retryAIAnalysis(reportId, patientId);

    responseHelper.sendSuccess(res, { report }, 'AI analysis restarted');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Request doctor review
 * @route   POST /api/v1/patient-analytics/reports/:reportId/request-review
 * @access  Private (Patient)
 */
exports.requestDoctorReview = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const { reportId } = req.params;
    const { assignmentType, doctorId, specialization } = req.body;

    const report = await investigationReportService.requestDoctorReview(reportId, patientId, {
      assignmentType,
      doctorId,
      specialization,
      assignedBy: patientId
    });

    responseHelper.sendSuccess(res, { report }, 'Doctor review requested');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get available doctors for review
 * @route   GET /api/v1/patient-analytics/available-doctors
 * @access  Private (Patient)
 */
exports.getAvailableDoctors = async (req, res, next) => {
  try {
    const { specialization } = req.query;
    const doctors = await investigationReportService.getAvailableDoctors(specialization);

    responseHelper.sendSuccess(res, { doctors }, 'Available doctors loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get available specializations
 * @route   GET /api/v1/patient-analytics/specializations
 * @access  Private (Patient)
 */
exports.getSpecializations = async (req, res, next) => {
  try {
    const specializations = await investigationReportService.getSpecializations();

    responseHelper.sendSuccess(res, { specializations }, 'Specializations loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Ask question about reviewed report
 * @route   POST /api/v1/patient-analytics/reports/:reportId/questions
 * @access  Private (Patient)
 */
exports.askQuestion = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const { reportId } = req.params;
    const { question } = req.body;

    if (!question || question.trim().length === 0) {
      return responseHelper.sendError(res, 'Question is required', 400);
    }

    const report = await investigationReportService.askQuestion(reportId, patientId, question);

    responseHelper.sendSuccess(res, { report }, 'Question submitted');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Acknowledge reviewed report
 * @route   POST /api/v1/patient-analytics/reports/:reportId/acknowledge
 * @access  Private (Patient)
 */
exports.acknowledgeReport = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const { reportId } = req.params;

    const report = await investigationReportService.acknowledgeReport(reportId, patientId);

    responseHelper.sendSuccess(res, { report }, 'Report acknowledged');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Delete report
 * @route   DELETE /api/v1/patient-analytics/reports/:reportId
 * @access  Private (Patient)
 */
exports.deleteReport = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const { reportId } = req.params;

    await investigationReportService.deleteReport(reportId, patientId);

    responseHelper.sendSuccess(res, null, 'Report deleted');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get reports analytics summary
 * @route   GET /api/v1/patient-analytics/reports/summary
 * @access  Private (Patient)
 */
exports.getReportsSummary = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const summary = await InvestigationReport.getPatientAnalyticsSummary(patientId);

    responseHelper.sendSuccess(res, { summary }, 'Reports summary loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

// =====================
// Diabetes Tracker
// =====================

/**
 * @desc    Record diabetes reading
 * @route   POST /api/v1/patient-analytics/diabetes/readings
 * @access  Private (Patient)
 */
exports.recordDiabetesReading = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const result = await healthTrackerService.recordDiabetesReading(patientId, req.body);

    responseHelper.sendSuccess(res, result, 'Reading recorded', 201);
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get diabetes chart data
 * @route   GET /api/v1/patient-analytics/diabetes/chart
 * @access  Private (Patient)
 */
exports.getDiabetesChart = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const { startDate, endDate, period } = req.query;

    const data = await healthTrackerService.getDiabetesChartData(patientId, {
      startDate,
      endDate,
      period
    });

    responseHelper.sendSuccess(res, data, 'Diabetes chart data loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get diabetes tracker summary
 * @route   GET /api/v1/patient-analytics/diabetes/summary
 * @access  Private (Patient)
 */
exports.getDiabetesSummary = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const summary = await healthTrackerService.getTrackerSummary(patientId, TRACKER_TYPES.DIABETES);

    responseHelper.sendSuccess(res, { summary }, 'Diabetes summary loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Update diabetes target
 * @route   PUT /api/v1/patient-analytics/diabetes/targets/:metricType
 * @access  Private (Patient)
 */
exports.updateDiabetesTarget = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const { metricType } = req.params;

    const tracker = await healthTrackerService.updateTrackerTarget(
      patientId,
      TRACKER_TYPES.DIABETES,
      metricType,
      req.body,
      patientId,
      'Patient'
    );

    responseHelper.sendSuccess(res, { tracker }, 'Target updated');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Reset diabetes target to default
 * @route   DELETE /api/v1/patient-analytics/diabetes/targets/:metricType
 * @access  Private (Patient)
 */
exports.resetDiabetesTarget = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const { metricType } = req.params;

    const tracker = await healthTrackerService.resetTrackerTarget(
      patientId,
      TRACKER_TYPES.DIABETES,
      metricType
    );

    responseHelper.sendSuccess(res, { tracker }, 'Target reset to default');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

// =====================
// Hypertension Tracker
// =====================

/**
 * @desc    Record blood pressure reading
 * @route   POST /api/v1/patient-analytics/hypertension/readings
 * @access  Private (Patient)
 */
exports.recordBPReading = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const result = await healthTrackerService.recordBPReading(patientId, req.body);

    responseHelper.sendSuccess(res, result, 'BP reading recorded', 201);
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get hypertension chart data
 * @route   GET /api/v1/patient-analytics/hypertension/chart
 * @access  Private (Patient)
 */
exports.getHypertensionChart = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const { startDate, endDate, period } = req.query;

    const data = await healthTrackerService.getHypertensionChartData(patientId, {
      startDate,
      endDate,
      period
    });

    responseHelper.sendSuccess(res, data, 'Hypertension chart data loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get hypertension tracker summary
 * @route   GET /api/v1/patient-analytics/hypertension/summary
 * @access  Private (Patient)
 */
exports.getHypertensionSummary = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const summary = await healthTrackerService.getTrackerSummary(patientId, TRACKER_TYPES.HYPERTENSION);

    responseHelper.sendSuccess(res, { summary }, 'Hypertension summary loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Update hypertension target
 * @route   PUT /api/v1/patient-analytics/hypertension/targets/:metricType
 * @access  Private (Patient)
 */
exports.updateHypertensionTarget = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const { metricType } = req.params;

    const tracker = await healthTrackerService.updateTrackerTarget(
      patientId,
      TRACKER_TYPES.HYPERTENSION,
      metricType,
      req.body,
      patientId,
      'Patient'
    );

    responseHelper.sendSuccess(res, { tracker }, 'Target updated');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Reset hypertension target to default
 * @route   DELETE /api/v1/patient-analytics/hypertension/targets/:metricType
 * @access  Private (Patient)
 */
exports.resetHypertensionTarget = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const { metricType } = req.params;

    const tracker = await healthTrackerService.resetTrackerTarget(
      patientId,
      TRACKER_TYPES.HYPERTENSION,
      metricType
    );

    responseHelper.sendSuccess(res, { tracker }, 'Target reset to default');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

// =====================
// Combined Analytics
// =====================

/**
 * @desc    Get all trackers summary
 * @route   GET /api/v1/patient-analytics/trackers/summary
 * @access  Private (Patient)
 */
exports.getAllTrackersSummary = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const summary = await healthTrackerService.getAllTrackersSummary(patientId);

    responseHelper.sendSuccess(res, { summary }, 'All trackers summary loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get complete analytics overview
 * @route   GET /api/v1/patient-analytics/overview
 * @access  Private (Patient)
 */
exports.getAnalyticsOverview = async (req, res, next) => {
  try {
    const patientId = req.user._id;

    const [reportsSummary, trackersSummary] = await Promise.all([
      InvestigationReport.getPatientAnalyticsSummary(patientId),
      healthTrackerService.getAllTrackersSummary(patientId)
    ]);

    responseHelper.sendSuccess(res, {
      reports: reportsSummary,
      trackers: trackersSummary
    }, 'Analytics overview loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Update tracker reminder settings
 * @route   PUT /api/v1/patient-analytics/trackers/:trackerType/reminders
 * @access  Private (Patient)
 */
exports.updateReminderSettings = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const { trackerType } = req.params;

    if (!Object.values(TRACKER_TYPES).includes(trackerType)) {
      return responseHelper.sendError(res, 'Invalid tracker type', 400);
    }

    const tracker = await healthTrackerService.updateReminderSettings(patientId, trackerType, req.body);

    responseHelper.sendSuccess(res, { tracker }, 'Reminder settings updated');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Toggle tracker enabled/disabled
 * @route   PUT /api/v1/patient-analytics/trackers/:trackerType/toggle
 * @access  Private (Patient)
 */
exports.toggleTracker = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const { trackerType } = req.params;
    const { isEnabled } = req.body;

    if (!Object.values(TRACKER_TYPES).includes(trackerType)) {
      return responseHelper.sendError(res, 'Invalid tracker type', 400);
    }

    const tracker = await healthTrackerService.toggleTracker(patientId, trackerType, isEnabled);

    responseHelper.sendSuccess(res, { tracker }, `Tracker ${isEnabled ? 'enabled' : 'disabled'}`);
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

// =====================
// Unified Target Management
// =====================

/**
 * @desc    Get target configuration for a tracker
 * @route   GET /api/v1/patient-analytics/targets/:trackerType
 * @access  Private (Patient)
 */
exports.getTargets = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const { trackerType } = req.params;

    if (!Object.values(TRACKER_TYPES).includes(trackerType)) {
      return responseHelper.sendError(res, 'Invalid tracker type', 400);
    }

    const target = await healthTrackerService.getTrackerTarget(patientId, trackerType);

    responseHelper.sendSuccess(res, { target }, 'Target configuration loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Save target configuration for a tracker
 * @route   POST /api/v1/patient-analytics/targets
 * @access  Private (Patient)
 */
exports.saveTargets = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const { trackerType, ranges, reminders } = req.body;

    if (!trackerType || !Object.values(TRACKER_TYPES).includes(trackerType)) {
      return responseHelper.sendError(res, 'Invalid tracker type', 400);
    }

    const target = await healthTrackerService.saveTrackerTarget(patientId, trackerType, {
      ranges,
      reminders
    });

    responseHelper.sendSuccess(res, { target }, 'Target configuration saved');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};
