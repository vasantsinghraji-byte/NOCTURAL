const authService = require('../services/authService');
const { SUCCESS_MESSAGE } = require('../constants');
const logger = require('../utils/logger');
const responseHelper = require('../utils/responseHelper');

// Register new user
exports.register = async (req, res, next) => {
  try {
    const result = await authService.register(req.body);

    responseHelper.sendCreated(res, {
      token: result.token,
      user: result.user
    }, SUCCESS_MESSAGE.USER_REGISTERED);
  } catch (error) {
    if (!error.statusCode) {
      logger.error('Registration Error', {
        email: req.body.email,
        error: error.message,
        stack: error.stack
      });
    }
    responseHelper.handleServiceError(error, res, next);
  }
};

// Login user
exports.login = async (req, res, next) => {
  try {
    const result = await authService.login(req.body);

    responseHelper.sendSuccess(res, {
      token: result.token,
      user: result.user
    }, SUCCESS_MESSAGE.LOGIN_SUCCESS);
  } catch (error) {
    if (!error.statusCode) {
      logger.error('Login Error', {
        email: req.body.email,
        error: error.message
      });
    }
    responseHelper.handleServiceError(error, res, next);
  }
};

// Get current user
exports.getMe = async (req, res, next) => {
  try {
    const user = await authService.getUserProfile(req.user.id);

    responseHelper.sendSuccess(res, { user });
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

// Update profile
exports.updateMe = async (req, res, next) => {
  try {
    const user = await authService.updateProfile(req.user.id, req.body);

    responseHelper.sendSuccess(res, { user }, SUCCESS_MESSAGE.PROFILE_UPDATED);
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

// Change password
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    await authService.updatePassword(req.user.id, currentPassword, newPassword);

    responseHelper.sendSuccess(res, {}, 'Password updated successfully');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};
