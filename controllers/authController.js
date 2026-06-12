const authService = require('../services/authService');
const patientService = require('../services/patientService');
const { SUCCESS_MESSAGE } = require('../constants');
const logger = require('../utils/logger');
const responseHelper = require('../utils/responseHelper');
const {
  generateAccessToken,
  generateRefreshToken,
  parseCookieHeader,
  verifyRefreshToken
} = require('../middleware/auth');
const refreshSessionService = require('../services/refreshSessionService');
const {
  REFRESH_TOKEN_COOKIE,
  setAuthCookies,
  clearAuthCookies
} = require('../utils/authCookies');
const { addMobileTokens, isMobileRequest } = require('../utils/mobileAuth');

const getRefreshTokenFromRequest = (req) => {
  if (req.cookies && req.cookies[REFRESH_TOKEN_COOKIE]) {
    return req.cookies[REFRESH_TOKEN_COOKIE];
  }

  const cookieToken = parseCookieHeader(req.headers.cookie)[REFRESH_TOKEN_COOKIE];
  if (cookieToken) {
    return cookieToken;
  }

  return isMobileRequest(req) && req.body ? req.body.refreshToken : null;
};

const getResultUserId = (result) => {
  const profile = result.user || result.patient;
  return profile && (profile.id || profile._id);
};

const getResultUserType = (result) => (result.patient ? 'patient' : 'user');

// Register new user
exports.register = async (req, res, next) => {
  try {
    const result = await authService.register(req.body);
    await refreshSessionService.create({
      token: result.refreshToken,
      userId: getResultUserId(result),
      userType: getResultUserType(result),
      req
    });
    setAuthCookies(res, result);

    responseHelper.sendCreated(res, addMobileTokens(req, {
      user: result.user
    }, result), SUCCESS_MESSAGE.USER_REGISTERED);
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
    await refreshSessionService.create({
      token: result.refreshToken,
      userId: getResultUserId(result),
      userType: getResultUserType(result),
      req
    });
    setAuthCookies(res, result);

    responseHelper.sendSuccess(res, addMobileTokens(req, {
      user: result.user
    }, result), SUCCESS_MESSAGE.LOGIN_SUCCESS);
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

// Refresh short-lived access cookie from httpOnly refresh cookie
exports.refresh = async (req, res, next) => {
  try {
    const refreshToken = getRefreshTokenFromRequest(req);

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized - No refresh token provided'
      });
    }

    const decoded = verifyRefreshToken(refreshToken);

    if (decoded.type !== 'refresh') {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token'
      });
    }

    const token = generateAccessToken(decoded.id);
    const replacementRefreshToken = generateRefreshToken(decoded.id);
    const currentSession = await refreshSessionService.rotate({
      currentToken: refreshToken,
      replacementToken: replacementRefreshToken,
      req
    });

    if (!currentSession) {
      clearAuthCookies(res);
      return res.status(401).json({
        success: false,
        message: 'Refresh token has been revoked or expired'
      });
    }

    let payload;
    if (currentSession.userType === 'patient') {
      const patient = await patientService.getProfile(decoded.id);
      payload = { patient };
    } else {
      const user = await authService.getUserProfile(decoded.id);
      payload = { user };
    }

    setAuthCookies(res, {
      token,
      refreshToken: replacementRefreshToken
    });

    responseHelper.sendSuccess(res, addMobileTokens(req, payload, {
      token,
      refreshToken: replacementRefreshToken
    }), 'Session refreshed');
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      clearAuthCookies(res);
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token'
      });
    }

    responseHelper.handleServiceError(error, res, next);
  }
};

// Clear cookie-backed session
exports.logout = async (req, res, next) => {
  try {
    await refreshSessionService.revoke(getRefreshTokenFromRequest(req));
    clearAuthCookies(res);
    responseHelper.sendSuccess(res, {}, 'Logged out successfully');
  } catch (error) {
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
