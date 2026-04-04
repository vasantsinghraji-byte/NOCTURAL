/**
 * Health Intake Service
 *
 * Business logic for the health intake workflow.
 * Manages the flow: Patient fills form → Admin assigns doctor → Doctor reviews → Approval
 */

const HealthRecord = require('../models/healthRecord');
const Patient = require('../models/patient');
const User = require('../models/user');
const healthRecordService = require('./healthRecordService');
const emergencySummaryService = require('./emergencySummaryService');
const logger = require('../utils/logger');
const {
  RECORD_TYPES,
  RECORD_STATUS,
  INTAKE_STATUS
} = require('../constants/healthConstants');
const { NotFoundError, ValidationError } = require('../utils/errors');
const notificationService = require('./notificationService');

class HealthIntakeService {
  /**
   * Check if intake is required for a patient
   */
  async checkIntakeRequired(patientId) {
    const patient = await Patient.findById(patientId);
    if (!patient) {
      throw new NotFoundError('Patient', patientId);
    }

    return {
      required: patient.intakeStatus === 'NOT_STARTED',
      status: patient.intakeStatus,
      completedAt: patient.intakeCompletedAt,
      approvedBy: patient.intakeApprovedBy
    };
  }

  /**
   * Start intake process (triggered on first booking)
   */
  async startIntakeProcess(patientId, triggerBookingId) {
    // Atomic: only transition NOT_STARTED → PENDING_PATIENT once
    const patient = await Patient.findOneAndUpdate(
      { _id: patientId, intakeStatus: 'NOT_STARTED' },
      { $set: { intakeStatus: 'PENDING_PATIENT' } },
      { new: true }
    );

    if (!patient) {
      // Distinguish "not found" from "already started"
      const exists = await Patient.findById(patientId);
      if (!exists) {
        throw new NotFoundError('Patient', patientId);
      }
      return {
        alreadyStarted: true,
        status: exists.intakeStatus
      };
    }

    logger.info('Intake process started', {
      patientId,
      triggerBookingId
    });

    // Send notification to patient to complete intake
    try {
      await notificationService.createNotification({
        user: patientId,
        recipientModel: 'Patient',
        type: 'INTAKE_REQUIRED',
        title: 'Health Intake Required',
        message: 'Please complete your health intake form to proceed with your booking.',
        priority: 'HIGH',
        actionUrl: `/patient/intake/${patientId}`,
        actionLabel: 'Complete Intake',
        metadata: { triggerBookingId }
      });
    } catch (notifyError) {
      logger.warn('Failed to send intake notification', {
        patientId,
        error: notifyError.message
      });
    }

    return {
      started: true,
      status: patient.intakeStatus
    };
  }

  /**
   * Get intake status with details
   */
  async getIntakeStatus(patientId) {
    const patient = await Patient.findById(patientId)
      .populate('intakeApprovedBy', 'name')
      .populate('intakeAssignedTo', 'name');

    if (!patient) {
      throw new NotFoundError('Patient', patientId);
    }

    // Get draft or pending record if exists
    const intakeRecord = await HealthRecord.findOne({
      patient: patientId,
      recordType: RECORD_TYPES.BASELINE,
      status: { $ne: RECORD_STATUS.APPROVED }
    }).sort({ createdAt: -1 });

    return {
      status: patient.intakeStatus,
      completedAt: patient.intakeCompletedAt,
      approvedBy: patient.intakeApprovedBy,
      assignedTo: patient.intakeAssignedTo,
      assignedAt: patient.intakeAssignedAt,
      intakeRecord: intakeRecord ? {
        id: intakeRecord._id,
        status: intakeRecord.status,
        createdAt: intakeRecord.createdAt,
        updatedAt: intakeRecord.updatedAt,
        hasDraft: intakeRecord.status === RECORD_STATUS.DRAFT,
        changesRequested: intakeRecord.review?.changesRequired || []
      } : null
    };
  }

  /**
   * Get intake form (with any existing draft)
   */
  async getIntakeForm(patientId) {
    const patient = await Patient.findById(patientId);
    if (!patient) {
      throw new NotFoundError('Patient', patientId);
    }

    // Get existing draft or changes-requested record
    const draft = await healthRecordService.getIntakeDraft(patientId);

    // Get existing medical history from patient profile
    const existingData = patient.medicalHistory || {};

    return {
      patientInfo: {
        name: patient.name,
        dateOfBirth: patient.dateOfBirth,
        gender: patient.gender,
        bloodGroup: patient.bloodGroup
      },
      draft: draft?.healthSnapshot || null,
      existingData,
      changesRequested: draft?.review?.changesRequired || [],
      status: patient.intakeStatus
    };
  }

  /**
   * Save intake draft
   */
  async saveIntakeDraft(patientId, draftData) {
    const patient = await Patient.findById(patientId);
    if (!patient) {
      throw new NotFoundError('Patient', patientId);
    }

    // Validate patient can save draft
    if (!['PENDING_PATIENT', 'NOT_STARTED'].includes(patient.intakeStatus)) {
      throw new ValidationError(`Cannot save draft in status: ${patient.intakeStatus}`);
    }

    const draft = await healthRecordService.saveIntakeDraft(patientId, draftData);

    // Update status if not already pending
    if (patient.intakeStatus === 'NOT_STARTED') {
      patient.intakeStatus = 'PENDING_PATIENT';
      await patient.save();
    }

    return draft;
  }

  /**
   * Submit intake for review
   */
  async submitIntake(patientId, intakeData) {
    const patient = await Patient.findById(patientId);
    if (!patient) {
      throw new NotFoundError('Patient', patientId);
    }

    // Validate patient can submit
    if (!['PENDING_PATIENT', 'NOT_STARTED'].includes(patient.intakeStatus)) {
      throw new ValidationError(`Cannot submit in status: ${patient.intakeStatus}`);
    }

    // Validate required fields
    this.validateIntakeData(intakeData);

    const record = await healthRecordService.submitIntake(patientId, intakeData);

    logger.info('Intake submitted', {
      patientId,
      recordId: record._id
    });

    // Notify admins that a new intake is pending assignment
    try {
      const admins = await User.find({ role: 'admin', isActive: true }).select('_id').lean();
      await Promise.allSettled(
        admins.map(admin =>
          notificationService.createNotification({
            user: admin._id,
            type: 'INTAKE_SUBMITTED',
            title: 'New Intake Pending Assignment',
            message: 'Patient intake has been submitted and requires doctor assignment.',
            priority: 'HIGH',
            actionUrl: `/admin/intake/${patientId}`,
            actionLabel: 'Assign Doctor',
            metadata: { patientId, recordId: record._id }
          })
        )
      );
    } catch (notifyError) {
      logger.warn('Failed to send admin intake notifications', {
        patientId,
        error: notifyError.message
      });
    }

    return record;
  }

  /**
   * Validate intake data
   */
  validateIntakeData(data) {
    const missing = [];

    if (!data.allergies || !Array.isArray(data.allergies)) {
      missing.push('allergies (provide an empty array [] if none)');
    }

    if (!data.currentMedications || !Array.isArray(data.currentMedications)) {
      missing.push('currentMedications (provide an empty array [] if none)');
    }

    if (!data.habits || Object.keys(data.habits).length === 0) {
      missing.push('habits (lifestyle/habits information)');
    }

    if (missing.length > 0) {
      throw new ValidationError(`Missing required health intake fields: ${missing.join(', ')}`);
    }

    return true;
  }

  /**
   * Assign doctor to review intake (admin action)
   */
  async assignReviewer(intakeId, doctorId, adminId) {
    // Validate doctor exists and has doctor role
    const doctor = await User.findById(doctorId);
    if (!doctor || doctor.role !== 'doctor') {
      throw new ValidationError('Must assign to a doctor');
    }

    const record = await healthRecordService.assignIntakeReviewer(intakeId, doctorId, adminId);

    logger.info('Intake reviewer assigned', {
      intakeId,
      doctorId,
      adminId
    });

    // Notify the assigned doctor
    try {
      await notificationService.createNotification({
        user: doctorId,
        type: 'INTAKE_ASSIGNED',
        title: 'Intake Review Assigned',
        message: 'A patient health intake has been assigned to you for review.',
        priority: 'HIGH',
        actionUrl: `/doctor/intake/${intakeId}`,
        actionLabel: 'Review Intake',
        metadata: { intakeId, assignedBy: adminId }
      });
    } catch (notifyError) {
      logger.warn('Failed to send doctor assignment notification', {
        doctorId,
        intakeId,
        error: notifyError.message
      });
    }

    return record;
  }

  /**
   * Get pending intakes (for admin)
   */
  async getPendingIntakes(options = {}) {
    return HealthRecord.getAllPendingIntakes(options);
  }

  /**
   * Get intakes assigned to a doctor
   */
  async getDoctorPendingIntakes(doctorId, options = {}) {
    return HealthRecord.getPendingReviews(doctorId, options);
  }

  /**
   * Get intake details (for doctor review)
   */
  async getIntakeDetails(intakeId, doctorId) {
    const record = await HealthRecord.findById(intakeId)
      .populate('patient', 'name email phone dateOfBirth gender bloodGroup emergencyContact')
      .lean();

    if (!record) {
      throw new NotFoundError('HealthRecord', intakeId);
    }

    // Verify doctor is assigned
    if (record.review?.assignedTo?.toString() !== doctorId.toString()) {
      throw new ValidationError('You are not assigned to review this intake');
    }

    return record;
  }

  /**
   * Approve intake (doctor action)
   */
  async approveIntake(intakeId, doctorId, reviewNotes) {
    const record = await healthRecordService.reviewIntake(
      intakeId,
      doctorId,
      'APPROVED',
      reviewNotes
    );

    // Generate emergency summary
    try {
      await emergencySummaryService.generateEmergencySummary(record.patient);
    } catch (error) {
      logger.warn('Failed to generate emergency summary after intake approval', {
        patientId: record.patient,
        error: error.message
      });
    }

    logger.info('Intake approved', {
      intakeId,
      doctorId,
      patientId: record.patient
    });

    // Notify patient of approval
    try {
      await notificationService.createNotification({
        user: record.patient,
        recipientModel: 'Patient',
        type: 'INTAKE_APPROVED',
        title: 'Health Intake Approved',
        message: 'Your health intake has been reviewed and approved by a doctor. You are all set!',
        priority: 'MEDIUM',
        actionUrl: `/patient/intake/${intakeId}/status`,
        actionLabel: 'View Status',
        metadata: { intakeId, approvedBy: doctorId }
      });
    } catch (notifyError) {
      logger.warn('Failed to send patient approval notification', {
        patientId: record.patient,
        intakeId,
        error: notifyError.message
      });
    }

    return record;
  }

  /**
   * Request changes on intake (doctor action)
   */
  async requestChanges(intakeId, doctorId, changesRequired, notes) {
    if (!changesRequired || changesRequired.length === 0) {
      throw new ValidationError('Please specify required changes');
    }

    const record = await healthRecordService.reviewIntake(
      intakeId,
      doctorId,
      'CHANGES_REQUESTED',
      notes,
      changesRequired
    );

    logger.info('Intake changes requested', {
      intakeId,
      doctorId,
      changesCount: changesRequired.length
    });

    // Notify patient of required changes
    try {
      await notificationService.createNotification({
        user: record.patient,
        recipientModel: 'Patient',
        type: 'INTAKE_CHANGES_REQUIRED',
        title: 'Changes Required on Your Health Intake',
        message: `A doctor has reviewed your health intake and requested ${changesRequired.length} change(s). Please update and resubmit.`,
        priority: 'HIGH',
        actionUrl: `/patient/intake/${intakeId}/edit`,
        actionLabel: 'View Required Changes',
        metadata: { intakeId, requestedBy: doctorId, changesCount: changesRequired.length }
      });
    } catch (notifyError) {
      logger.warn('Failed to send patient changes-required notification', {
        patientId: record.patient, intakeId, error: notifyError.message
      });
    }

    return record;
  }

  /**
   * Reject intake (doctor action)
   */
  async rejectIntake(intakeId, doctorId, rejectionReason) {
    if (!rejectionReason) {
      throw new ValidationError('Please provide a rejection reason');
    }

    const record = await healthRecordService.reviewIntake(
      intakeId,
      doctorId,
      'REJECTED',
      rejectionReason
    );

    logger.info('Intake rejected', {
      intakeId,
      doctorId,
      reason: rejectionReason
    });

    // Notify patient of rejection
    try {
      await notificationService.createNotification({
        user: record.patient,
        recipientModel: 'Patient',
        type: 'INTAKE_REJECTED',
        title: 'Health Intake Not Approved',
        message: `Your health intake has been reviewed and was not approved. Reason: ${rejectionReason}`,
        priority: 'HIGH',
        actionUrl: `/patient/intake/${intakeId}/status`,
        actionLabel: 'View Details',
        metadata: { intakeId, rejectedBy: doctorId, reason: rejectionReason }
      });
    } catch (notifyError) {
      logger.warn('Failed to send patient rejection notification', {
        patientId: record.patient, intakeId, error: notifyError.message
      });
    }

    return record;
  }

  /**
   * Get intake statistics (for admin dashboard)
   */
  async getIntakeStats() {
    const [pendingPatient, pendingReview, approved, rejected] = await Promise.all([
      Patient.countDocuments({ intakeStatus: INTAKE_STATUS.PENDING_PATIENT }),
      Patient.countDocuments({ intakeStatus: INTAKE_STATUS.PENDING_REVIEW }),
      Patient.countDocuments({ intakeStatus: INTAKE_STATUS.APPROVED }),
      HealthRecord.countDocuments({
        recordType: RECORD_TYPES.BASELINE,
        status: RECORD_STATUS.REJECTED
      })
    ]);

    // Get unassigned pending reviews
    const unassignedPending = await HealthRecord.countDocuments({
      recordType: RECORD_TYPES.BASELINE,
      status: RECORD_STATUS.PENDING_REVIEW,
      'review.assignedTo': { $exists: false }
    });

    return {
      pendingPatient,
      pendingReview,
      unassignedPending,
      approved,
      rejected,
      total: pendingPatient + pendingReview + approved
    };
  }
}

module.exports = new HealthIntakeService();
