const authService = require('../services/authService');
const { HTTP_STATUS, SUCCESS_MESSAGE } = require('../constants');
const logger = require('../utils/logger');

// Register new user
exports.register = async (req, res, next) => {
  try {
    const result = await authService.register(req.body);

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: SUCCESS_MESSAGE.USER_REGISTERED,
      token: result.token,
      user: result.user
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        error: error.details
      });
    }

    logger.error('Registration Error', {
      email: req.body.email,
      error: error.message,
      stack: error.stack
    });
    next(error);
  }
};

// Login user
exports.login = async (req, res, next) => {
  try {
    const result = await authService.login(req.body);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: SUCCESS_MESSAGE.LOGIN_SUCCESS,
      token: result.token,
      user: result.user
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    logger.error('Login Error', {
      email: req.body.email,
      error: error.message
    });
    next(error);
  }
};

// Get current user
exports.getMe = async (req, res, next) => {
  try {
    const user = await authService.getUserProfile(req.user._id);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      user
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

// Update profile
exports.updateMe = async (req, res, next) => {
  try {
    const user = await authService.updateProfile(req.user._id, req.body);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: SUCCESS_MESSAGE.PROFILE_UPDATED,
      user
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
