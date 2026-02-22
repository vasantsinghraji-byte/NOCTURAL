/**
 * Analytics Service
 *
 * Business logic layer for analytics operations
 * Handles doctor analytics, hospital analytics, and application insights
 */

const { DoctorAnalytics, HospitalAnalytics } = require('../models/analytics');
const Application = require('../models/application');
const Duty = require('../models/duty');
const User = require('../models/user');
const logger = require('../utils/logger');
const { HTTP_STATUS } = require('../constants');

class AnalyticsService {
  /**
   * Get or create doctor analytics
   * @param {String} userId - User ID
   * @returns {Promise<Object>} Doctor analytics
   */
  async getDoctorAnalytics(userId) {
    let analytics = await DoctorAnalytics.findOne({ user: userId });

    if (!analytics) {
      analytics = await DoctorAnalytics.create({ user: userId });
      logger.info('Created new doctor analytics', { userId });
    }

    return analytics;
  }

  /**
   * Get or create hospital analytics
   * @param {String} hospitalId - Hospital ID
   * @returns {Promise<Object>} Hospital analytics
   */
  async getHospitalAnalytics(hospitalId) {
    let analytics = await HospitalAnalytics.findOne({ hospital: hospitalId });

    if (!analytics) {
      analytics = await HospitalAnalytics.create({ hospital: hospitalId });
      logger.info('Created new hospital analytics', { hospitalId });
    }

    return analytics;
  }

  /**
   * Get application insights for a duty
   * @param {String} dutyId - Duty ID
   * @param {Object} user - Current user
   * @returns {Promise<Object>} Application insights
   */
  async getApplicationInsights(dutyId, user) {
    const duty = await Duty.findById(dutyId)
      .populate('postedBy', 'hospital')
      .lean();

    if (!duty) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'Duty not found'
      };
    }

    // Run queries in parallel for performance
    const [totalApplications, acceptedApp, userApp] = await Promise.all([
      Application.countDocuments({ duty: dutyId }),
      Application.findOne({
        duty: dutyId,
        status: 'ACCEPTED'
      }).populate('applicant', 'rating completedDuties').lean(),
      Application.findOne({
        duty: dutyId,
        applicant: user._id
      }).lean()
    ]);

    const insights = {
      competition: {
        totalApplicants: totalApplications,
        message: totalApplications > 30 ? 'High competition' : 'Moderate competition'
      },
      possibleReasons: []
    };

    if (acceptedApp && userApp) {
      // Compare with accepted applicant
      if (acceptedApp.applicant.rating > user.rating) {
        insights.possibleReasons.push({
          reason: 'Selected doctor has higher rating',
          detail: `${acceptedApp.applicant.rating.toFixed(1)}★ vs your ${user.rating.toFixed(1)}★`
        });
      }

      if (acceptedApp.applicant.completedDuties > user.completedDuties) {
        insights.possibleReasons.push({
          reason: 'Selected doctor has more experience',
          detail: `${acceptedApp.applicant.completedDuties} shifts vs your ${user.completedDuties} shifts`
        });
      }

      // Check response time
      const userResponseTime = (new Date(userApp.createdAt) - new Date(duty.createdAt)) / 60000;
      const acceptedResponseTime = (new Date(acceptedApp.createdAt) - new Date(duty.createdAt)) / 60000;

      if (acceptedResponseTime < userResponseTime) {
        insights.possibleReasons.push({
          reason: 'Faster response time by other applicant',
          detail: `Applied ${Math.round(userResponseTime)} min after posting`
        });
      }
    }

    return insights;
  }

  /**
   * Update doctor analytics after completing a duty
   * @param {String} userId - User ID
   * @param {Object} dutyData - Completed duty data
   * @returns {Promise<Object>} Updated analytics
   */
  async recordCompletedDuty(userId, dutyData) {
    const analytics = await this.getDoctorAnalytics(userId);

    analytics.totalDuties = (analytics.totalDuties || 0) + 1;
    analytics.totalEarnings = (analytics.totalEarnings || 0) + (dutyData.earnings || 0);
    analytics.totalHours = (analytics.totalHours || 0) + (dutyData.hours || 0);

    // Update monthly stats
    const month = new Date().toISOString().slice(0, 7);
    if (!analytics.monthlyStats) {
      analytics.monthlyStats = new Map();
    }
    const monthStats = analytics.monthlyStats.get(month) || { duties: 0, earnings: 0, hours: 0 };
    monthStats.duties += 1;
    monthStats.earnings += dutyData.earnings || 0;
    monthStats.hours += dutyData.hours || 0;
    analytics.monthlyStats.set(month, monthStats);

    await analytics.save();

    logger.info('Updated doctor analytics', {
      userId,
      totalDuties: analytics.totalDuties,
      totalEarnings: analytics.totalEarnings
    });

    return analytics;
  }

  /**
   * Update analytics after rating received
   * @param {String} userId - User ID
   * @param {Number} rating - New rating
   * @returns {Promise<Object>} Updated analytics
   */
  async recordRating(userId, rating) {
    // Atomic pipeline update: increment counts and recompute average in one operation
    const analytics = await DoctorAnalytics.findOneAndUpdate(
      { user: userId },
      [
        {
          $set: {
            'ratingStats.totalRatings': { $add: [{ $ifNull: ['$ratingStats.totalRatings', 0] }, 1] },
            'ratingStats.ratingSum': { $add: [{ $ifNull: ['$ratingStats.ratingSum', 0] }, rating] }
          }
        },
        {
          $set: {
            'ratingStats.averageRating': {
              $divide: ['$ratingStats.ratingSum', '$ratingStats.totalRatings']
            },
            lastUpdated: new Date()
          }
        }
      ],
      { new: true, upsert: true }
    );

    logger.info('Updated doctor rating analytics', {
      userId,
      newRating: rating,
      averageRating: analytics.ratingStats.averageRating,
      totalRatings: analytics.ratingStats.totalRatings
    });

    return analytics;
  }

  /**
   * Get dashboard summary for a user
   * @param {String} userId - User ID
   * @param {String} role - User role
   * @returns {Promise<Object>} Dashboard summary
   */
  async getDashboardSummary(userId, role) {
    if (role === 'hospital' || role === 'admin') {
      return this.getHospitalDashboard(userId);
    }
    return this.getDoctorDashboard(userId);
  }

  /**
   * Get doctor dashboard data
   * @param {String} userId - User ID
   * @returns {Promise<Object>} Dashboard data
   */
  async getDoctorDashboard(userId) {
    const [analytics, recentApplications, upcomingDuties] = await Promise.all([
      this.getDoctorAnalytics(userId),
      Application.find({ applicant: userId })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('duty', 'title hospital startDate')
        .lean(),
      Duty.find({
        assignedTo: userId,
        startDate: { $gte: new Date() },
        status: { $in: ['FILLED', 'IN_PROGRESS'] }
      })
        .sort({ startDate: 1 })
        .limit(5)
        .lean()
    ]);

    return {
      analytics,
      recentApplications,
      upcomingDuties
    };
  }

  /**
   * Get hospital dashboard data
   * @param {String} hospitalId - Hospital ID
   * @returns {Promise<Object>} Dashboard data
   */
  async getHospitalDashboard(hospitalId) {
    // Get this hospital's duty IDs to scope the pending applications query
    const hospitalDutyIds = await Duty.find(
      { postedBy: hospitalId },
      { _id: 1 }
    ).lean().then(docs => docs.map(d => d._id));

    const [analytics, activeDuties, pendingApplications] = await Promise.all([
      this.getHospitalAnalytics(hospitalId),
      Duty.countDocuments({
        postedBy: hospitalId,
        status: 'OPEN'
      }),
      Application.countDocuments({
        duty: { $in: hospitalDutyIds },
        status: 'PENDING'
      })
    ]);

    return {
      analytics,
      activeDuties,
      pendingApplications
    };
  }
}

module.exports = new AnalyticsService();
