const MobileDevice = require('../models/mobileDevice');

const normalizeOwnerType = (userType) => userType === 'patient' ? 'patient' : 'provider';

const register = ({ owner, userType, token, platform }) => MobileDevice.findOneAndUpdate(
  { token },
  {
    owner,
    ownerType: normalizeOwnerType(userType),
    platform,
    enabled: true,
    lastSeenAt: new Date()
  },
  { new: true, upsert: true, runValidators: true }
);

const unregister = ({ owner, userType, token }) => MobileDevice.findOneAndUpdate(
  {
    owner,
    ownerType: normalizeOwnerType(userType),
    token
  },
  {
    enabled: false,
    lastSeenAt: new Date()
  },
  { new: true }
);

const getEnabledTokens = async ({ owner, userType }) => {
  const devices = await MobileDevice.find({
    owner,
    ownerType: normalizeOwnerType(userType),
    enabled: true
  }).select('token -_id').lean();

  return devices.map(device => device.token);
};

const disableTokens = (tokens) => MobileDevice.updateMany(
  { token: { $in: tokens } },
  { enabled: false, lastSeenAt: new Date() }
);

module.exports = {
  register,
  unregister,
  getEnabledTokens,
  disableTokens
};
