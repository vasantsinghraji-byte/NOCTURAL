/**
 * Application Controller
 *
 * Handles HTTP requests for duty application operations
 * Delegates business logic to applicationService
 *
 * Pattern: Controller → Service → Model
 */

const applicationService = require('../services/applicationService');
const responseHelper = require('../utils/responseHelper');

/**
 * @desc    Get my applications with pagination
 * @route   GET /api/applications/my
 * @access  Private
 */
exports.getMyApplications = async (req, res, next) => {
  try {
    const result = await applicationService.getMyApplications(req.user.id, {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
      sort: req.query.sort || { appliedAt: -1 }
    });

    responseHelper.sendPaginated(
      res,
      result.data,
      result.pagination,
      'Applications fetched successfully'
    );
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get applications for a duty (admin only)
 * @route   GET /api/applications/duty/:dutyId
 * @access  Private (Duty poster)
 */
exports.getDutyApplications = async (req, res, next) => {
  try {
    const result = await applicationService.getDutyApplications(
      req.params.dutyId,
      req.user.id,
      {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        sort: req.query.sort || { appliedAt: -1 }
      }
    );

    responseHelper.sendPaginated(
      res,
      result.data,
      result.pagination,
      'Applications fetched successfully'
    );
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Apply for duty
 * @route   POST /api/applications
 * @access  Private
 */
exports.applyForDuty = async (req, res, next) => {
  try {
    const application = await applicationService.applyForDuty(req.body, req.user.id);

    responseHelper.sendCreated(res, { application }, 'Application submitted successfully');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Update application status (admin only)
 * @route   PATCH /api/applications/:id/status
 * @access  Private (Duty poster)
 */
exports.updateApplicationStatus = async (req, res, next) => {
  try {
    const { status, notes } = req.body;

    const application = await applicationService.updateApplicationStatus(
      req.params.id,
      req.user.id,
      status,
      notes
    );

    responseHelper.sendSuccess(
      res,
      { application },
      `Application ${status.toLowerCase()} successfully`
    );
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Withdraw application
 * @route   DELETE /api/applications/:id
 * @access  Private (Applicant)
 */
exports.withdrawApplication = async (req, res, next) => {
  try {
    await applicationService.withdrawApplication(req.params.id, req.user.id);

    responseHelper.sendSuccess(res, {}, 'Application withdrawn successfully');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get application by ID
 * @route   GET /api/applications/:id
 * @access  Private
 */
exports.getApplicationById = async (req, res, next) => {
  try {
    const application = await applicationService.getApplicationById(
      req.params.id,
      req.user.id
    );

    responseHelper.sendSuccess(res, { application });
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get application statistics
 * @route   GET /api/applications/stats
 * @access  Private
 */
exports.getApplicationStats = async (req, res, next) => {
  try {
    const stats = await applicationService.getApplicationStats(req.user.id);

    responseHelper.sendSuccess(res, { stats });
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};
