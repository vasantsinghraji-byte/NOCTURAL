/**
 * Authentication Service
 *
 * Business logic layer for authentication operations
 * Abstracts database operations from controllers
 */

const User = require('../models/user');
const { generateToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const { HTTP_STATUS, SUCCESS_MESSAGE, ERROR_MESSAGE } = require('../constants');

class AuthService {
  /**
   * Register a new user
   * @param {Object} userData - User registration data
   * @returns {Promise<Object>} Created user and token
   */
  async register(userData) {
    const { name, email, password, role, specialty, hospital, location, phone } = userData;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      logger.logAuth('register', email, false, ERROR_MESSAGE.USER_EXISTS);
      throw {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: ERROR_MESSAGE.USER_EXISTS
      };
    }

    // Create user
    let user;
    try {
      user = await User.create({
        name,
        email,
        password,
        role,
        specialty,
        hospital,
        location,
        phone
      });
    } catch (error) {
      logger.error('User creation error', { email, error: error.message, stack: error.stack });
      throw {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: 'Error creating user account'
      };
    }

    // Generate token
    const token = generateToken(user._id);

    logger.logAuth('register', email, true);
    logger.info('New User Registered', {
      userId: user._id,
      role: user.role,
      email: user.email
    });

    return {
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        specialty: user.specialty,
        hospital: user.hospital,
        location: user.location,
        onboardingCompleted: user.onboardingCompleted
      }
    };
  }

  /**
   * Authenticate user login
   * @param {Object} credentials - Login credentials
   * @returns {Promise<Object>} User and token
   */
  async login(credentials) {
    const { email, password } = credentials;

    if (!email || !password) {
      throw {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: ERROR_MESSAGE.EMAIL_REQUIRED
      };
    }

    // Find user and include password
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      logger.logAuth('login', email, false, ERROR_MESSAGE.USER_NOT_FOUND);
      logger.logSecurity('failed_login_attempt', { email, reason: ERROR_MESSAGE.USER_NOT_FOUND });
      throw {
        statusCode: HTTP_STATUS.UNAUTHORIZED,
        message: ERROR_MESSAGE.INVALID_CREDENTIALS
      };
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      logger.logAuth('login', email, false, 'Invalid password');
      logger.logSecurity('failed_login_attempt', { email, reason: 'Invalid password' });
      throw {
        statusCode: HTTP_STATUS.UNAUTHORIZED,
        message: ERROR_MESSAGE.INVALID_CREDENTIALS
      };
    }

    // Generate token
    const token = generateToken(user._id);

    // Update last active — don't block login if this fails
    try {
      user.lastActive = new Date();
      await user.save();
    } catch (error) {
      logger.error('Failed to update lastActive on login', {
        userId: user._id,
        error: error.message
      });
    }

    logger.logAuth('login', email, true);
    logger.info('User Login', {
      userId: user._id,
      email: user.email,
      role: user.role
    });

    return {
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        specialty: user.specialty,
        hospital: user.hospital,
        location: user.location,
        onboardingCompleted: user.onboardingCompleted,
        profileStrength: user.profileStrength
      }
    };
  }

  /**
   * Get user profile by ID
   * @param {String} userId - User ID
   * @returns {Promise<Object>} User profile
   */
  async getUserProfile(userId) {
    const user = await User.findById(userId).select('-password');

    if (!user) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: ERROR_MESSAGE.USER_NOT_FOUND
      };
    }

    return user;
  }

  /**
   * Update user profile
   * @param {String} userId - User ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} Updated user
   */
  async updateProfile(userId, updateData) {
    const user = await User.findById(userId);

    if (!user) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: ERROR_MESSAGE.USER_NOT_FOUND
      };
    }

    // Update fields
    Object.keys(updateData).forEach(key => {
      user[key] = updateData[key];
    });

    // Recalculate profile strength
    user.calculateProfileStrength();

    await user.save();

    logger.info('Profile Updated', {
      userId: user._id,
      email: user.email
    });

    return user;
  }

  /**
   * Verify user credentials for sensitive operations
   * @param {String} userId - User ID
   * @param {String} password - Password to verify
   * @returns {Promise<Boolean>} Verification result
   */
  async verifyPassword(userId, password) {
    const user = await User.findById(userId).select('+password');

    if (!user) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: ERROR_MESSAGE.USER_NOT_FOUND
      };
    }

    return await user.comparePassword(password);
  }
}

module.exports = new AuthService();
