/**
 * Health Services Validation Tests
 *
 * Verifies:
 * - VAL-002: startTime < endTime validation in setAvailability()
 * - VAL-003: Token expiry bounds validation in generateQRToken()
 * - VAL-004: Critical intake fields required validation
 * - VAL-005: Non-diabetic patient metric rejection
 * - VAL-007: Medical history structure validation per category
 * - NULL-005: statusTimestamps?.completedAt optional chaining
 * - ERR-010: New patients not blocked from emergency summary
 */

const fs = require('fs');
const path = require('path');

// Mocks for runtime tests
jest.mock('../../../models/calendarEvent');
jest.mock('../../../models/availability');
jest.mock('../../../models/duty');
jest.mock('../../../models/emergencySummary');
jest.mock('../../../models/healthRecord');
jest.mock('../../../models/healthMetric');
jest.mock('../../../models/healthTarget');
jest.mock('../../../models/patient');
jest.mock('../../../models/user');
jest.mock('../../../models/healthDataAccessLog', () => ({ logAccess: jest.fn() }));
jest.mock('../../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  logSecurity: jest.fn()
}));
jest.mock('../../../utils/errors', () => ({
  ValidationError: class ValidationError extends Error {
    constructor(m) { super(m); this.name = 'ValidationError'; }
  },
  NotFoundError: class NotFoundError extends Error {
    constructor(t, id) { super(`${t} not found`); this.name = 'NotFoundError'; }
  },
  AuthorizationError: class AuthorizationError extends Error {
    constructor(m) { super(m); this.name = 'AuthorizationError'; }
  }
}));

const Patient = require('../../../models/patient');
const EmergencySummary = require('../../../models/emergencySummary');
const HealthRecord = require('../../../models/healthRecord');

describe('Phase 4 — Health Services Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('VAL-002: startTime < endTime in setAvailability()', () => {
    it('should reject when startTime >= endTime', async () => {
      const calendarService = require('../../../services/calendarService');

      await expect(
        calendarService.setAvailability('user1', [
          { startTime: '18:00', endTime: '10:00' }
        ])
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('must be before endTime')
      });
    });
  });

  describe('VAL-003: Token expiry bounds in generateQRToken()', () => {
    it('should throw when expiryHours is below minimum', async () => {
      const emergencySummaryService = require('../../../services/emergencySummaryService');

      // Mock getEmergencySummary to return a valid summary
      const mockSummary = {
        _id: 'summary1',
        generateQRToken: jest.fn(),
        save: jest.fn()
      };
      EmergencySummary.findOne = jest.fn().mockResolvedValue(mockSummary);

      await expect(
        emergencySummaryService.generateQRToken('patient1', 0)
      ).rejects.toThrow(/expiryHours must be between/);
    });
  });

  describe('VAL-004: Critical intake fields required', () => {
    it('should reject missing allergies field', () => {
      const healthIntakeService = require('../../../services/healthIntakeService');

      expect(() =>
        healthIntakeService.validateIntakeData({
          currentMedications: [],
          habits: { smoking: false }
        })
      ).toThrow(/Missing required.*allergies/);
    });

    it('should reject missing currentMedications field', () => {
      const healthIntakeService = require('../../../services/healthIntakeService');

      expect(() =>
        healthIntakeService.validateIntakeData({
          allergies: [],
          habits: { smoking: false }
        })
      ).toThrow(/Missing required.*currentMedications/);
    });

    it('should reject missing/empty habits field', () => {
      const healthIntakeService = require('../../../services/healthIntakeService');

      expect(() =>
        healthIntakeService.validateIntakeData({
          allergies: [],
          currentMedications: [],
          habits: {}
        })
      ).toThrow(/Missing required.*habits/);
    });
  });

  describe('VAL-005: Non-diabetic patient metric rejection', () => {
    it('should reject diabetes reading for patient without diabetes condition', async () => {
      const { recordDiabetesReading } = require('../../../services/healthTrackerService');

      Patient.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: 'patient1',
            medicalHistory: { conditions: [{ name: 'Hypertension' }] }
          })
        })
      });

      await expect(
        recordDiabetesReading('patient1', { metricType: 'BLOOD_SUGAR_FASTING', value: 100 })
      ).rejects.toThrow(/does not have a diabetes diagnosis/);
    });
  });

  describe('VAL-007: Medical history structure validation', () => {
    it('source code should define per-category validation rules with required and allowed fields', () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'services', 'patientService.js'),
        'utf8'
      );

      // Should have validation rules for key categories
      expect(src).toMatch(/conditions:\s*\{[\s\S]*?required:\s*\[['"]name['"]\]/);
      expect(src).toMatch(/allergies:\s*\{[\s\S]*?required:\s*\[['"]allergen['"],\s*['"]severity['"]\]/);
      expect(src).toMatch(/currentMedications:\s*\{[\s\S]*?required:\s*\[['"]name['"],\s*['"]dosage['"],\s*['"]frequency['"]\]/);
    });

    it('source code should reject unknown fields', () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'services', 'patientService.js'),
        'utf8'
      );

      expect(src).toMatch(/unknownFields|Unknown fields/);
      expect(src).toContain('rule.allowed.includes');
    });
  });

  describe('NULL-005: statusTimestamps optional chaining', () => {
    it('source code should use optional chaining for statusTimestamps.completedAt', () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'services', 'patientDashboardService.js'),
        'utf8'
      );

      expect(src).toMatch(/statusTimestamps\?\./);
    });
  });

  describe('ERR-010: New patients not blocked from emergency summary', () => {
    it('should generate summary when no health record exists (new patient)', async () => {
      const emergencySummaryService = require('../../../services/emergencySummaryService');

      Patient.findById.mockResolvedValue({
        _id: 'patient1',
        name: 'New Patient',
        save: jest.fn().mockResolvedValue(true)
      });

      // No health record for new patient
      HealthRecord.getLatestApproved = jest.fn().mockResolvedValue(null);

      const mockSummary = { _id: 'summary1' };
      EmergencySummary.updateFromHealthRecord = jest.fn().mockResolvedValue(mockSummary);

      const result = await emergencySummaryService.generateEmergencySummary('patient1');

      expect(result).toBeDefined();
      // Should pass fallback empty healthSnapshot when no record exists
      expect(EmergencySummary.updateFromHealthRecord).toHaveBeenCalledWith(
        'patient1',
        { healthSnapshot: {} },
        expect.any(Object)
      );
    });
  });
});
