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
jest.mock('../../../utils/safeMongo', () => {
  const actual = jest.requireActual('../../../utils/safeMongo');
  return {
    ...actual,
    normalizeObjectId: value => value
  };
});

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
        scheduledTimezone: 'Asia/Kolkata',
        scheduledTimezoneOffsetMinutes: 330,
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
        scheduledTimezone: 'Asia/Kolkata',
        scheduledTimezoneOffsetMinutes: 330,
        serviceLocation: { type: 'HOME' }
      }, 'patient1');

      // Booking should still succeed
      expect(result).toBe(mockBooking);
      expect(NurseBooking.create).toHaveBeenCalledTimes(1);
    });

    it('should reject completion when health metric capture fails', async () => {
      const bookingId = '64f000000000000000000001';
      const patientId = '64f000000000000000000002';
      const providerId = '64f000000000000000000003';
      const completedBooking = {
        _id: bookingId,
        status: 'COMPLETED',
        actualService: {
          serviceReport: {
            vitalsChecked: { bloodPressure: '120/80' },
            observations: 'Patient stable'
          }
        },
        toObject: function () { return { ...this }; }
      };
      const mockBooking = {
        _id: bookingId,
        patient: patientId,
        serviceProvider: { toString: () => providerId },
        status: 'IN_PROGRESS',
        actualService: { startTime: new Date(Date.now() - 3600000) },
        pricing: { payableAmount: 500 },
        toObject: function () { return { ...this }; }
      };
      NurseBooking.findById.mockResolvedValue(mockBooking);
      NurseBooking.findOneAndUpdate.mockResolvedValue(completedBooking);
      Patient.findByIdAndUpdate.mockResolvedValue(true);

      // Health metric service throws
      healthMetricService.recordMultipleMetrics.mockRejectedValue(new Error('Metric write failed'));

      await expect(bookingService.completeService(bookingId, providerId, {
        vitalsChecked: { bloodPressure: '120/80' },
        observations: 'Patient stable'
      })).rejects.toThrow('Metric write failed');

      // Dependent writes are part of completion, so failure aborts the request.
      expect(healthMetricService.recordMultipleMetrics).toHaveBeenCalledWith(
        patientId,
        [
          { metricType: 'BP_SYSTOLIC', value: 120, unit: 'mmHg' },
          { metricType: 'BP_DIASTOLIC', value: 80, unit: 'mmHg' }
        ],
        {
          type: 'BOOKING',
          bookingId,
          providerId
        },
        undefined
      );
    });

    it('should complete service using query validators on the booking update', async () => {
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
      NurseBooking.findOneAndUpdate.mockResolvedValue(mockBooking);
      Patient.findByIdAndUpdate.mockResolvedValue(true);

      await bookingService.completeService('booking1', 'provider1', {
        observations: 'Done'
      });

      expect(NurseBooking.findOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(NurseBooking.findOneAndUpdate.mock.calls[0][0]).toEqual({
        _id: 'booking1',
        serviceProvider: 'provider1',
        status: 'IN_PROGRESS'
      });
      expect(NurseBooking.findOneAndUpdate.mock.calls[0][2]).toEqual({
        new: true,
        runValidators: true,
        context: 'query'
      });
    });
  });

  describe('TZ-014: Surge pricing timezone-safe evaluation', () => {
    it('should apply surge pricing using the client-supplied offset before a DST spring-forward transition', async () => {
      Patient.findById.mockResolvedValue({
        _id: 'patient1',
        totalBookings: 1,
        intakeStatus: 'APPROVED'
      });

      ServiceCatalog.findOne.mockResolvedValue({
        name: 'INJECTION_IM',
        pricing: {
          basePrice: 500,
          surgePricing: {
            enabled: true,
            surgeMultiplier: 2,
            surgeHours: [{ start: '01:00', end: '03:00' }]
          }
        },
        requirements: {},
        availability: { isActive: true }
      });

      NurseBooking.create.mockResolvedValue({ _id: 'booking1', pricing: {} });

      await bookingService.createBooking({
        serviceType: 'INJECTION',
        scheduledDate: '2026-03-08',
        scheduledTime: '01:30',
        scheduledTimezone: 'America/New_York',
        scheduledTimezoneOffsetMinutes: -300,
        serviceLocation: { type: 'HOME' }
      }, 'patient1');

      expect(NurseBooking.create.mock.calls[0][0].pricing.basePrice).toBe(1000);
    });

    it('should not apply surge pricing after a DST spring-forward transition when the local hour is outside surge hours', async () => {
      Patient.findById.mockResolvedValue({
        _id: 'patient1',
        totalBookings: 1,
        intakeStatus: 'APPROVED'
      });

      ServiceCatalog.findOne.mockResolvedValue({
        name: 'INJECTION_IM',
        pricing: {
          basePrice: 500,
          surgePricing: {
            enabled: true,
            surgeMultiplier: 2,
            surgeHours: [{ start: '01:00', end: '03:00' }]
          }
        },
        requirements: {},
        availability: { isActive: true }
      });

      NurseBooking.create.mockResolvedValue({ _id: 'booking1', pricing: {} });

      await bookingService.createBooking({
        serviceType: 'INJECTION',
        scheduledDate: '2026-03-08',
        scheduledTime: '03:30',
        scheduledTimezone: 'America/New_York',
        scheduledTimezoneOffsetMinutes: -240,
        serviceLocation: { type: 'HOME' }
      }, 'patient1');

      expect(NurseBooking.create.mock.calls[0][0].pricing.basePrice).toBe(500);
    });

    it('should apply surge pricing consistently across a repeated DST fall-back hour when the offset is explicit', async () => {
      Patient.findById.mockResolvedValue({
        _id: 'patient1',
        totalBookings: 1,
        intakeStatus: 'APPROVED'
      });

      ServiceCatalog.findOne.mockResolvedValue({
        name: 'INJECTION_IM',
        pricing: {
          basePrice: 500,
          surgePricing: {
            enabled: true,
            surgeMultiplier: 2,
            surgeHours: [{ start: '01:00', end: '02:00' }]
          }
        },
        requirements: {},
        availability: { isActive: true }
      });

      NurseBooking.create.mockResolvedValue({ _id: 'booking1', pricing: {} });

      await bookingService.createBooking({
        serviceType: 'INJECTION',
        scheduledDate: '2026-11-01',
        scheduledTime: '01:30',
        scheduledTimezone: 'America/New_York',
        scheduledTimezoneOffsetMinutes: -300,
        serviceLocation: { type: 'HOME' }
      }, 'patient1');

      expect(NurseBooking.create.mock.calls[0][0].pricing.basePrice).toBe(1000);
    });

    it('should reject surge-priced bookings without an explicit timezone offset', async () => {
      Patient.findById.mockResolvedValue({
        _id: 'patient1',
        totalBookings: 1,
        intakeStatus: 'APPROVED'
      });

      ServiceCatalog.findOne.mockResolvedValue({
        name: 'INJECTION_IM',
        pricing: {
          basePrice: 500,
          surgePricing: {
            enabled: true,
            surgeMultiplier: 2,
            surgeHours: [{ start: '01:00', end: '03:00' }]
          }
        },
        requirements: {},
        availability: { isActive: true }
      });

      await expect(
        bookingService.createBooking({
          serviceType: 'INJECTION',
          scheduledDate: '2026-03-08',
          scheduledTime: '01:30',
          serviceLocation: { type: 'HOME' }
        }, 'patient1')
      ).rejects.toThrow(/timezone offset is required/i);

      expect(NurseBooking.create).not.toHaveBeenCalled();
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
      NurseBooking.findOneAndUpdate.mockResolvedValue(true);
      Patient.findByIdAndUpdate.mockResolvedValue(true);

      await bookingService.completeService('booking1', 'provider1', {
        observations: 'Done'
      });

      expect(NurseBooking.findOneAndUpdate).toHaveBeenCalledTimes(1);
      const updateArg = NurseBooking.findOneAndUpdate.mock.calls[0][1];
      const duration = updateArg.$set['actualService.duration'];

      // Must be null, NOT NaN or undefined
      expect(duration).toBeNull();
    });

    it('should prevent a concurrent loser from processing completion side effects', async () => {
      const mockBooking = {
        _id: 'booking1',
        patient: 'patient1',
        serviceProvider: { toString: () => 'provider1' },
        status: 'IN_PROGRESS',
        actualService: { startTime: new Date() },
        pricing: { payableAmount: 500 }
      };
      NurseBooking.findById.mockResolvedValue(mockBooking);
      NurseBooking.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        bookingService.completeService('booking1', 'provider1', {
          vitalsChecked: { heartRate: 80 },
          observations: 'Done'
        })
      ).rejects.toThrow(/already been completed|no longer in progress/i);

      expect(NurseBooking.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: 'booking1',
          serviceProvider: 'provider1',
          status: 'IN_PROGRESS'
        },
        expect.any(Object),
        expect.any(Object)
      );
      expect(healthMetricService.recordMultipleMetrics).not.toHaveBeenCalled();
      expect(Patient.findByIdAndUpdate).not.toHaveBeenCalled();
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

  describe('TYPE-009: Numeric rounding integrity', () => {
    it('should delegate provider review aggregate recompute through the shared helper', async () => {
      const mockBooking = {
        _id: 'booking1',
        patient: { toString: () => 'patient1' },
        serviceProvider: 'provider1',
        status: 'COMPLETED',
        rating: {},
        save: jest.fn().mockResolvedValue(true)
      };

      NurseBooking.findById.mockResolvedValue(mockBooking);
      const syncSpy = jest.spyOn(bookingService, 'syncProviderReviewStats').mockResolvedValue();

      await bookingService.addReview('booking1', 'patient1', {
        stars: 4,
        comment: 'Very good care'
      });

      expect(syncSpy).toHaveBeenCalledWith('provider1');
    });

    it('should reject a second review for the same booking', async () => {
      const mockBooking = {
        _id: 'booking1',
        patient: { toString: () => 'patient1' },
        serviceProvider: 'provider1',
        status: 'COMPLETED',
        rating: {
          stars: 5,
          comment: 'Already reviewed',
          ratedAt: new Date()
        },
        save: jest.fn().mockResolvedValue(true)
      };

      NurseBooking.findById.mockResolvedValue(mockBooking);

      await expect(
        bookingService.addReview('booking1', 'patient1', {
          stars: 4,
          comment: 'Trying to edit review'
        })
      ).rejects.toThrow(/already reviewed/i);

      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('should update an existing review and recompute provider aggregates through the shared helper', async () => {
      const ratedAt = new Date('2026-01-15T10:00:00.000Z');
      const mockBooking = {
        _id: 'booking1',
        patient: { toString: () => 'patient1' },
        serviceProvider: 'provider1',
        status: 'COMPLETED',
        rating: {
          stars: 5,
          comment: 'Original review',
          ratedAt
        },
        save: jest.fn().mockResolvedValue(true)
      };

      NurseBooking.findById.mockResolvedValue(mockBooking);
      const syncSpy = jest.spyOn(bookingService, 'syncProviderReviewStats').mockResolvedValue();

      const result = await bookingService.updateReview('booking1', 'patient1', {
        stars: 3,
        comment: 'Updated review'
      });

      expect(result.rating).toEqual(expect.objectContaining({
        stars: 3,
        comment: 'Updated review',
        ratedAt
      }));
      expect(mockBooking.save).toHaveBeenCalledTimes(1);
      expect(syncSpy).toHaveBeenCalledWith('provider1');
    });

    it('should delete an existing review and recompute provider aggregates through the shared helper', async () => {
      const mockBooking = {
        _id: 'booking1',
        patient: { toString: () => 'patient1' },
        serviceProvider: 'provider1',
        status: 'COMPLETED',
        rating: {
          stars: 5,
          comment: 'Original review',
          ratedAt: new Date('2026-01-15T10:00:00.000Z')
        },
        save: jest.fn().mockResolvedValue(true)
      };

      NurseBooking.findById.mockResolvedValue(mockBooking);
      const syncSpy = jest.spyOn(bookingService, 'syncProviderReviewStats').mockResolvedValue();

      const result = await bookingService.deleteReview('booking1', 'patient1');

      expect(result.rating).toEqual({});
      expect(mockBooking.save).toHaveBeenCalledTimes(1);
      expect(syncSpy).toHaveBeenCalledWith('provider1');
    });

    it('should skip provider review aggregate recompute when only review comment changes', async () => {
      const ratedAt = new Date('2026-01-15T10:00:00.000Z');
      const mockBooking = {
        _id: 'booking1',
        patient: { toString: () => 'patient1' },
        serviceProvider: 'provider1',
        status: 'COMPLETED',
        rating: {
          stars: 5,
          comment: 'Original review',
          ratedAt
        },
        save: jest.fn().mockResolvedValue(true)
      };

      NurseBooking.findById.mockResolvedValue(mockBooking);
      const syncSpy = jest.spyOn(bookingService, 'syncProviderReviewStats').mockResolvedValue();

      const result = await bookingService.updateReview('booking1', 'patient1', {
        stars: 5,
        comment: 'Edited wording only'
      });

      expect(result.rating).toEqual(expect.objectContaining({
        stars: 5,
        comment: 'Edited wording only',
        ratedAt
      }));
      expect(mockBooking.save).toHaveBeenCalledTimes(1);
      expect(syncSpy).not.toHaveBeenCalled();
    });

    it('should recompute provider rating and totalReviews from reviewed bookings via shared helper', async () => {
      NurseBooking.aggregate.mockResolvedValue([
        { _id: null, avgRating: 4.333333333333333, totalReviews: 3 }
      ]);
      User.findByIdAndUpdate.mockResolvedValue(true);

      await bookingService.syncProviderReviewStats('provider1');

      expect(NurseBooking.aggregate).toHaveBeenCalledWith([
        {
          $match: {
            serviceProvider: 'provider1',
            'rating.ratedAt': { $exists: true }
          }
        },
        {
          $group: {
            _id: null,
            totalReviews: { $sum: 1 },
            avgRating: { $avg: '$rating.stars' }
          }
        }
      ]);
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        'provider1',
        {
          rating: 4.33,
          totalReviews: 3
        },
        {
          new: true,
          runValidators: true,
          context: 'query'
        }
      );
    });

    it('should persist provider rating as a number rounded to two decimals', async () => {
      const mockBooking = {
        _id: 'booking1',
        patient: { toString: () => 'patient1' },
        serviceProvider: 'provider1',
        status: 'COMPLETED',
        rating: {},
        save: jest.fn().mockResolvedValue(true)
      };

      NurseBooking.findById.mockResolvedValue(mockBooking);
      NurseBooking.aggregate.mockResolvedValue([
        { _id: null, avgRating: 4.333333333333333, totalReviews: 3 }
      ]);
      User.findByIdAndUpdate.mockResolvedValue(true);

      await bookingService.addReview('booking1', 'patient1', {
        stars: 4,
        comment: 'Very good care'
      });

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        'provider1',
        {
          rating: 4.33,
          totalReviews: 3
        },
        {
          new: true,
          runValidators: true,
          context: 'query'
        }
      );
      expect(typeof User.findByIdAndUpdate.mock.calls[0][1].rating).toBe('number');
      expect(User.findByIdAndUpdate.mock.calls[0][1].totalReviews).toBe(3);
    });

    it('should persist zeroed provider review metrics when no reviewed bookings remain', async () => {
      NurseBooking.aggregate.mockResolvedValue([]);
      User.findByIdAndUpdate.mockResolvedValue(true);

      await bookingService.syncProviderReviewStats('provider1');

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        'provider1',
        {
          rating: 0,
          totalReviews: 0
        },
        {
          new: true,
          runValidators: true,
          context: 'query'
        }
      );
    });

    it('should no-op the conditional provider review sync helper when aggregate-driving fields are unchanged', async () => {
      const syncSpy = jest.spyOn(bookingService, 'syncProviderReviewStats').mockResolvedValue();

      const didSync = await bookingService.syncProviderReviewStatsIfNeeded(
        'provider1',
        {
          stars: 4,
          comment: 'Original',
          ratedAt: new Date('2026-01-15T10:00:00.000Z')
        },
        {
          stars: 4,
          comment: 'Updated comment only',
          ratedAt: new Date('2026-01-15T10:00:00.000Z')
        }
      );

      expect(didSync).toBe(false);
      expect(syncSpy).not.toHaveBeenCalled();
    });

    it('should return completionRate as a number rounded to two decimals', async () => {
      NurseBooking.countDocuments
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0);
      NurseBooking.aggregate.mockResolvedValue([
        { totalRevenue: 1500, platformRevenue: 225 }
      ]);

      const stats = await bookingService.getBookingStats();

      expect(stats.completionRate).toBe(66.67);
      expect(typeof stats.completionRate).toBe('number');
    });
  });
});
