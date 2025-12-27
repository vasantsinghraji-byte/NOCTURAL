/**
 * Health Intake Controller
 *
 * HTTP request handlers for health intake workflow endpoints.
 * Thin layer that delegates to healthIntakeService.
 */

const healthIntakeService = require('../services/healthIntakeService');
const responseHelper = require('../utils/responseHelper');

// ==================== Patient Endpoints ====================

/**
 * @desc    Get intake status
 * @route   GET /api/v1/health-intake/status
 * @access  Private (Patient)
 */
exports.getIntakeStatus = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const status = await healthIntakeService.getIntakeStatus(patientId);

    responseHelper.sendSuccess(res, { intake: status }, 'Intake status loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get intake form (with any existing draft)
 * @route   GET /api/v1/health-intake/form
 * @access  Private (Patient)
 */
exports.getIntakeForm = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const form = await healthIntakeService.getIntakeForm(patientId);

    responseHelper.sendSuccess(res, { form }, 'Intake form loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Save intake draft
 * @route   POST /api/v1/health-intake/draft
 * @access  Private (Patient)
 */
exports.saveIntakeDraft = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const draftData = req.body;

    const draft = await healthIntakeService.saveIntakeDraft(patientId, draftData);

    responseHelper.sendSuccess(res, { draft }, 'Draft saved');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Submit intake for review
 * @route   POST /api/v1/health-intake/submit
 * @access  Private (Patient)
 */
exports.submitIntake = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const intakeData = req.body;

    const record = await healthIntakeService.submitIntake(patientId, intakeData);

    responseHelper.sendCreated(res, { record }, 'Intake submitted for review');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

// ==================== Doctor Endpoints ====================

/**
 * @desc    Get intakes assigned to doctor
 * @route   GET /api/v1/health-intake/my-reviews
 * @access  Private (Doctor)
 */
exports.getMyPendingIntakes = async (req, res, next) => {
  try {
    const doctorId = req.user._id;
    const { page, limit } = req.query;

    const options = {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20
    };

    const result = await healthIntakeService.getDoctorPendingIntakes(doctorId, options);

    responseHelper.sendPaginated(
      res,
      result.records,
      result.pagination,
      'Pending intakes loaded'
    );
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get intake details for review
 * @route   GET /api/v1/health-intake/:intakeId
 * @access  Private (Doctor - assigned only)
 */
exports.getIntakeDetails = async (req, res, next) => {
  try {
    const { intakeId } = req.params;
    const doctorId = req.user._id;

    const record = await healthIntakeService.getIntakeDetails(intakeId, doctorId);

    responseHelper.sendSuccess(res, { record }, 'Intake details loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Approve intake
 * @route   POST /api/v1/health-intake/:intakeId/approve
 * @access  Private (Doctor - assigned only)
 */
exports.approveIntake = async (req, res, next) => {
  try {
    const { intakeId } = req.params;
    const doctorId = req.user._id;
    const { reviewNotes } = req.body;

    const record = await healthIntakeService.approveIntake(intakeId, doctorId, reviewNotes);

    responseHelper.sendSuccess(res, { record }, 'Intake approved');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Request changes on intake
 * @route   POST /api/v1/health-intake/:intakeId/request-changes
 * @access  Private (Doctor - assigned only)
 */
exports.requestChanges = async (req, res, next) => {
  try {
    const { intakeId } = req.params;
    const doctorId = req.user._id;
    const { changesRequired, notes } = req.body;

    const record = await healthIntakeService.requestChanges(intakeId, doctorId, changesRequired, notes);

    responseHelper.sendSuccess(res, { record }, 'Changes requested');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Reject intake
 * @route   POST /api/v1/health-intake/:intakeId/reject
 * @access  Private (Doctor - assigned only)
 */
exports.rejectIntake = async (req, res, next) => {
  try {
    const { intakeId } = req.params;
    const doctorId = req.user._id;
    const { rejectionReason } = req.body;

    const record = await healthIntakeService.rejectIntake(intakeId, doctorId, rejectionReason);

    responseHelper.sendSuccess(res, { record }, 'Intake rejected');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

// ==================== Admin Endpoints ====================

/**
 * @desc    Get all pending intakes
 * @route   GET /api/v1/health-intake/pending
 * @access  Private (Admin)
 */
exports.getPendingIntakes = async (req, res, next) => {
  try {
    const { page, limit, assignedOnly } = req.query;

    const options = {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      unassignedOnly: assignedOnly === 'false'
    };

    const result = await healthIntakeService.getPendingIntakes(options);

    responseHelper.sendPaginated(
      res,
      result.records,
      result.pagination,
      'Pending intakes loaded'
    );
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Assign doctor to review intake
 * @route   POST /api/v1/health-intake/:intakeId/assign
 * @access  Private (Admin)
 */
exports.assignReviewer = async (req, res, next) => {
  try {
    const { intakeId } = req.params;
    const { doctorId } = req.body;
    const adminId = req.user._id;

    const record = await healthIntakeService.assignReviewer(intakeId, doctorId, adminId);

    responseHelper.sendSuccess(res, { record }, 'Reviewer assigned');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get intake statistics
 * @route   GET /api/v1/health-intake/stats
 * @access  Private (Admin)
 */
exports.getIntakeStats = async (req, res, next) => {
  try {
    const stats = await healthIntakeService.getIntakeStats();

    responseHelper.sendSuccess(res, { stats }, 'Intake statistics loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};
