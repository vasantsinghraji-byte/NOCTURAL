/**
 * Calendar & Health Intake Tests
 *
 * Verifies:
 * - TXN-005: setAvailability uses insert-first-delete-old two-phase pattern
 * - TXN-006 / RACE-005: submitIntake validates status before processing
 */

jest.mock('../../../models/availability');
jest.mock('../../../models/calendarEvent');
jest.mock('../../../models/duty');
jest.mock('../../../models/healthRecord');
jest.mock('../../../models/patient');
jest.mock('../../../models/user');
jest.mock('../../../services/healthRecordService', () => ({
  submitIntake: jest.fn(),
  saveIntakeDraft: jest.fn(),
  getIntakeDraft: jest.fn()
}));
jest.mock('../../../services/emergencySummaryService', () => ({
  generateEmergencySummary: jest.fn()
}));
jest.mock('../../../services/notificationService', () => ({
  createNotification: jest.fn()
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
    constructor(t, _id) { super(`${t} not found`); this.name = 'NotFoundError'; }
  },
  AuthorizationError: class AuthorizationError extends Error {
    constructor(m) { super(m); this.name = 'AuthorizationError'; }
  }
}));

const Availability = require('../../../models/availability');
const Patient = require('../../../models/patient');
const calendarService = require('../../../services/calendarService');
const healthIntakeService = require('../../../services/healthIntakeService');

describe('Phase 2 — Calendar & Health Intake', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('TXN-005: setAvailability insert-first-delete-old pattern', () => {
    it('should call insertMany BEFORE deleteMany', async () => {
      const callOrder = [];

      Availability.insertMany.mockImplementation(async (slots) => {
        callOrder.push('insertMany');
        return slots.map((s, i) => ({ ...s, _id: `new${i}` }));
      });

      Availability.deleteMany.mockImplementation(async () => {
        callOrder.push('deleteMany');
        return { deletedCount: 2 };
      });

      await calendarService.setAvailability('user1', [
        { dayOfWeek: 'MONDAY', startTime: '09:00', endTime: '17:00' }
      ]);

      expect(callOrder).toEqual(['insertMany', 'deleteMany']);
    });

    it('should exclude newly created IDs from deleteMany', async () => {
      Availability.insertMany.mockResolvedValue([
        { _id: 'newSlot1' },
        { _id: 'newSlot2' }
      ]);
      Availability.deleteMany.mockResolvedValue({ deletedCount: 1 });

      await calendarService.setAvailability('user1', [
        { dayOfWeek: 'MONDAY', startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 'TUESDAY', startTime: '09:00', endTime: '17:00' }
      ]);

      const [deleteFilter] = Availability.deleteMany.mock.calls[0];
      expect(deleteFilter).toEqual(expect.objectContaining({
        user: 'user1',
        _id: { $nin: ['newSlot1', 'newSlot2'] }
      }));
    });

    it('should NOT call deleteMany if insertMany fails (preserves old data)', async () => {
      Availability.insertMany.mockRejectedValue(new Error('Insert failed'));

      await expect(
        calendarService.setAvailability('user1', [
          { dayOfWeek: 'MONDAY', startTime: '09:00', endTime: '17:00' }
        ])
      ).rejects.toThrow('Insert failed');

      expect(Availability.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('TXN-006 / RACE-005: submitIntake status validation', () => {
    it('should reject submission when patient status is APPROVED', async () => {
      Patient.findById.mockResolvedValue({
        _id: 'patient1',
        intakeStatus: 'APPROVED'
      });

      await expect(
        healthIntakeService.submitIntake('patient1', {
          allergies: [],
          currentMedications: [],
          habits: { smoking: false }
        })
      ).rejects.toThrow(/Cannot submit in status/);
    });

    it('should reject submission when patient status is PENDING_REVIEW', async () => {
      Patient.findById.mockResolvedValue({
        _id: 'patient1',
        intakeStatus: 'PENDING_REVIEW'
      });

      await expect(
        healthIntakeService.submitIntake('patient1', {
          allergies: [],
          currentMedications: [],
          habits: { smoking: false }
        })
      ).rejects.toThrow(/Cannot submit in status/);
    });

    it('should validate required fields before proceeding', async () => {
      Patient.findById.mockResolvedValue({
        _id: 'patient1',
        intakeStatus: 'PENDING_PATIENT'
      });

      // Missing allergies field
      await expect(
        healthIntakeService.submitIntake('patient1', {
          currentMedications: [],
          habits: { smoking: false }
        })
      ).rejects.toThrow(/Missing required.*allergies/);
    });
  });
});
