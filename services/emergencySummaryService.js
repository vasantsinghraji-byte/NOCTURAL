/**
 * Emergency Summary Service
 *
 * Business logic for emergency health summaries.
 * Handles generation, QR token management, and public access.
 */

const EmergencySummary = require('../models/emergencySummary');
const HealthRecord = require('../models/healthRecord');
const Patient = require('../models/patient');
const logger = require('../utils/logger');
const { QR_TOKEN_CONFIG } = require('../constants/healthConstants');
const { NotFoundError, ValidationError } = require('../utils/errors');

class EmergencySummaryService {
  /**
   * Generate or update emergency summary from latest health record
   */
  async generateEmergencySummary(patientId) {
    const patient = await Patient.findById(patientId);
    if (!patient) {
      throw new NotFoundError('Patient', patientId);
    }

    // Get latest approved health record
    const healthRecord = await HealthRecord.getLatestApproved(patientId);
    if (!healthRecord) {
      throw new ValidationError('No approved health record found');
    }

    // Update or create emergency summary
    const summary = await EmergencySummary.updateFromHealthRecord(
      patientId,
      healthRecord,
      patient
    );

    // Link to patient
    patient.emergencySummaryId = summary._id;
    await patient.save();

    logger.info('Emergency summary generated', {
      patientId,
      summaryId: summary._id
    });

    return summary;
  }

  /**
   * Update emergency summary (called when health record changes)
   */
  async updateEmergencySummary(patientId) {
    try {
      return await this.generateEmergencySummary(patientId);
    } catch (error) {
      // Don't fail silently but log the error
      logger.warn('Failed to update emergency summary', {
        patientId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Get emergency summary for a patient
   */
  async getEmergencySummary(patientId) {
    const summary = await EmergencySummary.findOne({ patient: patientId });

    if (!summary) {
      // Try to generate one
      try {
        return await this.generateEmergencySummary(patientId);
      } catch (error) {
        throw new NotFoundError('EmergencySummary', patientId);
      }
    }

    return summary;
  }

  /**
   * Generate QR token for emergency access
   */
  async generateQRToken(patientId, expiryHours = QR_TOKEN_CONFIG.DEFAULT_EXPIRY_HOURS) {
    const summary = await this.getEmergencySummary(patientId);

    // Validate expiry hours
    if (expiryHours < QR_TOKEN_CONFIG.MIN_EXPIRY_HOURS || expiryHours > QR_TOKEN_CONFIG.MAX_EXPIRY_HOURS) {
      throw new ValidationError(
        `expiryHours must be between ${QR_TOKEN_CONFIG.MIN_EXPIRY_HOURS} and ${QR_TOKEN_CONFIG.MAX_EXPIRY_HOURS} hours`
      );
    }

    // Generate token
    const tokenData = summary.generateQRToken(expiryHours);
    await summary.save();

    logger.info('Emergency QR token generated', {
      patientId,
      expiresAt: tokenData.expiresAt
    });

    return tokenData;
  }

  /**
   * Validate QR token
   */
  async validateQRToken(token) {
    const summary = await EmergencySummary.findByToken(token);

    if (!summary) {
      return { valid: false, reason: 'INVALID_OR_EXPIRED' };
    }

    const validation = summary.validateToken(token);
    return validation;
  }

  /**
   * Get emergency data by QR token (public access)
   */
  async getEmergencyDataByToken(token, ipAddress) {
    const summary = await EmergencySummary.findByToken(token);

    if (!summary) {
      return null;
    }

    // Record access
    await summary.recordAccess(ipAddress);

    // Return public emergency data
    return {
      patientName: summary.patientName,
      bloodGroup: summary.bloodGroup,
      age: summary.age,
      gender: summary.gender,
      criticalConditions: summary.criticalConditions,
      criticalAllergies: summary.criticalAllergies,
      currentMedications: summary.currentMedications,
      emergencyContacts: summary.emergencyContacts,
      primaryPhysician: summary.primaryPhysician,
      specialInstructions: summary.specialInstructions,
      dnrStatus: summary.dnrStatus,
      organDonor: summary.organDonor,
      insurance: summary.insurance ? {
        provider: summary.insurance.provider,
        policyNumber: summary.insurance.policyNumber
      } : undefined,
      lastUpdated: summary.lastUpdated,
      disclaimer: 'This information is provided for emergency medical purposes only. Verify with patient or family when possible.'
    };
  }

  /**
   * Revoke QR token
   */
  async revokeQRToken(patientId) {
    // Atomically clear token fields — safe against concurrent revocations
    const summary = await EmergencySummary.findOneAndUpdate(
      { patient: patientId },
      {
        $unset: {
          qrToken: 1,
          qrTokenHash: 1,
          qrTokenExpiry: 1,
          qrTokenCreatedAt: 1
        }
      },
      { new: true }
    );

    if (!summary) {
      throw new NotFoundError('EmergencySummary', patientId);
    }

    logger.info('Emergency QR token revoked', { patientId });

    return { success: true };
  }

  /**
   * Get QR token status
   */
  async getQRTokenStatus(patientId) {
    const summary = await EmergencySummary.findOne({ patient: patientId });

    if (!summary) {
      return { hasToken: false };
    }

    if (!summary.qrTokenHash) {
      return { hasToken: false };
    }

    if (summary.qrTokenExpiry && new Date() > summary.qrTokenExpiry) {
      return {
        hasToken: true,
        isExpired: true,
        expiredAt: summary.qrTokenExpiry
      };
    }

    return {
      hasToken: true,
      isExpired: false,
      expiresAt: summary.qrTokenExpiry,
      createdAt: summary.qrTokenCreatedAt,
      accessCount: summary.accessCount,
      lastAccessedAt: summary.lastAccessedAt
    };
  }

  /**
   * Update specific fields in emergency summary
   */
  async updateEmergencyFields(patientId, updates) {
    const summary = await EmergencySummary.findOne({ patient: patientId });

    if (!summary) {
      throw new NotFoundError('EmergencySummary', patientId);
    }

    // Only allow updating certain fields
    const allowedFields = [
      'specialInstructions',
      'dnrStatus',
      'organDonor',
      'primaryPhysician'
    ];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        summary[field] = updates[field];
      }
    }

    summary.lastUpdated = new Date();
    await summary.save();

    logger.info('Emergency summary updated', { patientId });

    return summary;
  }

  /**
   * Add emergency contact
   */
  async addEmergencyContact(patientId, contactData) {
    const summary = await EmergencySummary.findOne({ patient: patientId });

    if (!summary) {
      throw new NotFoundError('EmergencySummary', patientId);
    }

    // If setting as primary, unset existing primary
    if (contactData.isPrimary) {
      for (const contact of summary.emergencyContacts) {
        contact.isPrimary = false;
      }
    }

    summary.emergencyContacts.push(contactData);
    summary.lastUpdated = new Date();
    await summary.save();

    return summary;
  }

  /**
   * Remove emergency contact
   */
  async removeEmergencyContact(patientId, contactIndex) {
    const summary = await EmergencySummary.findOne({ patient: patientId });

    if (!summary) {
      throw new NotFoundError('EmergencySummary', patientId);
    }

    if (contactIndex < 0 || contactIndex >= summary.emergencyContacts.length) {
      throw new ValidationError('Invalid contact index');
    }

    summary.emergencyContacts.splice(contactIndex, 1);
    summary.lastUpdated = new Date();
    await summary.save();

    return summary;
  }

  /**
   * Get emergency summary access stats
   */
  async getAccessStats(patientId) {
    const summary = await EmergencySummary.findOne({ patient: patientId });

    if (!summary) {
      return null;
    }

    return {
      totalAccesses: summary.accessCount,
      lastAccessedAt: summary.lastAccessedAt,
      lastAccessedFrom: summary.lastAccessedFrom,
      tokenStatus: await this.getQRTokenStatus(patientId)
    };
  }
}

module.exports = new EmergencySummaryService();
