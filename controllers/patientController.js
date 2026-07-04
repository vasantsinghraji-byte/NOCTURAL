/**
 * Patient Controller
 *
 * HTTP request handlers for patient operations (B2C customers)
 * Thin layer that delegates to patientService
 */

const patientService = require('../services/patientService');
const { SUCCESS_MESSAGE } = require('../constants');
const responseHelper = require('../utils/responseHelper');
const { setAuthCookies, clearAuthCookies } = require('../utils/authCookies');
const refreshSessionService = require('../services/refreshSessionService');
const { addMobileTokens } = require('../utils/mobileAuth');
const securityAuditService = require('../services/securityAuditService');
const { getRequestSecurityMetadata } = require('../utils/requestSecurityMetadata');

const getPatientId = (result) => result.patient && (result.patient.id || result.patient._id);
const MEDICAL_HISTORY_CATEGORIES = new Set([
  'conditions',
  'allergies',
  'currentMedications',
  'surgeries',
  'familyHistory'
]);

/**
 * @desc    Register a new patient
 * @route   POST /api/patients/register
 * @access  Public
 */
exports.register = async (req, res, next) => {
  try {
    const result = await patientService.register(req.body);
    await refreshSessionService.create({
      token: result.refreshToken,
      userId: getPatientId(result),
      userType: 'patient',
      req
    });
    setAuthCookies(res, result);

    responseHelper.sendCreated(
      res,
      addMobileTokens(req, { patient: result.patient }, result),
      'Patient registered successfully'
    );
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Login patient
 * @route   POST /api/patients/login
 * @access  Public
 */
exports.login = async (req, res, next) => {
  try {
    const result = await patientService.login(req.body);
    await refreshSessionService.create({
      token: result.refreshToken,
      userId: getPatientId(result),
      userType: 'patient',
      req
    });
    setAuthCookies(res, result);

    responseHelper.sendSuccess(
      res,
      addMobileTokens(req, { patient: result.patient }, result),
      'Login successful'
    );
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get patient profile
 * @route   GET /api/patients/me
 * @access  Private (Patient)
 */
exports.getMe = async (req, res, next) => {
  try {
    const patient = await patientService.getProfile(req.user.id);

    responseHelper.sendSuccess(res, { patient }, 'Profile fetched successfully');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Update patient profile
 * @route   PUT /api/patients/me
 * @access  Private (Patient)
 */
exports.updateMe = async (req, res, next) => {
  try {
    const patient = await patientService.updateProfile(req.user.id, req.body);

    responseHelper.sendSuccess(res, { patient }, SUCCESS_MESSAGE.PROFILE_UPDATED);
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Add new address
 * @route   POST /api/patients/me/addresses
 * @access  Private (Patient)
 */
exports.addAddress = async (req, res, next) => {
  try {
    const patient = await patientService.addAddress(req.user.id, req.body);

    responseHelper.sendCreated(res, { patient }, 'Address added successfully');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Update an address
 * @route   PUT /api/patients/me/addresses/:addressId
 * @access  Private (Patient)
 */
exports.updateAddress = async (req, res, next) => {
  try {
    const patient = await patientService.updateAddress(
      req.user.id,
      req.params.addressId,
      req.body
    );

    responseHelper.sendSuccess(res, { patient }, 'Address updated successfully');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Delete an address
 * @route   DELETE /api/patients/me/addresses/:addressId
 * @access  Private (Patient)
 */
exports.deleteAddress = async (req, res, next) => {
  try {
    const patient = await patientService.deleteAddress(
      req.user.id,
      req.params.addressId
    );

    responseHelper.sendSuccess(res, { patient }, 'Address deleted successfully');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Add medical history entry
 * @route   POST /api/patients/me/medical-history/:category
 * @access  Private (Patient)
 */
exports.addMedicalHistory = async (req, res, next) => {
  try {
    const category = String(req.params.category || '').trim();
    if (!MEDICAL_HISTORY_CATEGORIES.has(category)) {
      return responseHelper.sendBadRequest(res, 'Invalid medical history category');
    }

    const patient = await patientService.addMedicalHistory(
      req.user.id,
      category,
      req.body
    );

    responseHelper.sendCreated(res, { patient }, 'Medical history added successfully');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Update medical habits
 * @route   PUT /api/patients/me/medical-history/habits
 * @access  Private (Patient)
 */
exports.updateMedicalHabits = async (req, res, next) => {
  try {
    const patient = await patientService.updateMedicalHabits(req.user.id, req.body);

    responseHelper.sendSuccess(res, { patient }, 'Medical habits updated successfully');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get patient booking statistics
 * @route   GET /api/patients/me/stats
 * @access  Private (Patient)
 */
exports.getBookingStats = async (req, res, next) => {
  try {
    const stats = await patientService.getBookingStats(req.user.id);

    responseHelper.sendSuccess(res, { stats }, 'Statistics fetched successfully');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Verify password
 * @route   POST /api/patients/me/verify-password
 * @access  Private (Patient)
 */
exports.verifyPassword = async (req, res, next) => {
  try {
    // Presence/type validation lives in the route chain (routes/patient.js);
    // the password comparison always runs — no user-controlled early return.
    const isValid = await patientService.verifyPassword(req.user.id, req.body.password);

    responseHelper.sendSuccess(res, { isValid }, 'Password verification completed');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    const result = await patientService.updatePassword(
      req.user.id,
      req.body.currentPassword,
      req.body.newPassword,
      {
        webauthnConfirmationId: req.body.webauthnConfirmationId,
        notificationMetadata: getRequestSecurityMetadata(req)
      }
    );
    clearAuthCookies(res);
    await securityAuditService.record({
      event: 'password_changed',
      actorId: req.user.id,
      actorType: 'patient',
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
      userType: 'patient'
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
      userType: 'patient'
    });
    if (!session) return responseHelper.sendNotFound(res, 'Session not found');
    await securityAuditService.record({
      event: 'session_revoked',
      actorId: req.user.id,
      actorType: 'patient',
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
      userType: 'patient',
      reason: 'USER_LOGOUT_EVERYWHERE'
    });
    clearAuthCookies(res);
    await securityAuditService.record({
      event: 'all_sessions_revoked',
      actorId: req.user.id,
      actorType: 'patient',
      outcome: 'success',
      req
    });
    responseHelper.sendSuccess(res, {}, 'All sessions revoked');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};
