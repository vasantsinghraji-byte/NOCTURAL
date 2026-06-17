const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const RefreshSession = require('../models/refreshSession');
const User = require('../models/user');
const Patient = require('../models/patient');
const securityAuditService = require('./securityAuditService');
const operationalMetrics = require('../utils/operationalMetrics');

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

const getTokenIssuedAt = (token) => {
  const decoded = jwt.decode(token);
  return decoded?.iat || null;
};

const isInvalidAfterPasswordChange = (identity, session, tokenIssuedAt, tokenSessionVersion) => (
  !identity ||
  (Number(identity.sessionVersion) || 0) !== (Number(tokenSessionVersion) || 0) ||
  (identity.passwordChangedAt && (
    !session.createdAt ||
    session.createdAt < identity.passwordChangedAt ||
    !tokenIssuedAt ||
    tokenIssuedAt < Math.floor(identity.passwordChangedAt.getTime() / 1000)
  ))
);

const getRequestMetadata = (req) => ({
  ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
  userAgent: req.get ? req.get('user-agent') : req.headers['user-agent']
});

const revokeActiveSessionsForIdentity = async ({
  userId,
  userType,
  reason,
  revokedAt = new Date(),
  session
}) => {
  const filter = { userId, userType, revokedAt: null };
  const update = { revokedAt, revokedReason: reason };
  return session
    ? RefreshSession.updateMany(filter, update, { session })
    : RefreshSession.updateMany(filter, update);
};

const create = async ({ token, userId, userType, req, familyId = crypto.randomUUID() }) => {
  const tokenHash = hashToken(token);
  const metadata = req ? getRequestMetadata(req) : {};

  await RefreshSession.create({
    tokenHash,
    userId,
    userType,
    familyId,
    expiresAt: getTokenExpiry(token),
    ...metadata
  });

  return { tokenHash, familyId };
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
      replacedByTokenHash: replacementHash,
      lastUsedAt: now
    },
    { new: true }
  );

  if (!currentSession) {
    const reusedSession = await RefreshSession.findOne({ tokenHash: currentHash });
    if (reusedSession?.replacedByTokenHash || reusedSession?.revokedAt) {
      operationalMetrics.increment('refresh_token_reuse_total');
      const familyFilter = reusedSession.familyId
        ? { familyId: reusedSession.familyId, revokedAt: null }
        : { userId: reusedSession.userId, userType: reusedSession.userType, revokedAt: null };
      await RefreshSession.updateMany(
        familyFilter,
        { revokedAt: now, revokedReason: 'TOKEN_REUSE_DETECTED', reuseDetectedAt: now }
      );
      await securityAuditService.record({
        event: 'refresh_token_reuse_detected',
        actorId: reusedSession.userId,
        actorType: reusedSession.userType,
        targetType: 'refresh_session_family',
        targetId: reusedSession.familyId || reusedSession.userId,
        outcome: 'warning',
        req
      });
    }
    return null;
  }

  const familyId = currentSession.familyId || crypto.randomUUID();
  if (!currentSession.familyId) {
    await RefreshSession.updateOne(
      { tokenHash: currentHash },
      { familyId }
    );
  }

  const IdentityModel = currentSession.userType === 'patient' ? Patient : User;
  const identity = await IdentityModel.findById(currentSession.userId)
    .select('passwordChangedAt +sessionVersion');
  const tokenIssuedAt = getTokenIssuedAt(currentToken);
  const tokenSessionVersion = jwt.decode(currentToken)?.sessionVersion;
  if (isInvalidAfterPasswordChange(identity, currentSession, tokenIssuedAt, tokenSessionVersion)) {
    await RefreshSession.updateOne(
      { tokenHash: currentHash },
      { revokedReason: identity ? 'PASSWORD_CHANGED' : 'IDENTITY_NOT_FOUND' }
    );
    await revokeActiveSessionsForIdentity({
      userId: currentSession.userId,
      userType: currentSession.userType,
      reason: identity ? 'PASSWORD_CHANGED' : 'IDENTITY_NOT_FOUND',
      revokedAt: now
    });
    await securityAuditService.record({
      event: 'stale_refresh_token_attempt',
      actorId: currentSession.userId,
      actorType: currentSession.userType,
      outcome: 'warning',
      req
    });
    return null;
  }

  await create({
    token: replacementToken,
    userId: currentSession.userId,
    userType: currentSession.userType,
    req,
    familyId
  });

  // Close the race where a password change occurs while rotation is creating
  // the replacement session.
  const latestIdentity = await IdentityModel.findById(currentSession.userId)
    .select('passwordChangedAt +sessionVersion');
  if (isInvalidAfterPasswordChange(latestIdentity, currentSession, tokenIssuedAt, tokenSessionVersion)) {
    const reason = latestIdentity ? 'PASSWORD_CHANGED' : 'IDENTITY_NOT_FOUND';
    await revoke(replacementToken, reason);
    await revokeActiveSessionsForIdentity({
      userId: currentSession.userId,
      userType: currentSession.userType,
      reason
    });
    return null;
  }

  return currentSession;
};

const revoke = async (token, reason = 'LOGOUT') => {
  if (!token) {
    return;
  }

  await RefreshSession.updateOne(
    {
      tokenHash: hashToken(token),
      revokedAt: null
    },
    {
      revokedAt: new Date(),
      revokedReason: reason
    }
  );
};

const revokeAllForUser = async ({ userId, userType, reason = 'REVOKE_ALL', session }) =>
  revokeActiveSessionsForIdentity({ userId, userType, reason, session });

const listForUser = async ({ userId, userType }) => RefreshSession.find({
  userId,
  userType,
  revokedAt: null,
  expiresAt: { $gt: new Date() }
})
  .sort({ lastUsedAt: -1 })
  .select('_id familyId createdAt lastUsedAt expiresAt ipAddress userAgent')
  .lean();

const revokeById = async ({ sessionId, userId, userType }) => RefreshSession.findOneAndUpdate(
  { _id: sessionId, userId, userType, revokedAt: null },
  { revokedAt: new Date(), revokedReason: 'USER_REVOKED_SESSION' },
  { new: true }
);

module.exports = {
  create,
  rotate,
  revoke,
  revokeAllForUser,
  listForUser,
  revokeById,
  hashToken
};
