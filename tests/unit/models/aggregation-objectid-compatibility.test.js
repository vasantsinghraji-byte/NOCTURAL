const mongoose = require('mongoose');
const Earning = require('../../../models/earning');
const Review = require('../../../models/review');

describe('Model Aggregation ObjectId Compatibility', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should build Earning.getMonthlyEarnings match query with a Mongoose ObjectId instance', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const aggregateSpy = jest.spyOn(Earning, 'aggregate').mockResolvedValue([]);

    await Earning.getMonthlyEarnings(userId, 2026, 4);

    expect(aggregateSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          $match: expect.objectContaining({
            user: expect.any(mongoose.Types.ObjectId)
          })
        })
      ])
    );

    const [{ $match }] = aggregateSpy.mock.calls[0][0];
    expect($match.user.toString()).toBe(userId);
  });

  test('should build Review.getUserAverageRating match query with a Mongoose ObjectId instance', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const aggregateSpy = jest.spyOn(Review, 'aggregate').mockResolvedValue([]);

    await Review.getUserAverageRating(userId);

    expect(aggregateSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          $match: expect.objectContaining({
            reviewedUser: expect.any(mongoose.Types.ObjectId)
          })
        })
      ])
    );

    const [{ $match }] = aggregateSpy.mock.calls[0][0];
    expect($match.reviewedUser.toString()).toBe(userId);
  });
});
