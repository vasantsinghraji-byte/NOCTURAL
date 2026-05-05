/**
 * Application Service
 *
 * Business logic layer for duty application operations
 * Handles applying for duties, managing applications, and status updates
 */

const mongoose = require('mongoose');
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
    const query = { applicant: userId };

    if (options.status) {
      query.status = options.status;
    }

    const result = await paginate(
      Application,
      query,
      {
        page: options.page || 1,
        limit: options.limit || 20,
        sort: options.sort || { appliedAt: -1 },
        populate: { path: 'duty', select: 'title hospitalName date startTime endTime specialty status location.city compensation.totalAmount urgency' }
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
        populate: 'applicant:name email specialty rating completedDuties'
      }
    );

    return result;
  }

  /**
   * Get applications received for duties posted by an admin
   * @param {String} userId - Admin user ID
   * @param {Object} options - Pagination options
   * @returns {Promise<Object>} Paginated applications
   */
  async getReceivedApplications(userId, options = {}) {
    const dutyIds = await Duty.find({ postedBy: userId }).distinct('_id');

    const page = options.page || 1;
    const limit = options.limit || 20;

    if (!dutyIds.length) {
      return {
        success: true,
        data: [],
        pagination: {
          total: 0,
          count: 0,
          page,
          limit,
          pages: 0,
          hasNext: false,
          hasPrev: false,
          nextPage: null,
          prevPage: null
        }
      };
    }

    return paginate(
      Application,
      { duty: { $in: dutyIds } },
      {
        page,
        limit,
        sort: options.sort || { appliedAt: -1 },
        populate: [
          { path: 'applicant', select: 'name email specialty rating completedDuties' },
          {
            path: 'duty',
            select: 'title date startTime endTime status totalCompensation netPayment hourlyRate hospital hospitalName'
          }
        ]
      }
    );
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

    const oldStatus = application.status;
    const changedAt = new Date();
    const changedFields = ['status'];
    if (notes && notes !== application.notes) changedFields.push('notes');

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
      application.statusHistory.push({
        fromStatus: oldStatus, toStatus: 'ACCEPTED', changedBy: userId,
        changedAt, changedFields, notes
      });
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
          {
            status: 'REJECTED',
            notes: 'Auto-rejected: all positions filled',
            $push: {
              statusHistory: {
                fromStatus: 'PENDING', toStatus: 'REJECTED', changedBy: userId,
                changedAt, changedFields: ['status', 'notes'],
                notes: 'Auto-rejected: all positions filled'
              }
            }
          }
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
      application.statusHistory.push({
        fromStatus: oldStatus, toStatus: status, changedBy: userId,
        changedAt, changedFields, notes
      });
      await application.save();
    }

    logger.info('Application status updated', {
      applicationId,
      oldStatus,
      newStatus: status,
      changedFields,
      changedAt: changedAt.toISOString(),
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
    const applicantMatchId = mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId)
      : userId;

    const [total, pending, accepted, rejected, withdrawn, earningsResult] = await Promise.all([
      Application.countDocuments({ applicant: userId }),
      Application.countDocuments({ applicant: userId, status: 'PENDING' }),
      Application.countDocuments({ applicant: userId, status: 'ACCEPTED' }),
      Application.countDocuments({ applicant: userId, status: 'REJECTED' }),
      Application.countDocuments({ applicant: userId, status: 'WITHDRAWN' }),
      Application.aggregate([
        {
          $match: {
            applicant: applicantMatchId,
            status: 'ACCEPTED'
          }
        },
        {
          $lookup: {
            from: Duty.collection.name,
            localField: 'duty',
            foreignField: '_id',
            as: 'duty'
          }
        },
        {
          $unwind: {
            path: '$duty',
            preserveNullAndEmptyArrays: false
          }
        },
        {
          $group: {
            _id: null,
            totalEarnings: {
              $sum: {
                $ifNull: [
                  '$duty.totalCompensation',
                  { $ifNull: ['$duty.netPayment', 0] }
                ]
              }
            }
          }
        }
      ])
    ]);

    const acceptanceRate = total > 0 ? Math.round((accepted / total) * 100) : 0;
    const totalEarnings = earningsResult[0] ? earningsResult[0].totalEarnings : 0;

    return {
      total,
      pending,
      accepted,
      rejected,
      withdrawn,
      acceptanceRate,
      totalEarnings
    };
  }
}

module.exports = new ApplicationService();
