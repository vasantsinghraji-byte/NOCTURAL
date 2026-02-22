/**
 * Duty Service
 *
 * Business logic layer for duty management operations
 * Abstracts database operations from controllers
 */

const Duty = require('../models/duty');
const { invalidateCache } = require('../middleware/queryCache');
const {  HTTP_STATUS,
  DUTY_STATUS,
  SUCCESS_MESSAGE,
  ERROR_MESSAGE,
  PAGINATION
} = require('../constants');
const logger = require('../utils/logger');

class DutyService {
  /**
   * Get all duties with optional filters
   * @param {Object} filters - Query filters
   * @param {Object} options - Query options (pagination, sort)
   * @returns {Promise<Array>} List of duties
   */
  async getAllDuties(filters = {}, options = {}) {
    const {
      sort = { urgency: -1, date: 1 },
      populate = 'postedBy'
    } = options;

    const page = Math.max(PAGINATION.DEFAULT_PAGE, Math.floor(Number(options.page) || PAGINATION.DEFAULT_PAGE));
    const limit = Math.min(PAGINATION.MAX_LIMIT, Math.max(PAGINATION.MIN_LIMIT, Math.floor(Number(options.limit) || PAGINATION.DEFAULT_LIMIT)));

    const duties = await Duty.find(filters)
      .populate(populate, 'name hospital')
      .sort(sort)
      .limit(limit)
      .skip((page - 1) * limit)
      .lean();

    const total = await Duty.countDocuments(filters);

    return {
      duties,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit
      }
    };
  }

  /**
   * Get single duty by ID
   * @param {String} dutyId - Duty ID
   * @returns {Promise<Object>} Duty details
   */
  async getDutyById(dutyId) {
    const duty = await Duty.findById(dutyId)
      .populate('postedBy', 'name hospital email phone');

    if (!duty) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: ERROR_MESSAGE.DUTY_NOT_FOUND
      };
    }

    return duty;
  }

  /**
   * Create a new duty
   * @param {Object} dutyData - Duty data
   * @param {Object} user - User creating the duty
   * @returns {Promise<Object>} Created duty
   */
  async createDuty(dutyData, user) {
    // Add user data
    dutyData.postedBy = user._id;

    if (user.role === 'admin') {
      dutyData.hospital = user.hospital;
    }

    const duty = await Duty.create(dutyData);

    // Invalidate duty list cache
    await invalidateCache('*:/api/duties*');

    logger.info('Duty Created', {
      dutyId: duty._id,
      postedBy: user._id,
      title: duty.title
    });

    return duty;
  }

  /**
   * Update a duty
   * @param {String} dutyId - Duty ID
   * @param {Object} updateData - Data to update
   * @param {Object} user - User updating the duty
   * @returns {Promise<Object>} Updated duty
   */
  async updateDuty(dutyId, updateData, user) {
    let duty = await Duty.findById(dutyId);

    if (!duty) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: ERROR_MESSAGE.DUTY_NOT_FOUND
      };
    }

    // Check authorization
    if (duty.postedBy.toString() !== user._id.toString()) {
      throw {
        statusCode: HTTP_STATUS.FORBIDDEN,
        message: ERROR_MESSAGE.UNAUTHORIZED
      };
    }

    duty = await Duty.findByIdAndUpdate(dutyId, updateData, {
      new: true,
      runValidators: true
    });

    // Invalidate cache
    await invalidateCache('*:/api/duties*');

    logger.info('Duty Updated', {
      dutyId: duty._id,
      updatedBy: user._id,
      title: duty.title
    });

    return duty;
  }

  /**
   * Delete a duty
   * @param {String} dutyId - Duty ID
   * @param {Object} user - User deleting the duty
   * @returns {Promise<void>}
   */
  async deleteDuty(dutyId, user) {
    const duty = await Duty.findById(dutyId);

    if (!duty) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: ERROR_MESSAGE.DUTY_NOT_FOUND
      };
    }

    // Check authorization
    if (duty.postedBy.toString() !== user._id.toString()) {
      throw {
        statusCode: HTTP_STATUS.FORBIDDEN,
        message: ERROR_MESSAGE.UNAUTHORIZED
      };
    }

    await duty.deleteOne();

    // Invalidate cache
    await invalidateCache('*:/api/duties*');

    logger.info('Duty Deleted', {
      dutyId: duty._id,
      deletedBy: user._id,
      title: duty.title
    });
  }

  /**
   * Get duties posted by a specific hospital
   * @param {String} hospitalId - Hospital user ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} List of duties
   */
  async getDutiesByHospital(hospitalId, options = {}) {
    return this.getAllDuties({ postedBy: hospitalId }, options);
  }

  /**
   * Get open duties (available for application)
   * @param {Object} options - Query options
   * @returns {Promise<Array>} List of open duties
   */
  async getOpenDuties(options = {}) {
    return this.getAllDuties({ status: DUTY_STATUS.OPEN }, options);
  }

  /**
   * Calculate match score for a duty and doctor
   * @param {String} dutyId - Duty ID
   * @param {Object} doctor - Doctor object
   * @returns {Promise<Number>} Match score (0-100)
   */
  async calculateMatchScore(dutyId, doctor) {
    const duty = await Duty.findById(dutyId);

    if (!duty) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: ERROR_MESSAGE.DUTY_NOT_FOUND
      };
    }

    return duty.calculateMatchScore(doctor);
  }

  /**
   * Get duties matching doctor's specialization
   * @param {Object} doctor - Doctor object
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Matching duties
   */
  async getMatchingDuties(doctor, options = {}) {
    const filters = {
      status: DUTY_STATUS.OPEN,
      specialty: { $in: [doctor.professional?.primarySpecialization, ...(doctor.professional?.secondarySpecializations || [])] }
    };

    return this.getAllDuties(filters, options);
  }

  /**
   * Update duty status
   * @param {String} dutyId - Duty ID
   * @param {String} status - New status
   * @param {Object} user - User updating the status
   * @returns {Promise<Object>} Updated duty
   */
  async updateDutyStatus(dutyId, status, user) {
    return this.updateDuty(dutyId, { status }, user);
  }

  /**
   * Increment view count for a duty
   * @param {String} dutyId - Duty ID
   * @returns {Promise<void>}
   */
  async incrementViewCount(dutyId) {
    await Duty.findByIdAndUpdate(dutyId, { $inc: { viewCount: 1 } });
  }
}

module.exports = new DutyService();
