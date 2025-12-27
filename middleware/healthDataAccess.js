/**
 * Health Data Access Middleware
 *
 * Access control and audit logging for health data endpoints.
 * Implements HIPAA-style access control and comprehensive audit logging.
 */

const HealthAccessToken = require('../models/healthAccessToken');
const HealthDataAccessLog = require('../models/healthDataAccessLog');
const HealthRecord = require('../models/healthRecord');
const Patient = require('../models/patient');
const logger = require('../utils/logger');
const { USER_TYPES, ALLOWED_RESOURCES, AUDIT_ACTIONS, ACCESS_REASONS } = require('../constants/healthConstants');

/**
 * Validate health data access
 * Checks if:
 * 1. Patient is accessing their own data
 * 2. Doctor/Provider has a valid access token for this patient
 * 3. Admin is accessing for audit purposes
 */
exports.validateHealthAccess = (resourceType) => {
  return async (req, res, next) => {
    try {
      const { patientId } = req.params;
      const userId = req.user._id;
      const userType = req.userType;
      const userRole = req.user.role;

      // If patient accessing their own data
      if (userType === 'patient') {
        if (patientId && patientId !== userId.toString()) {
          logger.logSecurity('health_data_access_denied', {
            reason: 'Patient trying to access other patient data',
            patientId: userId,
            targetPatientId: patientId
          });
          return res.status(403).json({
            success: false,
            message: 'You can only access your own health data'
          });
        }

        // Patient accessing own data - allowed
        req.healthAccess = {
          type: 'SELF',
          patientId: userId,
          accessLevel: 'READ_WRITE',
          allowedResources: Object.values(ALLOWED_RESOURCES),
          userType: USER_TYPES.PATIENT
        };

        return next();
      }

      // Admin access (for audit purposes)
      if (userRole === 'admin') {
        req.healthAccess = {
          type: 'ADMIN',
          patientId,
          accessLevel: 'READ_ONLY', // Admins can only read, not modify
          allowedResources: Object.values(ALLOWED_RESOURCES),
          userType: USER_TYPES.ADMIN,
          reason: ACCESS_REASONS.ADMIN_AUDIT
        };

        return next();
      }

      // Provider access - must have valid access token
      if (['doctor', 'nurse', 'physiotherapist'].includes(userRole)) {
        if (!patientId) {
          return res.status(400).json({
            success: false,
            message: 'Patient ID required'
          });
        }

        // Check for valid access token
        const accessToken = await HealthAccessToken.hasAccess(userId, patientId);

        if (!accessToken) {
          logger.logSecurity('health_data_access_denied', {
            reason: 'No valid access token',
            providerId: userId,
            patientId,
            providerRole: userRole
          });
          return res.status(403).json({
            success: false,
            message: 'You do not have access to this patient\'s health data'
          });
        }

        // Check if requested resource is allowed
        if (resourceType && !accessToken.allowedResources.includes(resourceType)) {
          return res.status(403).json({
            success: false,
            message: `Your access does not include ${resourceType}`
          });
        }

        // Record token usage
        await accessToken.recordUsage(req.ip);

        req.healthAccess = {
          type: 'TOKEN',
          patientId,
          accessLevel: accessToken.accessLevel,
          allowedResources: accessToken.allowedResources,
          accessTokenId: accessToken._id,
          userType: USER_TYPES[userRole.toUpperCase()] || USER_TYPES.PROVIDER,
          bookingId: accessToken.booking,
          reason: accessToken.booking ? ACCESS_REASONS.BOOKING_ASSIGNMENT : ACCESS_REASONS.DIRECT_ACCESS
        };

        return next();
      }

      // Unknown user type
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });

    } catch (error) {
      logger.error('Health access validation error', {
        error: error.message,
        userId: req.user?._id,
        patientId: req.params?.patientId
      });
      return res.status(500).json({
        success: false,
        message: 'Error validating health data access'
      });
    }
  };
};

/**
 * Audit health data access
 * Logs all access attempts to HealthDataAccessLog
 * Should run on response finish to capture success/failure
 */
exports.auditHealthAccess = (resourceType, action) => {
  return async (req, res, next) => {
    // Store original end function
    const originalEnd = res.end;

    // Override res.end to log after response
    res.end = function(chunk, encoding) {
      // Restore original function and call it
      res.end = originalEnd;
      res.end(chunk, encoding);

      // Log access asynchronously (don't block response)
      setImmediate(async () => {
        try {
          const healthAccess = req.healthAccess || {};
          const user = req.user;

          if (!user) return;

          // Determine patient ID
          let patientId = req.params?.patientId;
          if (!patientId && req.userType === 'patient') {
            patientId = user._id;
          }

          if (!patientId) return;

          // Build accessor info
          const accessor = {
            userId: user._id,
            userModel: req.userType === 'patient' ? 'Patient' : 'User',
            userType: healthAccess.userType || (req.userType === 'patient' ? USER_TYPES.PATIENT : USER_TYPES.PROVIDER),
            name: user.name,
            email: user.email,
            role: user.role || 'patient'
          };

          // Log the access
          await HealthDataAccessLog.logAccess({
            accessor,
            patient: patientId,
            resourceType: resourceType || ALLOWED_RESOURCES.HEALTH_RECORD,
            resourceId: req.params?.recordId || req.params?.metricId,
            action: action || AUDIT_ACTIONS.VIEW,
            accessReason: healthAccess.reason || ACCESS_REASONS.DIRECT_ACCESS,
            bookingId: healthAccess.bookingId,
            accessTokenId: healthAccess.accessTokenId?.toString(),
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.originalUrl,
            method: req.method,
            success: res.statusCode < 400,
            errorMessage: res.statusCode >= 400 ? res.statusMessage : undefined
          });

        } catch (error) {
          logger.error('Failed to log health data access', {
            error: error.message,
            userId: req.user?._id,
            endpoint: req.originalUrl
          });
        }
      });
    };

    next();
  };
};

/**
 * Check if doctor is assigned to review a specific intake
 */
exports.checkIntakeAssignment = async (req, res, next) => {
  try {
    const { intakeId } = req.params;
    const doctorId = req.user._id;
    const userRole = req.user.role;

    // Admins can access any intake
    if (userRole === 'admin') {
      return next();
    }

    // Only doctors can review intakes
    if (userRole !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Only doctors can review health intakes'
      });
    }

    // Get the intake record
    const record = await HealthRecord.findById(intakeId);

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Intake record not found'
      });
    }

    // Check if this doctor is assigned
    if (!record.review?.assignedTo || record.review.assignedTo.toString() !== doctorId.toString()) {
      logger.logSecurity('intake_access_denied', {
        reason: 'Doctor not assigned to this intake',
        doctorId,
        intakeId,
        assignedTo: record.review?.assignedTo
      });
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to review this intake'
      });
    }

    // Attach record to request for convenience
    req.intakeRecord = record;
    next();

  } catch (error) {
    logger.error('Intake assignment check error', {
      error: error.message,
      doctorId: req.user?._id,
      intakeId: req.params?.intakeId
    });
    return res.status(500).json({
      success: false,
      message: 'Error checking intake assignment'
    });
  }
};

/**
 * Verify patient can modify their own health data
 * Used for patient-initiated health record updates
 */
exports.verifyPatientSelfAccess = async (req, res, next) => {
  try {
    if (req.userType !== 'patient') {
      return res.status(403).json({
        success: false,
        message: 'This endpoint is for patients only'
      });
    }

    const patientId = req.params.patientId || req.user._id.toString();

    // Ensure patient is accessing their own data
    if (patientId !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only modify your own health data'
      });
    }

    req.healthAccess = {
      type: 'SELF',
      patientId: req.user._id,
      accessLevel: 'READ_WRITE',
      userType: USER_TYPES.PATIENT
    };

    next();
  } catch (error) {
    logger.error('Patient self-access verification error', {
      error: error.message,
      userId: req.user?._id
    });
    return res.status(500).json({
      success: false,
      message: 'Error verifying access'
    });
  }
};

/**
 * Check if provider can add notes for a patient
 * Requires either active booking assignment or access token
 */
exports.checkNotePermission = async (req, res, next) => {
  try {
    const { patientId } = req.params;
    const providerId = req.user._id;
    const userRole = req.user.role;

    // Only doctors can add notes
    if (!['doctor', 'nurse', 'physiotherapist'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Only healthcare providers can add notes'
      });
    }

    // Check for valid access token with write permission
    const accessToken = await HealthAccessToken.hasAccess(providerId, patientId);

    if (!accessToken) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this patient'
      });
    }

    // Check if access allows writing notes
    if (!accessToken.allowedResources.includes(ALLOWED_RESOURCES.DOCTOR_NOTE)) {
      return res.status(403).json({
        success: false,
        message: 'Your access does not include adding notes'
      });
    }

    if (accessToken.accessLevel !== 'READ_WRITE') {
      return res.status(403).json({
        success: false,
        message: 'You have read-only access to this patient'
      });
    }

    req.healthAccess = {
      type: 'TOKEN',
      patientId,
      accessLevel: accessToken.accessLevel,
      accessTokenId: accessToken._id,
      bookingId: accessToken.booking,
      userType: USER_TYPES[userRole.toUpperCase()]
    };

    // Record token usage
    await accessToken.recordUsage(req.ip);

    next();
  } catch (error) {
    logger.error('Note permission check error', {
      error: error.message,
      providerId: req.user?._id,
      patientId: req.params?.patientId
    });
    return res.status(500).json({
      success: false,
      message: 'Error checking note permission'
    });
  }
};

/**
 * Rate limit health data access per provider per patient
 * Prevents abuse of access tokens
 */
exports.rateLimitHealthAccess = (maxRequests = 100, windowMs = 60 * 60 * 1000) => {
  const accessCounts = new Map();

  return async (req, res, next) => {
    if (req.userType === 'patient') {
      // Don't rate limit patients on their own data
      return next();
    }

    const providerId = req.user._id.toString();
    const patientId = req.params.patientId;

    if (!patientId) return next();

    const key = `${providerId}:${patientId}`;
    const now = Date.now();

    // Get or create access record
    let record = accessCounts.get(key);
    if (!record || now - record.windowStart > windowMs) {
      record = { count: 0, windowStart: now };
    }

    record.count++;
    accessCounts.set(key, record);

    if (record.count > maxRequests) {
      logger.logSecurity('health_access_rate_limited', {
        providerId,
        patientId,
        count: record.count
      });
      return res.status(429).json({
        success: false,
        message: 'Too many requests for this patient\'s data. Please try again later.'
      });
    }

    next();
  };
};

module.exports = {
  validateHealthAccess: exports.validateHealthAccess,
  auditHealthAccess: exports.auditHealthAccess,
  checkIntakeAssignment: exports.checkIntakeAssignment,
  verifyPatientSelfAccess: exports.verifyPatientSelfAccess,
  checkNotePermission: exports.checkNotePermission,
  rateLimitHealthAccess: exports.rateLimitHealthAccess
};
