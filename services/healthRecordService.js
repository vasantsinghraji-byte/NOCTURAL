/**
 * Health Record Service
 *
 * Business logic for health record operations.
 * Implements append-only versioning - never overwrites, always creates new versions.
 */

const HealthRecord = require('../models/healthRecord');
const Patient = require('../models/patient');
const EmergencySummary = require('../models/emergencySummary');
const logger = require('../utils/logger');
const {
  RECORD_TYPES,
  RECORD_STATUS,
  DATA_SOURCES
} = require('../constants/healthConstants');
const { NotFoundError, ValidationError } = require('../utils/errors');

class HealthRecordService {
  /**
   * Create a baseline health record (initial intake)
   */
  async createBaselineRecord(patientId, healthData, source = {}) {
    const patient = await Patient.findById(patientId);
    if (!patient) {
      throw new NotFoundError('Patient', patientId);
    }

    // Check if baseline already exists
    const existingBaseline = await HealthRecord.findOne({
      patient: patientId,
      recordType: RECORD_TYPES.BASELINE,
      status: RECORD_STATUS.APPROVED
    });

    if (existingBaseline) {
      throw new ValidationError('Baseline health record already exists. Use appendUpdate instead.');
    }

    const record = new HealthRecord({
      patient: patientId,
      recordType: RECORD_TYPES.BASELINE,
      status: RECORD_STATUS.PENDING_REVIEW,
      healthSnapshot: healthData,
      source: {
        type: source.type || DATA_SOURCES.PATIENT_SELF,
        bookingId: source.bookingId,
        providerId: source.providerId
      }
    });

    await record.save();

    // Update patient intake status
    patient.intakeStatus = 'PENDING_REVIEW';
    patient.intakeCompletedAt = new Date();
    await patient.save();

    logger.info('Baseline health record created', {
      patientId,
      recordId: record._id,
      version: record.version
    });

    return record;
  }

  /**
   * Append an update to health records (creates new version)
   */
  async appendUpdate(patientId, updates, source = {}) {
    const patient = await Patient.findById(patientId);
    if (!patient) {
      throw new NotFoundError('Patient', patientId);
    }

    // Get latest approved record to base the update on
    const latestRecord = await HealthRecord.getLatestApproved(patientId);

    // Merge updates with existing data
    let healthSnapshot;
    if (latestRecord) {
      healthSnapshot = this.mergeHealthData(
        latestRecord.healthSnapshot?.toObject() || {},
        updates
      );
    } else {
      healthSnapshot = updates;
    }

    const record = new HealthRecord({
      patient: patientId,
      recordType: source.type === DATA_SOURCES.BOOKING ? RECORD_TYPES.BOOKING_CAPTURE : RECORD_TYPES.UPDATE,
      status: RECORD_STATUS.APPROVED, // Updates are auto-approved
      healthSnapshot,
      source: {
        type: source.type || DATA_SOURCES.PATIENT_SELF,
        bookingId: source.bookingId,
        providerId: source.providerId
      }
    });

    await record.save();

    // Compute and store changes
    const changes = await record.computeChanges();
    if (changes) {
      record.changes = changes;
      await record.save();
    }

    // Update patient's current version
    patient.currentHealthRecordVersion = record.version;
    await patient.save();

    // Update emergency summary
    await EmergencySummary.updateFromHealthRecord(patientId, record, patient);

    logger.info('Health record updated', {
      patientId,
      recordId: record._id,
      version: record.version,
      recordType: record.recordType
    });

    return record;
  }

  /**
   * Merge new health data with existing snapshot
   * Uses smart merging - appends to arrays, updates objects
   */
  mergeHealthData(existing, updates) {
    const merged = { ...existing };

    // Array fields - add new items (don't replace)
    const arrayFields = ['conditions', 'allergies', 'currentMedications', 'surgeries', 'familyHistory', 'immunizations'];

    for (const field of arrayFields) {
      if (updates[field] && Array.isArray(updates[field])) {
        merged[field] = [
          ...(existing[field] || []),
          ...updates[field].map(item => ({
            ...item,
            addedAt: new Date()
          }))
        ];
      }
    }

    // Object fields - deep merge
    if (updates.habits) {
      merged.habits = { ...(existing.habits || {}), ...updates.habits };
    }
    if (updates.lifestyle) {
      merged.lifestyle = { ...(existing.lifestyle || {}), ...updates.lifestyle };
    }

    return merged;
  }

  /**
   * Get latest approved health record
   */
  async getLatestRecord(patientId) {
    const record = await HealthRecord.getLatestApproved(patientId);
    return record;
  }

  /**
   * Get health record version history
   */
  async getRecordHistory(patientId, options = {}) {
    return HealthRecord.getVersionHistory(patientId, options);
  }

  /**
   * Get a specific version of health record
   */
  async getRecordByVersion(patientId, version) {
    const record = await HealthRecord.findOne({
      patient: patientId,
      version,
      isActive: true
    });

    if (!record) {
      throw new NotFoundError('HealthRecord', `version ${version}`);
    }

    return record;
  }

  /**
   * Capture vitals from a booking
   */
  async captureBookingVitals(patientId, bookingId, serviceReport, providerId) {
    // Build health snapshot from service report
    const updates = {};

    // If there are observations, add them as a condition note
    if (serviceReport.observations) {
      updates.observations = serviceReport.observations;
    }

    // If there are recommendations, store them
    if (serviceReport.recommendations) {
      updates.recommendations = serviceReport.recommendations;
    }

    // If follow-up is required, note it
    if (serviceReport.followUpRequired) {
      updates.followUp = {
        required: true,
        date: serviceReport.followUpDate,
        notes: serviceReport.observations
      };
    }

    // Only create a record if there's meaningful data
    if (Object.keys(updates).length > 0) {
      return this.appendUpdate(patientId, updates, {
        type: DATA_SOURCES.BOOKING,
        bookingId,
        providerId
      });
    }

    return null;
  }

  /**
   * Save draft for intake form
   */
  async saveIntakeDraft(patientId, draftData) {
    const patient = await Patient.findById(patientId);
    if (!patient) {
      throw new NotFoundError('Patient', patientId);
    }

    // Find existing draft or create new
    let draft = await HealthRecord.findOne({
      patient: patientId,
      recordType: RECORD_TYPES.BASELINE,
      status: RECORD_STATUS.DRAFT
    });

    if (draft) {
      draft.healthSnapshot = draftData;
      await draft.save();
    } else {
      draft = new HealthRecord({
        patient: patientId,
        recordType: RECORD_TYPES.BASELINE,
        status: RECORD_STATUS.DRAFT,
        healthSnapshot: draftData,
        source: {
          type: DATA_SOURCES.PATIENT_SELF
        }
      });
      await draft.save();
    }

    return draft;
  }

  /**
   * Get intake draft
   */
  async getIntakeDraft(patientId) {
    return HealthRecord.findOne({
      patient: patientId,
      recordType: RECORD_TYPES.BASELINE,
      status: { $in: [RECORD_STATUS.DRAFT, RECORD_STATUS.CHANGES_REQUESTED] }
    });
  }

  /**
   * Submit intake for review
   */
  async submitIntake(patientId, intakeData) {
    const patient = await Patient.findById(patientId);
    if (!patient) {
      throw new NotFoundError('Patient', patientId);
    }

    // Check if already submitted/approved
    const existingSubmission = await HealthRecord.findOne({
      patient: patientId,
      recordType: RECORD_TYPES.BASELINE,
      status: { $in: [RECORD_STATUS.PENDING_REVIEW, RECORD_STATUS.APPROVED] }
    });

    if (existingSubmission) {
      if (existingSubmission.status === RECORD_STATUS.APPROVED) {
        throw new ValidationError('Intake has already been approved');
      }
      throw new ValidationError('Intake is already pending review');
    }

    // Find and update draft, or create new
    let record = await HealthRecord.findOne({
      patient: patientId,
      recordType: RECORD_TYPES.BASELINE,
      status: { $in: [RECORD_STATUS.DRAFT, RECORD_STATUS.CHANGES_REQUESTED] }
    });

    if (record) {
      record.healthSnapshot = intakeData;
      record.status = RECORD_STATUS.PENDING_REVIEW;
      await record.save();
    } else {
      record = new HealthRecord({
        patient: patientId,
        recordType: RECORD_TYPES.BASELINE,
        status: RECORD_STATUS.PENDING_REVIEW,
        healthSnapshot: intakeData,
        source: {
          type: DATA_SOURCES.PATIENT_SELF
        }
      });
      await record.save();
    }

    // Update patient status
    patient.intakeStatus = 'PENDING_REVIEW';
    patient.intakeCompletedAt = new Date();
    await patient.save();

    logger.info('Intake submitted for review', {
      patientId,
      recordId: record._id
    });

    return record;
  }

  /**
   * Assign doctor to review intake (admin action)
   */
  async assignIntakeReviewer(recordId, doctorId, adminId) {
    const record = await HealthRecord.findById(recordId);
    if (!record) {
      throw new NotFoundError('HealthRecord', recordId);
    }

    if (record.status !== RECORD_STATUS.PENDING_REVIEW) {
      throw new ValidationError('Record is not pending review');
    }

    record.review = {
      ...record.review,
      assignedBy: adminId,
      assignedAt: new Date(),
      assignedTo: doctorId
    };
    await record.save();

    // Update patient
    const patient = await Patient.findById(record.patient);
    if (patient) {
      patient.intakeAssignedTo = doctorId;
      patient.intakeAssignedAt = new Date();
      await patient.save();
    }

    logger.info('Intake reviewer assigned', {
      recordId,
      doctorId,
      adminId
    });

    return record;
  }

  /**
   * Review and approve/reject intake (doctor action)
   */
  async reviewIntake(recordId, doctorId, decision, notes, changesRequired = []) {
    const record = await HealthRecord.findById(recordId);
    if (!record) {
      throw new NotFoundError('HealthRecord', recordId);
    }

    if (record.status !== RECORD_STATUS.PENDING_REVIEW) {
      throw new ValidationError('Record is not pending review');
    }

    // Verify doctor is assigned
    if (record.review?.assignedTo?.toString() !== doctorId.toString()) {
      throw new ValidationError('You are not assigned to review this intake');
    }

    record.review = {
      ...record.review,
      reviewedBy: doctorId,
      reviewedAt: new Date(),
      notes,
      decision,
      changesRequired
    };

    if (decision === 'APPROVED') {
      record.status = RECORD_STATUS.APPROVED;
      record.isLatest = true;

      // Update patient
      const patient = await Patient.findById(record.patient);
      if (patient) {
        patient.intakeStatus = 'APPROVED';
        patient.intakeApprovedBy = doctorId;
        patient.currentHealthRecordVersion = record.version;
        await patient.save();

        // Update emergency summary
        await EmergencySummary.updateFromHealthRecord(record.patient, record, patient);
      }
    } else if (decision === 'CHANGES_REQUESTED') {
      record.status = RECORD_STATUS.CHANGES_REQUESTED;

      const patient = await Patient.findById(record.patient);
      if (patient) {
        patient.intakeStatus = 'PENDING_PATIENT';
        await patient.save();
      }
    } else if (decision === 'REJECTED') {
      record.status = RECORD_STATUS.REJECTED;
    }

    await record.save();

    logger.info('Intake reviewed', {
      recordId,
      doctorId,
      decision
    });

    return record;
  }
}

module.exports = new HealthRecordService();
