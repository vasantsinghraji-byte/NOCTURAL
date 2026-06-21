const MobileDevice = require('../models/mobileDevice');
const { normalizeObjectId } = require('../utils/safeMongo');

const normalizeOwnerType = (userType) => userType === 'patient' ? 'patient' : 'provider';
const normalizePlatform = (platform) => {
  if (platform === 'android' || platform === 'ios') return platform;
  throw new TypeError('platform is invalid');
};
const normalizeQueryValue = (value, field, maxLength) => {
  if (typeof value !== 'string') {
    throw new TypeError(`${field} must be a string`);
  }

  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new TypeError(`${field} is invalid`);
  }
  return normalized;
};

// Inputs are reduced to string, ObjectId, and enum primitives before reaching this fixed-shape update.
// lgtm[js/sql-injection]
const register = ({ owner, userType, token, platform }) => MobileDevice.findOneAndUpdate(
  { token: normalizeQueryValue(token, 'token', 4096) },
  {
    owner: normalizeObjectId(owner, 'owner'),
    ownerType: normalizeOwnerType(userType),
    platform: normalizePlatform(platform),
    enabled: true,
    lastSeenAt: new Date()
  },
  { new: true, upsert: true, runValidators: true }
);

const unregister = ({ owner, userType, token }) => MobileDevice.findOneAndUpdate(
  {
    owner: normalizeObjectId(owner, 'owner'),
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
    owner: normalizeObjectId(owner, 'owner'),
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
