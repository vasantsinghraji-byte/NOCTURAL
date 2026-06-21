jest.mock('../../../models/mobileDevice', () => {
  function MockMobileDevice() {
    this.save = MockMobileDevice.save;
    MockMobileDevice.lastInstance = this;
  }
  MockMobileDevice.save = jest.fn();
  MockMobileDevice.findOne = jest.fn();
  MockMobileDevice.findOneAndUpdate = jest.fn();
  return MockMobileDevice;
});

const MobileDevice = require('../../../models/mobileDevice');
const mobileDeviceService = require('../../../services/mobileDeviceService');
const mongoose = require('mongoose');

const PATIENT_ID = '507f1f77bcf86cd799439011';
const PROVIDER_ID = '507f191e810c19729de860ea';

describe('mobile device ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MobileDevice.findOne.mockReturnValue({
      where: jest.fn().mockReturnValue({
        equals: jest.fn().mockResolvedValue(null)
      })
    });
    MobileDevice.save.mockResolvedValue({ token: 'device-token-123456' });
  });

  it('registers a device against the authenticated identity', async () => {
    await mobileDeviceService.register({
      owner: PATIENT_ID,
      userType: 'patient',
      token: 'device-token-123456',
      platform: 'android'
    });

    const device = MobileDevice.lastInstance;
    expect(device).toEqual(expect.objectContaining({
      token: 'device-token-123456',
      owner: new mongoose.Types.ObjectId(PATIENT_ID),
      ownerType: 'patient',
      platform: 'android',
      enabled: true
    }));
    expect(MobileDevice.save).toHaveBeenCalledTimes(1);
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
    await expect(mobileDeviceService.register({
      owner: { $ne: null },
      userType: 'patient',
      token: { $gt: '' },
      platform: 'android'
    })).rejects.toThrow('token must be a string');

    expect(MobileDevice.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects invalid owner and platform values before building Mongo updates', async () => {
    await expect(mobileDeviceService.register({
      owner: { $ne: null },
      userType: 'patient',
      token: 'device-token-123456',
      platform: 'android'
    })).rejects.toThrow('Invalid owner');

    await expect(mobileDeviceService.register({
      owner: PATIENT_ID,
      userType: 'patient',
      token: 'device-token-123456',
      platform: { $ne: null }
    })).rejects.toThrow('platform is invalid');

    expect(MobileDevice.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
