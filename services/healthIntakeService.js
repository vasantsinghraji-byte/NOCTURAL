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
    const patient = await Patient.findById(patientId);
    if (!patient) {
      throw new NotFoundError('Patient', patientId);
    }

    // Only start if not already started
    if (patient.intakeStatus !== 'NOT_STARTED') {
      return {
        alreadyStarted: true,
        status: patient.intakeStatus
      };
    }

    patient.intakeStatus = 'PENDING_PATIENT';
    await patient.save();

    logger.info('Intake process started', {
      patientId,
      triggerBookingId
    });

    // TODO: Send notification to patient to complete intake

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

    // TODO: Notify admins that a new intake is pending assignment

    return record;
  }

  /**
   * Validate intake data
   */
  validateIntakeData(data) {
    // Basic validation - ensure at least some health info is provided
    const hasConditions = data.conditions && data.conditions.length > 0;
    const hasAllergies = data.allergies && data.allergies.length > 0;
    const hasMedications = data.currentMedications && data.currentMedications.length > 0;
    const hasHabits = data.habits && Object.keys(data.habits).length > 0;

    // At minimum, we need habits info (smoking, alcohol, etc.)
    if (!hasHabits) {
      throw new ValidationError('Please provide lifestyle/habits information');
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

    // TODO: Notify the assigned doctor

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

    // TODO: Notify patient of approval

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

    // TODO: Notify patient of required changes

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

    // TODO: Notify patient of rejection

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
