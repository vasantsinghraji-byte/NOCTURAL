/**
 * Application Service
 *
 * Business logic layer for duty application operations
 * Handles applying for duties, managing applications, and status updates
 */

const Application = require('../models/application');
const Duty = require('../models/duty');
const { paginate } = require('../utils/pagination');
const logger = require('../utils/logger');
const { HTTP_STATUS } = require('../constants');

class ApplicationService {
  /**
   * Get user's applications with pagination
   * @param {String} userId - User ID
   * @param {Object} options - Pagination options
   * @returns {Promise<Object>} Paginated applications
   */
  async getMyApplications(userId, options = {}) {
    const result = await paginate(
      Application,
      { applicant: userId },
      {
        page: options.page || 1,
        limit: options.limit || 20,
        sort: options.sort || { appliedAt: -1 },
        populate: 'duty'
      }
    );

    return result;
  }

  /**
   * Get applications for a specific duty (admin only)
   * @param {String} dutyId - Duty ID
   * @param {String} userId - User ID (poster)
   * @param {Object} options - Pagination options
   * @returns {Promise<Object>} Paginated applications
   */
  async getDutyApplications(dutyId, userId, options = {}) {
    const duty = await Duty.findById(dutyId);

    if (!duty) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'Duty not found'
      };
    }

    if (duty.postedBy.toString() !== userId) {
      throw {
        statusCode: HTTP_STATUS.FORBIDDEN,
        message: 'Not authorized to view applications for this duty'
      };
    }

    const result = await paginate(
      Application,
      { duty: dutyId },
      {
        page: options.page || 1,
        limit: options.limit || 20,
        sort: options.sort || { appliedAt: -1 },
        populate: 'applicant:name specialty rating completedDuties'
      }
    );

    return result;
  }

  /**
   * Apply for a duty
   * @param {Object} applicationData - Application data
   * @param {String} userId - Applicant user ID
   * @returns {Promise<Object>} Created application
   */
  async applyForDuty(applicationData, userId) {
    const { duty, coverLetter } = applicationData;

    const dutyExists = await Duty.findById(duty);

    if (!dutyExists) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'Duty not found'
      };
    }

    if (dutyExists.status !== 'OPEN') {
      throw {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: 'This duty is no longer accepting applications'
      };
    }

    // Check for existing application
    const existingApplication = await Application.findOne({
      duty,
      applicant: userId
    });

    if (existingApplication) {
      throw {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: 'You have already applied for this duty'
      };
    }

    // Create application
    const application = await Application.create({
      duty,
      applicant: userId,
      coverLetter
    });

    // Increment applications count on duty
    await Duty.findByIdAndUpdate(duty, {
      $inc: { applicationsCount: 1 }
    });

    logger.info('Application submitted', {
      applicationId: application._id,
      dutyId: duty,
      applicantId: userId
    });

    return application;
  }

  /**
   * Update application status (admin only)
   * @param {String} applicationId - Application ID
   * @param {String} userId - User ID (duty poster)
   * @param {String} status - New status
   * @param {String} notes - Optional notes
   * @returns {Promise<Object>} Updated application
   */
  async updateApplicationStatus(applicationId, userId, status, notes = null) {
    const application = await Application.findById(applicationId).populate('duty');

    if (!application) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'Application not found'
      };
    }

    if (application.duty.postedBy.toString() !== userId) {
      throw {
        statusCode: HTTP_STATUS.FORBIDDEN,
        message: 'Not authorized to update this application'
      };
    }

    if (status === 'ACCEPTED') {
      // Atomic: assign doctor only if duty is still OPEN and doctor not already assigned
      const updatedDuty = await Duty.findOneAndUpdate(
        {
          _id: application.duty._id,
          status: 'OPEN',
          'assignedDoctors.doctor': { $ne: application.applicant }
        },
        {
          $push: {
            assignedDoctors: {
              doctor: application.applicant,
              assignedAt: new Date(),
              status: 'CONFIRMED'
            }
          },
          $inc: { positionsFilled: 1 }
        },
        { new: true }
      );

      if (!updatedDuty) {
        throw {
          statusCode: HTTP_STATUS.CONFLICT,
          message: 'Duty is no longer available or applicant already assigned'
        };
      }

      // Duty updated atomically — now save application status
      application.status = 'ACCEPTED';
      if (notes) application.notes = notes;
      await application.save();

      // If all positions filled, mark duty as FILLED and auto-reject remaining
      if (updatedDuty.positionsFilled >= updatedDuty.positionsNeeded) {
        await Duty.findByIdAndUpdate(updatedDuty._id, { status: 'FILLED' });

        await Application.updateMany(
          {
            duty: application.duty._id,
            status: 'PENDING',
            _id: { $ne: applicationId }
          },
          { status: 'REJECTED', notes: 'Auto-rejected: all positions filled' }
        );
      }

      logger.info('Application accepted, doctor assigned', {
        applicationId,
        dutyId: application.duty._id,
        applicantId: application.applicant,
        positionsFilled: updatedDuty.positionsFilled,
        positionsNeeded: updatedDuty.positionsNeeded
      });
    } else {
      application.status = status;
      if (notes) application.notes = notes;
      await application.save();
    }

    logger.info('Application status updated', {
      applicationId,
      status,
      updatedBy: userId
    });

    return application;
  }

  /**
   * Withdraw an application
   * @param {String} applicationId - Application ID
   * @param {String} userId - Applicant user ID
   * @returns {Promise<Object>} Updated application
   */
  async withdrawApplication(applicationId, userId) {
    const application = await Application.findById(applicationId);

    if (!application) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'Application not found'
      };
    }

    if (application.applicant.toString() !== userId) {
      throw {
        statusCode: HTTP_STATUS.FORBIDDEN,
        message: 'Not authorized to withdraw this application'
      };
    }

    if (application.status !== 'PENDING') {
      throw {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: 'Can only withdraw pending applications'
      };
    }

    application.status = 'WITHDRAWN';
    await application.save();

    // Decrement applications count on duty
    await Duty.findByIdAndUpdate(application.duty, {
      $inc: { applicationsCount: -1 }
    });

    logger.info('Application withdrawn', {
      applicationId,
      userId
    });

    return application;
  }

  /**
   * Get application by ID
   * @param {String} applicationId - Application ID
   * @param {String} userId - User ID (applicant or duty poster)
   * @returns {Promise<Object>} Application
   */
  async getApplicationById(applicationId, userId) {
    const application = await Application.findById(applicationId)
      .populate('duty')
      .populate('applicant', 'name specialty rating completedDuties');

    if (!application) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'Application not found'
      };
    }

    // Check authorization
    const isApplicant = application.applicant._id.toString() === userId;
    const isDutyPoster = application.duty.postedBy.toString() === userId;

    if (!isApplicant && !isDutyPoster) {
      throw {
        statusCode: HTTP_STATUS.FORBIDDEN,
        message: 'Not authorized to view this application'
      };
    }

    return application;
  }

  /**
   * Get application statistics for a user
   * @param {String} userId - User ID
   * @returns {Promise<Object>} Application statistics
   */
  async getApplicationStats(userId) {
    const [total, pending, accepted, rejected, withdrawn] = await Promise.all([
      Application.countDocuments({ applicant: userId }),
      Application.countDocuments({ applicant: userId, status: 'PENDING' }),
      Application.countDocuments({ applicant: userId, status: 'ACCEPTED' }),
      Application.countDocuments({ applicant: userId, status: 'REJECTED' }),
      Application.countDocuments({ applicant: userId, status: 'WITHDRAWN' })
    ]);

    const acceptanceRate = total > 0 ? Math.round((accepted / total) * 100) : 0;

    return {
      total,
      pending,
      accepted,
      rejected,
      withdrawn,
      acceptanceRate
    };
  }
}

module.exports = new ApplicationService();
