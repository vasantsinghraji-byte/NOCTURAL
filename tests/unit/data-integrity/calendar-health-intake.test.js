/**
 * Calendar & Health Intake Tests
 *
 * Verifies:
 * - TXN-005: setAvailability validates upfront and swaps availability atomically
 * - TXN-006 / RACE-005: submitIntake validates status before processing
 */

const mongoose = require('mongoose');

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
  let session;

  beforeEach(() => {
    jest.clearAllMocks();

    session = {
      withTransaction: jest.fn(async (work) => work()),
      endSession: jest.fn().mockResolvedValue()
    };

    jest.spyOn(mongoose, 'startSession').mockResolvedValue(session);
    Availability.validate = jest.fn().mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('TXN-005: setAvailability validates upfront and swaps availability atomically', () => {
    it('should validate all slots before insertMany and deleteMany', async () => {
      const callOrder = [];

      Availability.validate.mockImplementation(async () => {
        callOrder.push('validate');
      });
      Availability.insertMany.mockImplementation(async (slots) => {
        callOrder.push('insertMany');
        return slots.map((slot, index) => ({ ...slot, _id: `new${index}` }));
      });
      Availability.deleteMany.mockImplementation(async () => {
        callOrder.push('deleteMany');
        return { deletedCount: 2 };
      });

      await calendarService.setAvailability('user1', [
        { dayOfWeek: 'MONDAY', startTime: '09:00', endTime: '17:00' }
      ]);

      expect(callOrder).toEqual(['validate', 'insertMany', 'deleteMany']);
    });

    it('should use insertMany ordered:false inside the transaction session', async () => {
      Availability.insertMany.mockResolvedValue([
        { _id: 'newSlot1' },
        { _id: 'newSlot2' }
      ]);
      Availability.deleteMany.mockResolvedValue({ deletedCount: 1 });

      await calendarService.setAvailability('user1', [
        { dayOfWeek: 'MONDAY', startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 'TUESDAY', startTime: '09:00', endTime: '17:00' }
      ]);

      expect(mongoose.startSession).toHaveBeenCalledTimes(1);
      expect(session.withTransaction).toHaveBeenCalledTimes(1);
      expect(Availability.insertMany).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          ordered: false,
          session
        })
      );

      const [deleteFilter, deleteOptions] = Availability.deleteMany.mock.calls[0];
      expect(deleteFilter).toEqual(expect.objectContaining({
        user: 'user1',
        _id: { $nin: ['newSlot1', 'newSlot2'] }
      }));
      expect(deleteOptions).toEqual({ session });
      expect(session.endSession).toHaveBeenCalledTimes(1);
    });

    it('should NOT call insertMany when upfront validation fails', async () => {
      Availability.validate.mockRejectedValue(new Error('Validation failed'));

      await expect(
        calendarService.setAvailability('user1', [
          { dayOfWeek: 'MONDAY', startTime: '09:00', endTime: '17:00' }
        ])
      ).rejects.toThrow('Validation failed');

      expect(Availability.insertMany).not.toHaveBeenCalled();
      expect(Availability.deleteMany).not.toHaveBeenCalled();
    });

    it('should compensate newly created slots if the transactional swap fails after insert', async () => {
      Availability.insertMany.mockResolvedValue([
        { _id: 'newSlot1' },
        { _id: 'newSlot2' }
      ]);
      Availability.deleteMany
        .mockRejectedValueOnce(new Error('Delete failed'))
        .mockResolvedValueOnce({ deletedCount: 2 });

      await expect(
        calendarService.setAvailability('user1', [
          { dayOfWeek: 'MONDAY', startTime: '09:00', endTime: '17:00' }
        ])
      ).rejects.toThrow('Delete failed');

      expect(Availability.deleteMany).toHaveBeenNthCalledWith(
        2,
        {
          user: 'user1',
          _id: { $in: ['newSlot1', 'newSlot2'] }
        }
      );
      expect(session.endSession).toHaveBeenCalledTimes(1);
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
