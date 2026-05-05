/**
 * Booking Integrity Tests
 *
 * Verifies:
 * - TXN-003: createBooking uses single Booking.create() operation
 * - TXN-004 / RACE-003: assignProvider uses findOneAndUpdate with status guard
 * - RACE-011: booking succeeds even when non-critical services throw
 * - RACE-012: duration is null when startTime is missing (not NaN)
 */

jest.mock('../../../models/nurseBooking');
jest.mock('../../../models/serviceCatalog');
jest.mock('../../../models/patient');
jest.mock('../../../models/user');
jest.mock('../../../middleware/queryCache', () => ({ invalidateCache: jest.fn() }));
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
  AuthorizationError: class AuthorizationError extends Error {
    constructor(m) { super(m); this.name = 'AuthorizationError'; }
  },
  NotFoundError: class NotFoundError extends Error {
    constructor(t, _id) { super(`${t} not found`); this.name = 'NotFoundError'; }
  }
}));
jest.mock('../../../services/healthIntakeService', () => ({
  startIntakeProcess: jest.fn()
}));
jest.mock('../../../services/healthMetricService', () => ({
  recordMultipleMetrics: jest.fn()
}));
jest.mock('../../../services/healthRecordService', () => ({
  captureBookingVitals: jest.fn()
}));
jest.mock('../../../services/doctorAccessService', () => ({
  grantAccess: jest.fn()
}));

const NurseBooking = require('../../../models/nurseBooking');
const ServiceCatalog = require('../../../models/serviceCatalog');
const Patient = require('../../../models/patient');
const User = require('../../../models/user');
const healthIntakeService = require('../../../services/healthIntakeService');
const healthMetricService = require('../../../services/healthMetricService');
const doctorAccessService = require('../../../services/doctorAccessService');
const bookingService = require('../../../services/bookingService');

describe('Phase 2 — Booking Integrity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('TXN-003: createBooking uses single insert', () => {
    it('should call NurseBooking.create() once with pricing computed upfront', async () => {
      Patient.findById.mockResolvedValue({
        _id: 'patient1',
        totalBookings: 1,
        intakeStatus: 'APPROVED'
      });

      ServiceCatalog.findOne.mockResolvedValue({
        name: 'INJECTION_IM',
        pricing: { basePrice: 500 },
        requirements: {},
        availability: { isActive: true }
      });

      const mockBooking = {
        _id: 'booking1',
        pricing: {
          basePrice: 500,
          platformFee: 75,
          gst: 103.5,
          discount: 0,
          totalAmount: 678.5,
          payableAmount: 678.5
        }
      };
      NurseBooking.create.mockResolvedValue(mockBooking);

      await bookingService.createBooking({
        serviceType: 'INJECTION',
        scheduledDate: '2026-03-15',
        scheduledTime: '10:00',
        serviceLocation: { type: 'HOME' }
      }, 'patient1');

      expect(NurseBooking.create).toHaveBeenCalledTimes(1);
      const createArg = NurseBooking.create.mock.calls[0][0];
      expect(createArg).toHaveProperty('pricing');
      expect(createArg.pricing).toHaveProperty('basePrice');
      expect(createArg.pricing).toHaveProperty('platformFee');
      expect(createArg.pricing).toHaveProperty('gst');
      expect(createArg.pricing).toHaveProperty('totalAmount');
      expect(createArg.pricing).toHaveProperty('payableAmount');
    });
  });

  describe('TXN-004 / RACE-003: assignProvider uses atomic guard', () => {
    it('should fail fast when adminId is missing', async () => {
      await expect(
        bookingService.assignProvider('booking1', 'provider1')
      ).rejects.toThrow(/Admin ID is required/i);

      expect(User.findById).not.toHaveBeenCalled();
      expect(NurseBooking.findOneAndUpdate).not.toHaveBeenCalled();
      expect(doctorAccessService.grantAccess).not.toHaveBeenCalled();
    });

    it('should call findOneAndUpdate with status guard for assignable statuses', async () => {
      User.findById.mockResolvedValue({
        _id: 'provider1',
        name: 'Nurse A',
        role: 'nurse'
      });

      const mockBooking = {
        _id: 'booking1',
        patient: 'patient1',
        status: 'ASSIGNED',
        serviceProvider: 'provider1'
      };
      NurseBooking.findOneAndUpdate.mockResolvedValue(mockBooking);
      doctorAccessService.grantAccess.mockResolvedValue(true);

      await bookingService.assignProvider('booking1', 'provider1', 'admin1');

      expect(NurseBooking.findOneAndUpdate).toHaveBeenCalledTimes(1);
      const [filter, update, options] = NurseBooking.findOneAndUpdate.mock.calls[0];

      // Guard: booking must be in assignable status
      expect(filter).toEqual(expect.objectContaining({
        _id: 'booking1',
        status: { $in: ['REQUESTED', 'SEARCHING'] }
      }));

      // Update: set provider and status atomically
      expect(update.$set).toEqual(expect.objectContaining({
        serviceProvider: 'provider1',
        status: 'ASSIGNED'
      }));

      expect(options).toEqual(expect.objectContaining({ new: true }));
      expect(doctorAccessService.grantAccess).toHaveBeenCalledWith(expect.objectContaining({
        doctorId: 'provider1',
        bookingId: 'booking1',
        adminId: 'admin1'
      }));
    });

    it('should throw ValidationError when booking already assigned (findOneAndUpdate returns null)', async () => {
      User.findById.mockResolvedValue({
        _id: 'provider1',
        name: 'Nurse A',
        role: 'nurse'
      });

      NurseBooking.findOneAndUpdate.mockResolvedValue(null);
      NurseBooking.findById.mockResolvedValue({ _id: 'booking1', status: 'ASSIGNED' });

      await expect(
        bookingService.assignProvider('booking1', 'provider1', 'admin1')
      ).rejects.toThrow(/cannot be assigned|wrong status/i);
    });
  });

  describe('RACE-011: Non-critical failure isolation', () => {
    it('should create booking even when healthIntakeService.startIntakeProcess fails', async () => {
      Patient.findById.mockResolvedValue({
        _id: 'patient1',
        totalBookings: 0,
        intakeStatus: 'NOT_STARTED'
      });

      ServiceCatalog.findOne.mockResolvedValue({
        name: 'INJECTION_IM',
        pricing: { basePrice: 500 },
        requirements: {},
        availability: { isActive: true }
      });

      const mockBooking = {
        _id: 'booking1',
        pricing: { basePrice: 500, platformFee: 75, gst: 103.5, discount: 0, totalAmount: 678.5, payableAmount: 678.5 }
      };
      NurseBooking.create.mockResolvedValue(mockBooking);

      // Intake service throws — should NOT fail the booking
      healthIntakeService.startIntakeProcess.mockRejectedValue(new Error('Intake DB error'));

      const result = await bookingService.createBooking({
        serviceType: 'INJECTION',
        scheduledDate: '2026-03-15',
        scheduledTime: '10:00',
        serviceLocation: { type: 'HOME' }
      }, 'patient1');

      // Booking should still succeed
      expect(result).toBe(mockBooking);
      expect(NurseBooking.create).toHaveBeenCalledTimes(1);
    });

    it('should complete service with warnings when health metric capture fails', async () => {
      const mockBooking = {
        _id: 'booking1',
        patient: 'patient1',
        serviceProvider: { toString: () => 'provider1' },
        status: 'IN_PROGRESS',
        actualService: { startTime: new Date(Date.now() - 3600000) },
        pricing: { payableAmount: 500 },
        toObject: function () { return { ...this }; }
      };
      NurseBooking.findById.mockResolvedValue(mockBooking);
      NurseBooking.findByIdAndUpdate.mockResolvedValue(true);
      Patient.findByIdAndUpdate.mockResolvedValue(true);

      // Health metric service throws
      healthMetricService.recordMultipleMetrics.mockRejectedValue(new Error('Metric write failed'));

      const result = await bookingService.completeService('booking1', 'provider1', {
        vitalsChecked: { bloodPressure: '120/80' },
        observations: 'Patient stable'
      });

      // Should still complete — warnings attached
      expect(result).toBeDefined();
      expect(result.warnings).toBeDefined();
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].type).toBe('HEALTH_METRICS_FAILED');
    });
  });

  describe('RACE-012: Duration null coalescing when startTime missing', () => {
    it('should set duration to null when startTime is missing (not NaN)', async () => {
      const mockBooking = {
        _id: 'booking1',
        patient: 'patient1',
        serviceProvider: { toString: () => 'provider1' },
        status: 'IN_PROGRESS',
        actualService: {},  // No startTime
        pricing: { payableAmount: 500 },
        toObject: function () { return { ...this }; }
      };
      NurseBooking.findById.mockResolvedValue(mockBooking);
      NurseBooking.findByIdAndUpdate.mockResolvedValue(true);
      Patient.findByIdAndUpdate.mockResolvedValue(true);

      await bookingService.completeService('booking1', 'provider1', {
        observations: 'Done'
      });

      expect(NurseBooking.findByIdAndUpdate).toHaveBeenCalledTimes(1);
      const updateArg = NurseBooking.findByIdAndUpdate.mock.calls[0][1];
      const duration = updateArg.$set['actualService.duration'];

      // Must be null, NOT NaN or undefined
      expect(duration).toBeNull();
    });
  });

  describe('Cancellation schema contract', () => {
    it('should map patient cancellation to enum actor and preserve cancelling user id', async () => {
      const mockBooking = {
        _id: 'booking1',
        patient: { toString: () => 'patient1' },
        serviceProvider: null,
        status: 'REQUESTED',
        save: jest.fn().mockResolvedValue(true)
      };

      NurseBooking.findById.mockResolvedValue(mockBooking);

      const result = await bookingService.cancelBooking('booking1', 'patient1', 'Need to reschedule', 'patient');

      expect(result.cancellation).toEqual(expect.objectContaining({
        cancelledBy: 'PATIENT',
        cancelledByUser: 'patient1',
        reason: 'Need to reschedule'
      }));
      expect(mockBooking.save).toHaveBeenCalledTimes(1);
    });

    it('should map provider status cancellation to PROVIDER enum actor', async () => {
      const mockBooking = {
        _id: 'booking1',
        patient: { toString: () => 'patient1' },
        serviceProvider: { toString: () => 'provider1' },
        status: 'ASSIGNED',
        actualService: {},
        save: jest.fn().mockResolvedValue(true)
      };

      NurseBooking.findById.mockResolvedValue(mockBooking);

      const result = await bookingService.updateStatus('booking1', 'CANCELLED', 'provider1', 'Unable to reach patient', 'physiotherapist');

      expect(result.cancellation).toEqual(expect.objectContaining({
        cancelledBy: 'PROVIDER',
        cancelledByUser: 'provider1',
        reason: 'Unable to reach patient'
      }));
      expect(mockBooking.save).toHaveBeenCalledTimes(1);
    });
  });
});
