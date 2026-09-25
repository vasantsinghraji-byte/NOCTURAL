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
const { IDENTITY_TYPES } = require('../utils/authTokens');
const refreshSessionService = require('../services/refreshSessionService');
const {
  REFRESH_TOKEN_COOKIE,
  setAuthCookies,
  clearAuthCookies
} = require('../utils/authCookies');
const { addMobileTokens, isMobileRequest } = require('../utils/mobileAuth');
const { PORTAL_LABELS, isRoleAllowedInPortal, portalForRole } = require('../constants/portals');
const adminMfa = require('../services/adminMfaService');
const securityAuditService = require('../services/securityAuditService');
const { getRequestSecurityMetadata } = require('../utils/requestSecurityMetadata');

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

const requireRefreshTokenFromRequest = (req) => {
  const token = getRefreshTokenFromRequest(req);
  if (!token) {
    const error = new Error('No refresh token provided');
    error.name = 'MissingRefreshTokenError';
    throw error;
  }
  return token;
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

    // Separate login per partner type: refuse before any session/cookie exists.
    const { portal } = req.body;
    const role = result.user && result.user.role;
    if (portal && !isRoleAllowedInPortal(portal, role)) {
      logger.logSecurity('login_wrong_portal', { email: req.body.email, portal, role });
      const home = portalForRole(role);
      return responseHelper.sendForbidden(res, home
        ? `This is a ${PORTAL_LABELS[portal]} login. Please sign in from the ${PORTAL_LABELS[home]} login.`
        : `This account can't sign in to the ${PORTAL_LABELS[portal]} portal.`);
    }

    // Admin roles: password alone never creates a session. Hand back a short-lived
    // challenge; the session is issued by /auth/admin-mfa after the second step.
    if (adminMfa.isRequired() && adminMfa.isAdminRole(role)) {
      const challenge = await adminMfa.createChallenge(getResultUserId(result));
      logger.logSecurity('admin_password_ok_mfa_pending', { userId: String(getResultUserId(result)), enrolled: challenge.enrolled });
      return responseHelper.sendSuccess(res, challenge, 'Enter the code from your authenticator app');
    }

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
    const refreshToken = requireRefreshTokenFromRequest(req);

    const decoded = verifyRefreshToken(refreshToken);

    const identityType = decoded.identityType === IDENTITY_TYPES.PATIENT
      ? IDENTITY_TYPES.PATIENT
      : IDENTITY_TYPES.USER;
    // Carry how the session was established (admin MFA + sign-in time) unchanged.
    const auth = { mfa: decoded.mfa === true, authTime: decoded.authTime };
    const token = generateAccessToken(decoded.id, identityType, decoded.sessionVersion, auth);
    const replacementRefreshToken = generateRefreshToken(decoded.id, identityType, decoded.sessionVersion, auth);
    const currentSession = await refreshSessionService.rotate({
      currentToken: refreshToken,
      replacementToken: replacementRefreshToken,
      req
    });

    if (!currentSession) {
      clearAuthCookies(res);
      return responseHelper.sendUnauthorized(res, 'Refresh token has been revoked or expired');
    }
    const expectedUserType = identityType === IDENTITY_TYPES.PATIENT ? 'patient' : 'user';
    if (currentSession.userType !== expectedUserType) {
      clearAuthCookies(res);
      return responseHelper.sendUnauthorized(res, 'Refresh token identity does not match session');
    }

    let payload;
    if (currentSession.userType === 'patient') {
      const patient = await patientService.getProfile(decoded.id);
      payload = { patient };
    } else {
      const user = await authService.getUserProfile(decoded.id);
      // Admin sessions can't be refreshed past the max age or without the second step.
      if (user && adminMfa.sessionProblem(user.role, decoded)) {
        await refreshSessionService.revoke(replacementRefreshToken);
        clearAuthCookies(res);
        return responseHelper.sendUnauthorized(res, 'Admin session expired - please sign in again');
      }
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
    if (error.name === 'MissingRefreshTokenError') {
      return responseHelper.sendUnauthorized(res, 'Not authorized - No refresh token provided');
    }
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      clearAuthCookies(res);
      return responseHelper.sendUnauthorized(res, 'Invalid or expired refresh token');
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
    const isPatient = req.userType === IDENTITY_TYPES.PATIENT || !req.user.role;
    const passwordService = isPatient ? patientService : authService;

    const result = await passwordService.updatePassword(
      req.user.id,
      currentPassword,
      newPassword,
      {
        webauthnConfirmationId: req.body.webauthnConfirmationId,
        notificationMetadata: getRequestSecurityMetadata(req)
      }
    );
    clearAuthCookies(res);
    await securityAuditService.record({
      event: 'password_changed',
      actorId: req.user.id,
      actorType: isPatient ? 'patient' : 'user',
      outcome: 'success',
      req,
      metadata: {
        revokedSessions: result.revokedSessions,
        sessionVersion: result.identity.sessionVersion
      }
    });
    responseHelper.sendSuccess(res, {}, 'Password updated successfully');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.listSessions = async (req, res, next) => {
  try {
    const sessions = await refreshSessionService.listForUser({
      userId: req.user.id,
      userType: 'user'
    });
    responseHelper.sendSuccess(res, { sessions });
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.revokeSession = async (req, res, next) => {
  try {
    const session = await refreshSessionService.revokeById({
      sessionId: req.params.sessionId,
      userId: req.user.id,
      userType: 'user'
    });
    if (!session) return responseHelper.sendNotFound(res, 'Session not found');
    await securityAuditService.record({
      event: 'session_revoked',
      actorId: req.user.id,
      actorType: 'user',
      targetType: 'refresh_session',
      targetId: req.params.sessionId,
      outcome: 'success',
      req
    });
    responseHelper.sendSuccess(res, {}, 'Session revoked');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.revokeAllSessions = async (req, res, next) => {
  try {
    await refreshSessionService.revokeAllForUser({
      userId: req.user.id,
      userType: 'user',
      reason: 'USER_LOGOUT_EVERYWHERE'
    });
    clearAuthCookies(res);
    await securityAuditService.record({
      event: 'all_sessions_revoked',
      actorId: req.user.id,
      actorType: 'user',
      outcome: 'success',
      req
    });
    responseHelper.sendSuccess(res, {}, 'All sessions revoked');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};
