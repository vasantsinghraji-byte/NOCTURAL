const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const RefreshSession = require('../models/refreshSession');

const hashToken = (token) => crypto
  .createHash('sha256')
  .update(String(token))
  .digest('hex');

const getTokenExpiry = (token) => {
  const decoded = jwt.decode(token);

  if (!decoded || !decoded.exp) {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }

  return new Date(decoded.exp * 1000);
};

const getRequestMetadata = (req) => ({
  ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
  userAgent: req.get ? req.get('user-agent') : req.headers['user-agent']
});

const create = async ({ token, userId, userType, req }) => {
  const tokenHash = hashToken(token);
  const metadata = req ? getRequestMetadata(req) : {};

  await RefreshSession.create({
    tokenHash,
    userId,
    userType,
    expiresAt: getTokenExpiry(token),
    ...metadata
  });

  return tokenHash;
};

const rotate = async ({ currentToken, replacementToken, req }) => {
  const currentHash = hashToken(currentToken);
  const replacementHash = hashToken(replacementToken);
  const now = new Date();

  const currentSession = await RefreshSession.findOneAndUpdate(
    {
      tokenHash: currentHash,
      revokedAt: null,
      expiresAt: { $gt: now }
    },
    {
      revokedAt: now,
      replacedByTokenHash: replacementHash
    },
    { new: true }
  );

  if (!currentSession) {
    return null;
  }

  await create({
    token: replacementToken,
    userId: currentSession.userId,
    userType: currentSession.userType,
    req
  });

  return currentSession;
};

const revoke = async (token) => {
  if (!token) {
    return;
  }

  await RefreshSession.updateOne(
    {
      tokenHash: hashToken(token),
      revokedAt: null
    },
    {
      revokedAt: new Date()
    }
  );
};

module.exports = {
  create,
  rotate,
  revoke,
  hashToken
};
