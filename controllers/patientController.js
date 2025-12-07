/**
 * Patient Controller
 *
 * HTTP request handlers for patient operations (B2C customers)
 * Thin layer that delegates to patientService
 */

const patientService = require('../services/patientService');
const { HTTP_STATUS, SUCCESS_MESSAGE } = require('../constants');
const responseHelper = require('../utils/responseHelper');

/**
 * @desc    Register a new patient
 * @route   POST /api/patients/register
 * @access  Public
 */
exports.register = async (req, res, next) => {
  try {
    const result = await patientService.register(req.body);

    responseHelper.sendCreated(res, result, 'Patient registered successfully');
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

    responseHelper.sendSuccess(res, result, 'Login successful');
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
    const patient = await patientService.addMedicalHistory(
      req.user.id,
      req.params.category,
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
    const { password } = req.body;

    if (!password) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Password is required'
      });
    }

    const isValid = await patientService.verifyPassword(req.user.id, password);

    responseHelper.sendSuccess(res, { isValid }, 'Password verification completed');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};
