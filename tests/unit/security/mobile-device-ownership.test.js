jest.mock('../../../models/mobileDevice', () => ({
  findOneAndUpdate: jest.fn()
}));

const MobileDevice = require('../../../models/mobileDevice');
const mobileDeviceService = require('../../../services/mobileDeviceService');
const mongoose = require('mongoose');

const PATIENT_ID = '507f1f77bcf86cd799439011';
const PROVIDER_ID = '507f191e810c19729de860ea';

describe('mobile device ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers a device against the authenticated identity', async () => {
    MobileDevice.findOneAndUpdate.mockResolvedValue({ token: 'device-token-123456' });

    await mobileDeviceService.register({
      owner: PATIENT_ID,
      userType: 'patient',
      token: 'device-token-123456',
      platform: 'android'
    });

    expect(MobileDevice.findOneAndUpdate).toHaveBeenCalledWith(
      { token: 'device-token-123456' },
      expect.objectContaining({
        owner: new mongoose.Types.ObjectId(PATIENT_ID),
        ownerType: 'patient',
        platform: 'android',
        enabled: true
      }),
      expect.objectContaining({ upsert: true, runValidators: true })
    );
  });

  it('cannot unregister a token without matching its authenticated owner', async () => {
    MobileDevice.findOneAndUpdate.mockResolvedValue(null);

    await mobileDeviceService.unregister({
      owner: PROVIDER_ID,
      userType: 'provider',
      token: 'device-token-123456'
    });

    expect(MobileDevice.findOneAndUpdate).toHaveBeenCalledWith(
      {
        owner: new mongoose.Types.ObjectId(PROVIDER_ID),
        ownerType: 'provider',
        token: 'device-token-123456'
      },
      expect.objectContaining({ enabled: false }),
      { new: true }
    );
  });

  it('rejects object-shaped values before building Mongo queries', async () => {
    expect(() => mobileDeviceService.register({
      owner: { $ne: null },
      userType: 'patient',
      token: { $gt: '' },
      platform: 'android'
    })).toThrow('token must be a string');

    expect(MobileDevice.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
