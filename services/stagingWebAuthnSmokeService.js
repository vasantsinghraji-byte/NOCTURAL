const crypto = require('crypto');
const User = require('../models/user');
const WebAuthnChallenge = require('../models/webAuthnChallenge');
const WebAuthnRecoveryCode = require('../models/webAuthnRecoveryCode');
const { generateAccessToken } = require('../utils/authTokens');
const { ROLES } = require('../constants/roles');

const SMOKE_EMAIL_PREFIX = 'webauthn-smoke-';
const smokeEmailDomain = () => process.env.STAGING_WEBAUTHN_SMOKE_EMAIL_DOMAIN || 'staging.nocturnal.test';
const smokeExpiresAt = () => new Date(Date.now() + (Number(process.env.STAGING_WEBAUTHN_SMOKE_TTL_MINUTES) || 60) * 60 * 1000);

const cleanupExpiredAccounts = async () => {
  const expired = await User.find({
    email: new RegExp(`^${SMOKE_EMAIL_PREFIX}`),
    smokeTestExpiresAt: { $lte: new Date() }
  }).select('_id');

  await Promise.all(expired.map(user => Promise.all([
    WebAuthnChallenge.deleteMany({ identityId: user._id, identityType: 'user' }),
    WebAuthnRecoveryCode.deleteMany({ identityId: user._id, identityType: 'user' }),
    User.deleteOne({ _id: user._id })
  ])));
};

const createAccount = async () => {
  await cleanupExpiredAccounts();
  const suffix = crypto.randomUUID();
  const password = crypto.randomBytes(24).toString('base64url');
  const user = await User.create({
    name: 'WebAuthn Staging Smoke',
    email: `${SMOKE_EMAIL_PREFIX}${suffix}@${smokeEmailDomain()}`,
    password,
    role: ROLES.DOCTOR,
    phone: '0000000000',
    specialty: 'General Medicine',
    onboardingCompleted: true,
    isVerified: true,
    smokeTestExpiresAt: smokeExpiresAt()
  });

  return {
    accountId: String(user._id),
    email: user.email,
    token: generateAccessToken(user._id, 'user', user.sessionVersion)
  };
};

const revokeAccount = async (accountId) => {
  const user = await User.findOne({ _id: accountId, email: new RegExp(`^${SMOKE_EMAIL_PREFIX}`) });
  if (!user) {
    return { revoked: false };
  }

  await Promise.all([
    WebAuthnChallenge.deleteMany({ identityId: user._id, identityType: 'user' }),
    WebAuthnRecoveryCode.deleteMany({ identityId: user._id, identityType: 'user' }),
    User.deleteOne({ _id: user._id })
  ]);

  return { revoked: true };
};

module.exports = {
  createAccount,
  revokeAccount,
  cleanupExpiredAccounts
};
