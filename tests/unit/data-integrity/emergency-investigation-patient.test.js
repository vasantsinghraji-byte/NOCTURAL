/**
 * Emergency, Investigation & Patient Tests
 *
 * Verifies:
 * - RACE-004: revokeQRToken uses atomic findOneAndUpdate with $unset
 * - RACE-007: pickReportFromQueue uses findOneAndUpdate with unassigned guard
 * - RACE-008: updateAddress atomically unsets other defaults before setting new
 */

jest.mock('../../../models/emergencySummary');
jest.mock('../../../models/investigationReport');
jest.mock('../../../models/patient');
jest.mock('../../../models/user');
jest.mock('../../../models/healthRecord');
jest.mock('../../../services/geminiAnalysisService', () => ({
  isAvailable: jest.fn()
}));
jest.mock('../../../services/notificationService', () => ({
  createNotification: jest.fn()
}));
jest.mock('../../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  logSecurity: jest.fn(),
  logAuth: jest.fn()
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
jest.mock('../../../middleware/auth', () => ({
  generateToken: jest.fn().mockReturnValue('mock-token')
}));

const EmergencySummary = require('../../../models/emergencySummary');
const InvestigationReport = require('../../../models/investigationReport');
const Patient = require('../../../models/patient');
const User = require('../../../models/user');
const emergencySummaryService = require('../../../services/emergencySummaryService');
const { pickReportFromQueue } = require('../../../services/investigationReportService');
const patientService = require('../../../services/patientService');

describe('Phase 2 — Emergency, Investigation & Patient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('RACE-004: revokeQRToken atomic $unset', () => {
    it('should use findOneAndUpdate with $unset for all token fields', async () => {
      EmergencySummary.findOneAndUpdate.mockResolvedValue({
        _id: 'summary1',
        patient: 'patient1'
      });

      await emergencySummaryService.revokeQRToken('patient1');

      expect(EmergencySummary.findOneAndUpdate).toHaveBeenCalledTimes(1);
      const [filter, update, options] = EmergencySummary.findOneAndUpdate.mock.calls[0];

      expect(filter).toEqual({ patient: 'patient1' });

      // Must $unset all token-related fields atomically
      expect(update.$unset).toEqual(expect.objectContaining({
        qrToken: 1,
        qrTokenHash: 1,
        qrTokenExpiry: 1,
        qrTokenCreatedAt: 1
      }));

      expect(options).toEqual(expect.objectContaining({ new: true }));
    });

    it('should throw NotFoundError when summary not found', async () => {
      EmergencySummary.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        emergencySummaryService.revokeQRToken('patient1')
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('RACE-007: pickReportFromQueue atomic guard', () => {
    it('should use findOneAndUpdate with unassigned guard', async () => {
      User.findById.mockResolvedValue({ _id: 'doctor1', role: 'doctor' });

      const mockReport = {
        _id: 'report1',
        doctorReview: {
          assignmentType: 'AUTO_QUEUE',
          assignedTo: 'doctor1'
        }
      };
      InvestigationReport.findOneAndUpdate.mockResolvedValue(mockReport);

      await pickReportFromQueue('report1', 'doctor1');

      expect(InvestigationReport.findOneAndUpdate).toHaveBeenCalledTimes(1);
      const [filter, update, options] = InvestigationReport.findOneAndUpdate.mock.calls[0];

      // Guard: auto-queue, not yet assigned, pending review
      expect(filter).toEqual(expect.objectContaining({
        _id: 'report1',
        'doctorReview.assignmentType': 'AUTO_QUEUE',
        'doctorReview.assignedTo': { $exists: false },
        status: 'PENDING_DOCTOR_REVIEW'
      }));

      // Should assign the doctor
      expect(update.$set).toEqual(expect.objectContaining({
        'doctorReview.assignedTo': 'doctor1'
      }));

      expect(options).toEqual(expect.objectContaining({ new: true }));
    });

    it('should throw when report already picked (findOneAndUpdate returns null)', async () => {
      User.findById.mockResolvedValue({ _id: 'doctor1', role: 'doctor' });
      InvestigationReport.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        pickReportFromQueue('report1', 'doctor1')
      ).rejects.toThrow(/not available or already picked/);
    });
  });

  describe('RACE-008: updateAddress atomic default flag management', () => {
    it('should atomically unset other defaults before setting new default', async () => {
      Patient.findOne.mockResolvedValue({
        _id: 'patient1',
        savedAddresses: [
          { _id: 'addr1', isDefault: true },
          { _id: 'addr2', isDefault: false }
        ]
      });

      Patient.findByIdAndUpdate.mockResolvedValue(true);
      Patient.findOneAndUpdate.mockResolvedValue({
        _id: 'patient1',
        savedAddresses: [
          { _id: 'addr1', isDefault: false },
          { _id: 'addr2', isDefault: true, label: 'Work' }
        ]
      });

      await patientService.updateAddress('patient1', 'addr2', {
        isDefault: true,
        label: 'Work'
      });

      // First: unset other defaults with arrayFilters
      expect(Patient.findByIdAndUpdate).toHaveBeenCalledTimes(1);
      const [, updateArg, updateOptions] = Patient.findByIdAndUpdate.mock.calls[0];
      expect(updateArg.$set).toEqual(expect.objectContaining({
        'savedAddresses.$[other].isDefault': false
      }));
      expect(updateOptions.arrayFilters).toEqual([
        { 'other._id': { $ne: 'addr2' } }
      ]);

      // Then: update the target address with positional $
      expect(Patient.findOneAndUpdate).toHaveBeenCalledTimes(1);
      const [findFilter, findUpdate] = Patient.findOneAndUpdate.mock.calls[0];
      expect(findFilter).toEqual(expect.objectContaining({
        _id: 'patient1',
        'savedAddresses._id': 'addr2'
      }));
      // Should use positional $ for field updates
      expect(findUpdate.$set).toEqual(expect.objectContaining({
        'savedAddresses.$.isDefault': true,
        'savedAddresses.$.label': 'Work'
      }));
    });
  });
});
