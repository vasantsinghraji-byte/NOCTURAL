jest.mock('../../../models/mobileDevice', () => ({
  findOneAndUpdate: jest.fn()
}));

const MobileDevice = require('../../../models/mobileDevice');
const mobileDeviceService = require('../../../services/mobileDeviceService');

describe('mobile device ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers a device against the authenticated identity', async () => {
    MobileDevice.findOneAndUpdate.mockResolvedValue({ token: 'device-token-123456' });

    await mobileDeviceService.register({
      owner: 'patient-1',
      userType: 'patient',
      token: 'device-token-123456',
      platform: 'android'
    });

    expect(MobileDevice.findOneAndUpdate).toHaveBeenCalledWith(
      { token: 'device-token-123456' },
      expect.objectContaining({
        owner: 'patient-1',
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
      owner: 'provider-1',
      userType: 'provider',
      token: 'device-token-123456'
    });

    expect(MobileDevice.findOneAndUpdate).toHaveBeenCalledWith(
      {
        owner: 'provider-1',
        ownerType: 'provider',
        token: 'device-token-123456'
      },
      expect.objectContaining({ enabled: false }),
      { new: true }
    );
  });
});
