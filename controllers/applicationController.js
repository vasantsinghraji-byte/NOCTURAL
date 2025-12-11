/**
 * Application Controller
 *
 * Handles HTTP requests for duty application operations
 * Delegates business logic to applicationService
 *
 * Pattern: Controller → Service → Model
 */

const applicationService = require('../services/applicationService');
const { sendPaginatedResponse } = require('../utils/pagination');

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

    sendPaginatedResponse(res, result);
  } catch (error) {
    next(error);
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

    sendPaginatedResponse(res, result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    next(error);
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

    res.status(201).json({
      success: true,
      message: 'Application submitted successfully',
      application
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    next(error);
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

    res.status(200).json({
      success: true,
      message: `Application ${status.toLowerCase()} successfully`,
      application
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    next(error);
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

    res.status(200).json({
      success: true,
      message: 'Application withdrawn successfully'
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    next(error);
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

    res.status(200).json({
      success: true,
      application
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    next(error);
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

    res.status(200).json({
      success: true,
      stats
    });
  } catch (error) {
    next(error);
  }
};
