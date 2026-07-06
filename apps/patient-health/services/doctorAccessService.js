/**
 * Doctor Access Service
 *
 * Business logic for managing doctor access to patient health data.
 * Handles access token management, validation, and audit logging.
 */

const HealthAccessToken = require('../models/healthAccessToken');
const HealthDataAccessLog = require('../models/healthDataAccessLog');
const HealthRecord = require('../models/healthRecord');
const HealthMetric = require('../models/healthMetric');
const DoctorNote = require('../models/doctorNote');
const EmergencySummary = require('../models/emergencySummary');
const Patient = require('../models/patient');
const User = require('@nocturnal/shared').User;
const NurseBooking = require('../models/nurseBooking');
const logger = require('@nocturnal/shared').logger;
const { normalizeObjectId } = require('@nocturnal/shared').safeMongo;
const {
  ACCESS_LEVELS,
  ALLOWED_RESOURCES,
  AUDIT_ACTIONS,
  ACCESS_REASONS,
  USER_TYPES
} = require('../constants/healthConstants');
const { NotFoundError, ValidationError, AuthorizationError } = require('@nocturnal/shared').errors;

class DoctorAccessService {
  /**
   * Grant access to patient data (admin action)
   */
  async grantAccess(data) {
    const {
      patientId,
      doctorId,
      bookingId,
      adminId,
      accessLevel = ACCESS_LEVELS.READ_ONLY,
      allowedResources = [ALLOWED_RESOURCES.HEALTH_RECORD, ALLOWED_RESOURCES.HEALTH_METRIC],
      grantReason,
      expiresAt,
      maxUsage
    } = data;
    const safePatientId = normalizeObjectId(patientId, 'patient id');
    const safeDoctorId = normalizeObjectId(doctorId, 'doctor id');
    const safeAdminId = normalizeObjectId(adminId, 'admin id');
    const safeBookingId = bookingId ? normalizeObjectId(bookingId, 'booking id') : undefined;

    // Validate token constraints
    if (expiresAt !== undefined) {
      const expiry = new Date(expiresAt);
      if (isNaN(expiry.getTime())) {
        throw new ValidationError('expiresAt must be a valid date');
      }
      if (expiry <= new Date()) {
        throw new ValidationError('expiresAt must be a future date');
      }
    }

    if (maxUsage !== undefined) {
      if (!Number.isInteger(maxUsage) || maxUsage < 1) {
        throw new ValidationError('maxUsage must be a positive integer');
      }
    }

    // Validate patient exists
    const patient = await Patient.findById(safePatientId);
    if (!patient) {
      throw new NotFoundError('Patient', patientId);
    }

    // Validate doctor exists and has valid role
    const doctor = await User.findById(safeDoctorId);
    if (!doctor) {
      throw new NotFoundError('User', doctorId);
    }

    const validRoles = ['doctor', 'nurse', 'physiotherapist'];
    if (!validRoles.includes(doctor.role)) {
      throw new ValidationError('User must be a healthcare provider');
    }

    // Validate admin
    const admin = await User.findById(safeAdminId);
    if (!admin || admin.role !== 'admin') {
      throw new AuthorizationError('Only admins can grant access');
    }

    // Hospital boundary enforcement for hospital-scoped admins
    if (admin.hospitalId) {
      // Doctor must belong to the same hospital
      if (!doctor.hospitalId || doctor.hospitalId.toString() !== admin.hospitalId.toString()) {
        logger.logSecurity('cross_hospital_access_attempt', {
          adminId: safeAdminId,
          adminHospitalId: admin.hospitalId,
          doctorId: safeDoctorId,
          doctorHospitalId: doctor.hospitalId
        });
        throw new AuthorizationError(
          'Cannot grant access to a doctor outside your hospital'
        );
      }

      // Patient must have at least one booking with a provider from this hospital
      const hospitalProviderIds = await User.find(
        { hospitalId: admin.hospitalId, role: { $in: validRoles } },
        { _id: 1 }
      ).lean().then(docs => docs.map(d => d._id));

      const patientHasHospitalBooking = await NurseBooking.exists({
        patient: safePatientId,
        serviceProvider: { $in: hospitalProviderIds }
      });

      if (!patientHasHospitalBooking) {
        logger.logSecurity('cross_hospital_patient_access_attempt', {
          adminId: safeAdminId,
          adminHospitalId: admin.hospitalId,
          patientId: safePatientId
        });
        throw new AuthorizationError(
          'Patient has no bookings with your hospital'
        );
      }
    }

    // Generate access token
    const tokenData = await HealthAccessToken.generateToken({
      grantedTo: safeDoctorId,
      grantedToRole: doctor.role,
      grantedToName: doctor.name,
      patient: safePatientId,
      patientName: patient.name,
      booking: safeBookingId,
      accessLevel,
      allowedResources,
      grantedBy: safeAdminId,
      grantedByName: admin.name,
      grantReason,
      expiresAt,
      maxUsage
    });

    // Log the access grant
    await this.logAccess({
      accessor: {
        userId: safeAdminId,
        userType: USER_TYPES.ADMIN,
        name: admin.name,
        role: admin.role
      },
      patient: safePatientId,
      resourceType: ALLOWED_RESOURCES.FULL_HISTORY,
      action: AUDIT_ACTIONS.SHARE,
      accessReason: ACCESS_REASONS.ADMIN_AUDIT,
      bookingId,
      success: true
    });

    logger.info('Doctor access granted', {
      doctorId: safeDoctorId,
      patientId: safePatientId,
      adminId: safeAdminId,
      tokenId: tokenData.tokenId
    });

    return tokenData;
  }

  /**
   * Revoke access by admin
   */
  async revokeAccessByAdmin(tokenId, adminId, reason) {
    const safeTokenId = normalizeObjectId(tokenId, 'access token id');
    const safeAdminId = normalizeObjectId(adminId, 'admin id');
    const token = await HealthAccessToken.findById(safeTokenId);
    if (!token) {
      throw new NotFoundError('HealthAccessToken', tokenId);
    }

    if (!token.isActive) {
      throw new ValidationError('Token is already revoked');
    }

    await token.revoke(safeAdminId, 'ADMIN', reason);

    logger.info('Doctor access revoked by admin', {
      tokenId: safeTokenId,
      doctorId: token.grantedTo,
      patientId: token.patient,
      adminId: safeAdminId,
      reason
    });

    return { success: true };
  }

  /**
   * Revoke access by patient
   */
  async revokeAccessByPatient(tokenId, patientId, reason) {
    const safeTokenId = normalizeObjectId(tokenId, 'access token id');
    const safePatientId = normalizeObjectId(patientId, 'patient id');
    const token = await HealthAccessToken.findById(safeTokenId);
    if (!token) {
      throw new NotFoundError('HealthAccessToken', tokenId);
    }

    // Verify token belongs to this patient
    if (token.patient.toString() !== safePatientId.toString()) {
      throw new AuthorizationError('Not authorized to revoke this token');
    }

    if (!token.isActive) {
      throw new ValidationError('Token is already revoked');
    }

    await token.revoke(safePatientId, 'PATIENT', reason);

    logger.info('Doctor access revoked by patient', {
      tokenId: safeTokenId,
      doctorId: token.grantedTo,
      patientId: safePatientId,
      reason
    });

    return { success: true };
  }

  /**
   * Validate access token
   */
  async validateAccessToken(token) {
    return HealthAccessToken.validateToken(token);
  }

  /**
   * Check if doctor has access to patient data
   */
  async canAccessPatientData(doctorId, patientId) {
    const token = await HealthAccessToken.hasAccess(
      normalizeObjectId(doctorId, 'doctor id'),
      normalizeObjectId(patientId, 'patient id')
    );
    return token;
  }

  /**
   * Get patient data for doctor (with access validation and audit)
   */
  async getPatientDataForDoctor(doctorId, patientId, resourceType, requestContext = {}) {
    const safeDoctorId = normalizeObjectId(doctorId, 'doctor id');
    const safePatientId = normalizeObjectId(patientId, 'patient id');
    // Check access
    const accessToken = await this.canAccessPatientData(safeDoctorId, safePatientId);
    if (!accessToken) {
      throw new AuthorizationError('No valid access token for this patient');
    }

    // Check if resource type is allowed
    if (!accessToken.allowedResources.includes(resourceType) &&
        !accessToken.allowedResources.includes(ALLOWED_RESOURCES.FULL_HISTORY)) {
      throw new AuthorizationError(`Access to ${resourceType} is not permitted`);
    }

    // Get the doctor info for audit
    const doctor = await User.findById(safeDoctorId);

    // Record usage — don't block authorized access if tracking fails
    let usageRecordFailed = false;
    try {
      await accessToken.recordUsage(requestContext.ipAddress);
    } catch (error) {
      usageRecordFailed = true;
      logger.error('Failed to record token usage — access still granted', {
        tokenId: accessToken._id,
        doctorId: safeDoctorId,
        patientId: safePatientId,
        error: error.message
      });
    }

    // Log access
    await this.logAccess({
      accessor: {
        userId: safeDoctorId,
        userType: USER_TYPES[doctor.role.toUpperCase()] || USER_TYPES.DOCTOR,
        name: doctor.name,
        role: doctor.role
      },
      patient: safePatientId,
      resourceType,
      action: AUDIT_ACTIONS.VIEW,
      accessReason: ACCESS_REASONS.BOOKING_ASSIGNMENT,
      bookingId: accessToken.booking,
      accessTokenId: accessToken._id.toString(),
      ipAddress: requestContext.ipAddress,
      userAgent: requestContext.userAgent,
      endpoint: requestContext.endpoint,
      success: true,
      usageRecordFailed
    });

    // Fetch the requested data
    let data;
    switch (resourceType) {
      case ALLOWED_RESOURCES.HEALTH_RECORD:
        data = await HealthRecord.getLatestApproved(safePatientId);
        break;
      case ALLOWED_RESOURCES.HEALTH_METRIC:
        data = await HealthMetric.getLatestByType(safePatientId);
        break;
      case ALLOWED_RESOURCES.DOCTOR_NOTE:
        data = await DoctorNote.getPatientNotes(safePatientId, { includeConfidential: true });
        break;
      case ALLOWED_RESOURCES.EMERGENCY_SUMMARY:
        data = await EmergencySummary.findOne({ patient: safePatientId });
        break;
      case ALLOWED_RESOURCES.FULL_HISTORY:
        data = {
          healthRecord: await HealthRecord.getLatestApproved(safePatientId),
          metrics: await HealthMetric.getLatestByType(safePatientId),
          notes: await DoctorNote.getPatientNotes(safePatientId, { includeConfidential: true }),
          emergencySummary: await EmergencySummary.findOne({ patient: safePatientId })
        };
        break;
      default:
        throw new ValidationError(`Unknown resource type: ${resourceType}`);
    }

    return {
      data,
      accessInfo: {
        accessLevel: accessToken.accessLevel,
        tokenExpiresAt: accessToken.expiresAt,
        bookingId: accessToken.booking
      }
    };
  }

  /**
   * Get patient's active access tokens (who has access to their data)
   */
  async getPatientAccessTokens(patientId) {
    return HealthAccessToken.getPatientAccessTokens(patientId);
  }

  /**
   * Get doctor's active access tokens
   */
  async getDoctorAccessTokens(doctorId) {
    return HealthAccessToken.getDoctorAccessTokens(doctorId);
  }

  /**
   * Log access event
   */
  async logAccess(accessData) {
    try {
      await HealthDataAccessLog.logAccess(accessData);
    } catch (error) {
      // Don't fail the main operation if logging fails
      logger.error('Failed to log health data access', {
        error: error.message,
        accessData
      });
    }
  }

  /**
   * Get access logs for a patient
   */
  async getPatientAccessLogs(patientId, options = {}) {
    return HealthDataAccessLog.getPatientAccessHistory(patientId, options);
  }

  /**
   * Get access logs for an accessor
   */
  async getAccessorLogs(userId, options = {}) {
    return HealthDataAccessLog.getAccessorHistory(userId, options);
  }

  /**
   * Get patient access summary
   */
  async getPatientAccessSummary(patientId, days = 30) {
    return HealthDataAccessLog.getPatientAccessSummary(patientId, days);
  }

  /**
   * Get failed access attempts (for security monitoring)
   */
  async getFailedAttempts(options = {}) {
    return HealthDataAccessLog.getFailedAttempts(options);
  }

  /**
   * Get overall access statistics (for admin dashboard)
   */
  async getAccessStats(days = 7) {
    return HealthDataAccessLog.getAccessStats(days);
  }

  /**
   * Get token statistics
   */
  async getTokenStats() {
    return HealthAccessToken.getTokenStats();
  }

  /**
   * Revoke all tokens for a booking (on booking completion/cancellation)
   */
  async revokeBookingTokens(bookingId, revokedBy) {
    const result = await HealthAccessToken.revokeBookingTokens(bookingId, revokedBy);

    logger.info('Booking tokens revoked', {
      bookingId,
      revokedCount: result.modifiedCount
    });

    return result;
  }

  /**
   * Revoke all patient tokens
   */
  async revokeAllPatientTokens(patientId, revokedBy, reason) {
    const result = await HealthAccessToken.revokeAllPatientTokens(patientId, revokedBy, reason);

    logger.info('All patient tokens revoked', {
      patientId,
      revokedCount: result.modifiedCount
    });

    return result;
  }

  /**
   * Create a doctor note (requires write access)
   */
  async createDoctorNote(doctorId, patientId, noteData, requestContext = {}) {
    // Check access
    const accessToken = await this.canAccessPatientData(doctorId, patientId);
    if (!accessToken) {
      throw new AuthorizationError('No valid access token for this patient');
    }

    // Check write access
    if (accessToken.accessLevel !== ACCESS_LEVELS.READ_WRITE) {
      throw new AuthorizationError('Write access required to create notes');
    }

    // Create the note
    const note = await DoctorNote.create({
      patient: patientId,
      doctor: doctorId,
      booking: accessToken.booking,
      ...noteData
    });

    // Get doctor info for audit
    const doctor = await User.findById(doctorId);

    // Log access
    await this.logAccess({
      accessor: {
        userId: doctorId,
        userType: USER_TYPES[doctor.role.toUpperCase()] || USER_TYPES.DOCTOR,
        name: doctor.name,
        role: doctor.role
      },
      patient: patientId,
      resourceType: ALLOWED_RESOURCES.DOCTOR_NOTE,
      resourceId: note._id,
      action: AUDIT_ACTIONS.CREATE,
      accessReason: ACCESS_REASONS.BOOKING_ASSIGNMENT,
      bookingId: accessToken.booking,
      accessTokenId: accessToken._id.toString(),
      ipAddress: requestContext.ipAddress,
      userAgent: requestContext.userAgent,
      endpoint: requestContext.endpoint,
      success: true
    });

    logger.info('Doctor note created', {
      doctorId,
      patientId,
      noteId: note._id
    });

    return note;
  }
}

module.exports = new DoctorAccessService();
