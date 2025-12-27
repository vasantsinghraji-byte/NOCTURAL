/**
 * Doctor Access Controller
 *
 * HTTP request handlers for doctor access control endpoints.
 * Thin layer that delegates to doctorAccessService.
 */

const doctorAccessService = require('../services/doctorAccessService');
const emergencySummaryService = require('../services/emergencySummaryService');
const HealthDataAccessLog = require('../models/healthDataAccessLog');
const responseHelper = require('../utils/responseHelper');

// ==================== Doctor Endpoints ====================

/**
 * @desc    Get doctor's active access tokens
 * @route   GET /api/v1/doctor-access/my-tokens
 * @access  Private (Doctor/Nurse/Physiotherapist)
 */
exports.getMyAccessTokens = async (req, res, next) => {
  try {
    const doctorId = req.user._id;
    const tokens = await doctorAccessService.getMyAccessTokens(doctorId);

    responseHelper.sendSuccess(res, { tokens }, 'Access tokens loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    View patient data (with valid access token)
 * @route   GET /api/v1/doctor-access/patients/:patientId
 * @access  Private (Doctor/Nurse/Physiotherapist - with valid token)
 */
exports.getPatientData = async (req, res, next) => {
  try {
    const doctorId = req.user._id;
    const { patientId } = req.params;

    const data = await doctorAccessService.getPatientDataForDoctor(
      doctorId,
      patientId,
      'HEALTH_RECORD',
      req.ip
    );

    responseHelper.sendSuccess(res, { patient: data }, 'Patient data loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get patient's health records (with valid access token)
 * @route   GET /api/v1/doctor-access/patients/:patientId/records
 * @access  Private (Doctor/Nurse/Physiotherapist - with valid token)
 */
exports.getPatientRecords = async (req, res, next) => {
  try {
    const doctorId = req.user._id;
    const { patientId } = req.params;

    const data = await doctorAccessService.getPatientDataForDoctor(
      doctorId,
      patientId,
      'HEALTH_RECORD',
      req.ip
    );

    responseHelper.sendSuccess(res, { records: data }, 'Health records loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get patient's health metrics (with valid access token)
 * @route   GET /api/v1/doctor-access/patients/:patientId/metrics
 * @access  Private (Doctor/Nurse/Physiotherapist - with valid token)
 */
exports.getPatientMetrics = async (req, res, next) => {
  try {
    const doctorId = req.user._id;
    const { patientId } = req.params;

    const data = await doctorAccessService.getPatientDataForDoctor(
      doctorId,
      patientId,
      'HEALTH_METRIC',
      req.ip
    );

    responseHelper.sendSuccess(res, { metrics: data }, 'Health metrics loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Add doctor note for patient
 * @route   POST /api/v1/doctor-access/patients/:patientId/notes
 * @access  Private (Doctor - with valid token)
 */
exports.addDoctorNote = async (req, res, next) => {
  try {
    const doctorId = req.user._id;
    const { patientId } = req.params;
    const noteData = req.body;

    const DoctorNote = require('../models/doctorNote');
    const note = await DoctorNote.create({
      patient: patientId,
      doctor: doctorId,
      booking: req.healthAccess?.bookingId,
      ...noteData
    });

    // Log the access
    await doctorAccessService.logAccess(
      {
        userId: doctorId,
        userType: req.user.role,
        name: req.user.name,
        role: req.user.role
      },
      patientId,
      'DOCTOR_NOTE',
      note._id,
      'CREATE',
      req.healthAccess?.bookingId,
      req.healthAccess?.accessTokenId,
      req.ip
    );

    responseHelper.sendCreated(res, { note }, 'Note added');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

// ==================== Patient Endpoints ====================

/**
 * @desc    See who has access to my data
 * @route   GET /api/v1/doctor-access/who-has-access
 * @access  Private (Patient)
 */
exports.getWhoHasAccess = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const tokens = await doctorAccessService.getPatientAccessTokens(patientId);

    responseHelper.sendSuccess(res, { accessTokens: tokens }, 'Access tokens loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Revoke doctor access (by patient)
 * @route   POST /api/v1/doctor-access/revoke/:tokenId
 * @access  Private (Patient)
 */
exports.revokeAccessByPatient = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const { tokenId } = req.params;
    const { reason } = req.body;

    await doctorAccessService.revokeAccessByPatient(tokenId, patientId, reason);

    responseHelper.sendSuccess(res, {}, 'Access revoked');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get my access history
 * @route   GET /api/v1/doctor-access/my-access-history
 * @access  Private (Patient)
 */
exports.getMyAccessHistory = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const { page, limit, startDate, endDate } = req.query;

    const options = {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      startDate,
      endDate
    };

    const result = await HealthDataAccessLog.getPatientAccessHistory(patientId, options);

    responseHelper.sendPaginated(
      res,
      result.logs,
      result.pagination,
      'Access history loaded'
    );
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

// ==================== Admin Endpoints ====================

/**
 * @desc    Grant doctor access to patient
 * @route   POST /api/v1/doctor-access/grant
 * @access  Private (Admin)
 */
exports.grantAccess = async (req, res, next) => {
  try {
    const adminId = req.user._id;
    const { patientId, doctorId, bookingId, accessLevel, allowedResources, expiresAt, grantReason } = req.body;

    const tokenData = await doctorAccessService.grantAccess({
      patientId,
      doctorId,
      bookingId,
      accessLevel,
      allowedResources,
      expiresAt,
      grantReason,
      adminId,
      adminName: req.user.name
    });

    responseHelper.sendCreated(res, { accessToken: tokenData }, 'Access granted');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Revoke doctor access (by admin)
 * @route   POST /api/v1/doctor-access/revoke-admin/:tokenId
 * @access  Private (Admin)
 */
exports.revokeAccessByAdmin = async (req, res, next) => {
  try {
    const adminId = req.user._id;
    const { tokenId } = req.params;
    const { reason } = req.body;

    await doctorAccessService.revokeAccessByAdmin(tokenId, adminId, reason);

    responseHelper.sendSuccess(res, {}, 'Access revoked');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    View all access logs
 * @route   GET /api/v1/doctor-access/audit-logs
 * @access  Private (Admin)
 */
exports.getAuditLogs = async (req, res, next) => {
  try {
    const { page, limit, patientId, accessorId, startDate, endDate, action, resourceType } = req.query;

    const options = {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      startDate,
      endDate,
      accessorId,
      action,
      resourceType
    };

    let result;
    if (patientId) {
      result = await HealthDataAccessLog.getPatientAccessHistory(patientId, options);
    } else if (accessorId) {
      result = await HealthDataAccessLog.getAccessorHistory(accessorId, options);
    } else {
      // Get all recent logs
      const skip = (options.page - 1) * options.limit;
      const query = {};

      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }

      const [logs, total] = await Promise.all([
        HealthDataAccessLog.find(query)
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(options.limit)
          .populate('patient', 'name email')
          .lean(),
        HealthDataAccessLog.countDocuments(query)
      ]);

      result = {
        logs,
        pagination: {
          page: options.page,
          limit: options.limit,
          total,
          pages: Math.ceil(total / options.limit)
        }
      };
    }

    responseHelper.sendPaginated(
      res,
      result.logs,
      result.pagination,
      'Audit logs loaded'
    );
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get access statistics
 * @route   GET /api/v1/doctor-access/stats
 * @access  Private (Admin)
 */
exports.getAccessStats = async (req, res, next) => {
  try {
    const { days = 7 } = req.query;

    const [accessStats, tokenStats] = await Promise.all([
      HealthDataAccessLog.getAccessStats(parseInt(days)),
      require('../models/healthAccessToken').getTokenStats()
    ]);

    responseHelper.sendSuccess(res, {
      accessStats,
      tokenStats
    }, 'Access statistics loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

// ==================== Public Endpoint ====================

/**
 * @desc    Get emergency data via QR token
 * @route   GET /api/v1/emergency/:qrToken
 * @access  Public
 */
exports.getEmergencyData = async (req, res, next) => {
  try {
    const { qrToken } = req.params;

    const data = await emergencySummaryService.getEmergencyDataByToken(qrToken);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: 'Emergency data not found or token expired'
      });
    }

    responseHelper.sendSuccess(res, { emergency: data }, 'Emergency data loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};
