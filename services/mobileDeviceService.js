const MobileDevice = require('../models/mobileDevice');

const normalizeOwnerType = (userType) => userType === 'patient' ? 'patient' : 'provider';
const normalizeQueryValue = (value, field, maxLength) => {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new TypeError(`${field} must be a primitive value`);
  }

  const normalized = String(value).trim();
  if (!normalized || normalized.length > maxLength) {
    throw new TypeError(`${field} is invalid`);
  }
  return normalized;
};

const register = ({ owner, userType, token, platform }) => MobileDevice.findOneAndUpdate(
  { token: normalizeQueryValue(token, 'token', 4096) },
  {
    owner: normalizeQueryValue(owner, 'owner', 128),
    ownerType: normalizeOwnerType(userType),
    platform,
    enabled: true,
    lastSeenAt: new Date()
  },
  { new: true, upsert: true, runValidators: true }
);

const unregister = ({ owner, userType, token }) => MobileDevice.findOneAndUpdate(
  {
    owner: normalizeQueryValue(owner, 'owner', 128),
    ownerType: normalizeOwnerType(userType),
    token: normalizeQueryValue(token, 'token', 4096)
  },
  {
    enabled: false,
    lastSeenAt: new Date()
  },
  { new: true }
);

const getEnabledTokens = async ({ owner, userType }) => {
  const devices = await MobileDevice.find({
    owner: normalizeQueryValue(owner, 'owner', 128),
    ownerType: normalizeOwnerType(userType),
    enabled: true
  }).select('token -_id').lean();

  return devices.map(device => device.token);
};

const disableTokens = (tokens) => MobileDevice.updateMany(
  { token: { $in: tokens.map(token => normalizeQueryValue(token, 'token', 4096)) } },
  { enabled: false, lastSeenAt: new Date() }
);

module.exports = {
  register,
  unregister,
  getEnabledTokens,
  disableTokens
};
