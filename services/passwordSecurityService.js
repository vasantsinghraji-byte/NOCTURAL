const mongoose = require('mongoose');
const refreshSessionService = require('./refreshSessionService');
const compromisedPasswordService = require('./compromisedPasswordService');
const operationalMetrics = require('../utils/operationalMetrics');
const monitoring = require('../utils/monitoring');
const SecurityNotificationOutbox = require('../models/securityNotificationOutbox');
const { encodePayload } = require('./securityNotificationPayloadCrypto');

const loadWebAuthnService = () => {
  try {
    return require('./webAuthnService');
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND' && error.message.includes('./webAuthnService')) {
      return { consumePasswordConfirmation: async () => undefined };
    }
    throw error;
  }
};

const webAuthnService = loadWebAuthnService();

const executePasswordChange = async ({
  IdentityModel,
  identityId,
  userType,
  currentPassword,
  newPassword,
  notFoundError,
  invalidPasswordError,
  webauthnConfirmationId,
  notificationMetadata,
  session
}) => {
  let query = IdentityModel.findById(identityId).select('+password +sessionVersion +webAuthnCredentials');
  if (session && typeof query.session === 'function') query = query.session(session);
  const identity = await query;

  if (!identity) throw notFoundError;
  if (!await identity.comparePassword(currentPassword)) throw invalidPasswordError;
  if ((identity.webAuthnCredentials || []).length > 0) {
    await webAuthnService.consumePasswordConfirmation({
      identityId,
      identityType: userType,
      confirmationId: webauthnConfirmationId,
      session
    });
  }

  identity.password = newPassword;
  identity.sessionVersion = (Number(identity.sessionVersion) || 0) + 1;
  await identity.save(session ? { session } : undefined);
  const revocation = await refreshSessionService.revokeAllForUser({
    userId: identityId,
    userType,
    reason: 'PASSWORD_CHANGED',
    session
  });
  const outboxPayload = {
    identityId: identity._id,
    identityType: userType,
    email: identity.email,
    name: identity.name,
    changedAt: new Date(),
    ...notificationMetadata
  };
  if (session) {
    await SecurityNotificationOutbox.create([{
      identityId,
      identityType: userType,
      event: 'PASSWORD_CHANGED',
      payloadEncrypted: encodePayload(outboxPayload)
    }], { session });
  } else if (mongoose.connection.readyState === 1) {
    await SecurityNotificationOutbox.create({
      identityId,
      identityType: userType,
      event: 'PASSWORD_CHANGED',
      payloadEncrypted: encodePayload(outboxPayload)
    });
  }

  return {
    identity,
    revokedSessions: Number(revocation?.modifiedCount) || 0
  };
};

const changePassword = async (options) => {
  await compromisedPasswordService.assertPasswordNotCompromised(options.newPassword);

  try {
    let result;
    if (mongoose.connection.readyState === 1) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          result = await executePasswordChange({ ...options, session });
        });
      } finally {
        await session.endSession();
      }
    } else {
      result = await executePasswordChange(options);
    }

    operationalMetrics.increment('password_changes_total');
    operationalMetrics.increment('password_change_sessions_revoked_total', result.revokedSessions);
    if (result.revokedSessions === 0) {
      operationalMetrics.increment('password_change_zero_session_revocations_total');
    }
    return result;
  } catch (error) {
    operationalMetrics.increment('password_change_failures_total');
    if (!['AuthenticationError', 'ValidationError'].includes(error.name)) {
      monitoring.trackError('authentication', error, { operation: 'password_change' });
    }
    throw error;
  }
};

module.exports = { changePassword };
