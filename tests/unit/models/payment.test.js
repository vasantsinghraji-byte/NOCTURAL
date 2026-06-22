const mongoose = require('mongoose');
const Payment = require('../../../models/payment');

describe('Payment Model - Earnings Aggregation Compatibility', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should build getDoctorEarnings match query with a Mongoose ObjectId instance', async () => {
    const doctorId = new mongoose.Types.ObjectId().toString();
    const aggregateSpy = jest.spyOn(Payment, 'aggregate').mockResolvedValue([]);

    await Payment.getDoctorEarnings(doctorId);

    expect(aggregateSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          $match: expect.objectContaining({
            doctor: expect.any(mongoose.Types.ObjectId)
          })
        })
      ])
    );

    const [{ $match }] = aggregateSpy.mock.calls[0][0];
    expect($match.doctor.toString()).toBe(doctorId);
  });

  test('should build getMonthlyEarnings match query with a Mongoose ObjectId instance', async () => {
    const doctorId = new mongoose.Types.ObjectId().toString();
    const aggregateSpy = jest.spyOn(Payment, 'aggregate').mockResolvedValue([]);

    await Payment.getMonthlyEarnings(doctorId, 2026);

    expect(aggregateSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          $match: expect.objectContaining({
            doctor: expect.any(mongoose.Types.ObjectId)
          })
        })
      ])
    );

    const [{ $match }] = aggregateSpy.mock.calls[0][0];
    expect($match.doctor.toString()).toBe(doctorId);
  });
});
