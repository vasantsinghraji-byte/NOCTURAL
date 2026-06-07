const mongoose = require('mongoose');

jest.mock('../../models/nurseBooking');
jest.mock('../../models/serviceCatalog');
jest.mock('../../models/patient');
jest.mock('../../middleware/queryCache', () => ({ invalidateCache: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  logSecurity: jest.fn()
}));
jest.mock('../../services/healthIntakeService', () => ({
  startIntakeProcess: jest.fn()
}));
jest.mock('../../services/healthMetricService', () => ({
  recordMultipleMetrics: jest.fn()
}));
jest.mock('../../services/healthRecordService', () => ({
  captureBookingVitals: jest.fn()
}));
jest.mock('../../services/doctorAccessService', () => ({
  grantAccess: jest.fn()
}));

const NurseBooking = require('../../models/nurseBooking');
const User = require('../../models/user');
const bookingService = require('../../services/bookingService');

describe('Integration: booking rating persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  it('should persist average provider rating on the root-level User.rating field', async () => {
    const provider = new User({
      _id: new mongoose.Types.ObjectId(),
      role: 'doctor',
      rating: 0,
      totalReviews: 0,
      professional: {}
    });

    const booking = {
      _id: 'booking1',
      patient: { toString: () => 'patient1' },
      serviceProvider: provider._id,
      status: 'COMPLETED',
      rating: {},
      save: jest.fn().mockResolvedValue(true)
    };

    NurseBooking.findById.mockResolvedValue(booking);
    NurseBooking.aggregate.mockResolvedValue([
      { _id: null, avgRating: 4.333333333333333, totalReviews: 3 }
    ]);

    const updateSpy = jest.spyOn(User, 'findByIdAndUpdate').mockImplementation(async (_id, update) => {
      provider.set(update);
      return provider;
    });

    await bookingService.addReview('booking1', 'patient1', {
      stars: 4,
      comment: 'Great service'
    });

    expect(updateSpy).toHaveBeenCalledWith(
      provider._id,
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
    expect(provider.rating).toBe(4.33);
    expect(provider.totalReviews).toBe(3);
    expect(provider.get('professional.rating')).toBeUndefined();
  });

  it('should recompute root-level rating metrics after deleting a review', async () => {
    const provider = new User({
      _id: new mongoose.Types.ObjectId(),
      role: 'doctor',
      rating: 4.33,
      totalReviews: 3,
      professional: {}
    });

    const booking = {
      _id: 'booking2',
      patient: { toString: () => 'patient1' },
      serviceProvider: provider._id,
      status: 'COMPLETED',
      rating: {
        stars: 4,
        comment: 'Great service',
        ratedAt: new Date('2026-01-15T10:00:00.000Z')
      },
      save: jest.fn().mockResolvedValue(true)
    };

    NurseBooking.findById.mockResolvedValue(booking);
    NurseBooking.aggregate.mockResolvedValue([]);

    const updateSpy = jest.spyOn(User, 'findByIdAndUpdate').mockImplementation(async (_id, update) => {
      provider.set(update);
      return provider;
    });

    await bookingService.deleteReview('booking2', 'patient1');

    expect(updateSpy).toHaveBeenCalledWith(
      provider._id,
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
    expect(provider.rating).toBe(0);
    expect(provider.totalReviews).toBe(0);
    expect(provider.get('professional.rating')).toBeUndefined();
  });
});
