/**
 * Health Record Authorization Tests
 *
 * Verifies:
 * - AUTH-006: Doctor role enforcement in assignIntakeReviewer() and reviewIntake()
 */

jest.mock('../../../models/healthRecord');
jest.mock('../../../models/patient');
jest.mock('../../../models/user');
jest.mock('../../../models/emergencySummary');
jest.mock('../../../models/healthDataAccessLog', () => ({
  logAccess: jest.fn()
}));
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

const HealthRecord = require('../../../models/healthRecord');
const User = require('../../../models/user');
const Patient = require('../../../models/patient');
const healthRecordService = require('../../../services/healthRecordService');

describe('Phase 3 — Health Record Authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('AUTH-006: Doctor role enforcement in assignIntakeReviewer()', () => {
    it('should reject non-doctor user (e.g. nurse) as intake reviewer', async () => {
      HealthRecord.findById.mockResolvedValue({
        _id: 'record1',
        status: 'PENDING_REVIEW',
        patient: 'patient1'
      });

      User.findById.mockResolvedValue({
        _id: 'nurse1',
        name: 'Nurse A',
        role: 'nurse'
      });

      await expect(
        healthRecordService.assignIntakeReviewer('record1', 'nurse1', 'admin1')
      ).rejects.toThrow(/Only doctors/);
    });

    it('should allow doctor role as intake reviewer', async () => {
      const mockRecord = {
        _id: 'record1',
        status: 'PENDING_REVIEW',
        patient: 'patient1',
        review: {},
        save: jest.fn().mockResolvedValue(true)
      };
      HealthRecord.findById.mockResolvedValue(mockRecord);

      User.findById.mockResolvedValue({
        _id: 'doctor1',
        name: 'Dr. Test',
        role: 'doctor'
      });

      Patient.findById.mockResolvedValue({
        _id: 'patient1',
        save: jest.fn().mockResolvedValue(true)
      });

      const result = await healthRecordService.assignIntakeReviewer('record1', 'doctor1', 'admin1');

      expect(result).toBeDefined();
      expect(mockRecord.save).toHaveBeenCalled();
    });
  });

  describe('AUTH-006: Doctor role enforcement in reviewIntake()', () => {
    it('should reject non-doctor user from reviewing intake', async () => {
      HealthRecord.findById.mockResolvedValue({
        _id: 'record1',
        status: 'PENDING_REVIEW',
        review: { assignedTo: { toString: () => 'nurse1' } }
      });

      User.findById.mockResolvedValue({
        _id: 'nurse1',
        name: 'Nurse A',
        role: 'nurse'
      });

      await expect(
        healthRecordService.reviewIntake('record1', 'nurse1', 'APPROVED', 'Looks good')
      ).rejects.toThrow(/Only doctors/);
    });

    it('should reject doctor not assigned to the record', async () => {
      HealthRecord.findById.mockResolvedValue({
        _id: 'record1',
        status: 'PENDING_REVIEW',
        review: { assignedTo: { toString: () => 'doctor1' } }
      });

      User.findById.mockResolvedValue({
        _id: 'doctor2',
        name: 'Dr. Other',
        role: 'doctor'
      });

      await expect(
        healthRecordService.reviewIntake('record1', 'doctor2', 'APPROVED', 'Looks good')
      ).rejects.toThrow(/not assigned/);
    });
  });
});
