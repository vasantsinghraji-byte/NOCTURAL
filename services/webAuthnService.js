const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} = require('@simplewebauthn/server');
const crypto = require('crypto');
const User = require('../models/user');
const Patient = require('../models/patient');
const WebAuthnChallenge = require('../models/webAuthnChallenge');
const WebAuthnRecoveryCode = require('../models/webAuthnRecoveryCode');
const operationalMetrics = require('../utils/operationalMetrics');
const { hash } = require('../utils/encryption');
const { AuthenticationError, ValidationError, NotFoundError, ConflictError } = require('../utils/errors');

const getConfig = () => ({
  rpName: process.env.WEBAUTHN_RP_NAME || 'Nocturnal',
  rpID: process.env.WEBAUTHN_RP_ID || 'localhost',
  origin: process.env.WEBAUTHN_ORIGIN || 'http://localhost:5000'
});

const getModel = identityType => identityType === 'patient' ? Patient : User;
const getCredentials = identity => identity.webAuthnCredentials || [];
const challengeExpiry = () => new Date(Date.now() + (Number(process.env.WEBAUTHN_CHALLENGE_TTL_MS) || 5 * 60 * 1000));
const recoveryCodeExpiry = () => new Date(Date.now() + (Number(process.env.WEBAUTHN_RECOVERY_CODE_TTL_DAYS) || 180) * 24 * 60 * 60 * 1000);
const normalizeCredentialId = value => String(value || '').trim();

const createChallenge = async ({ identityId, identityType, purpose, challenge }) =>
  WebAuthnChallenge.create({ identityId, identityType, purpose, challenge, expiresAt: challengeExpiry() });

const formatRecoveryCode = () =>
  crypto.randomBytes(10).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16).match(/.{1,4}/g).join('-');

const listCredentials = async ({ identityId, identityType }) => {
  const identity = await getModel(identityType).findById(identityId).select('+webAuthnCredentials');
  if (!identity) throw new AuthenticationError('Account not found');
  return {
    credentials: getCredentials(identity).map(item => ({
      credentialId: item.credentialId,
      name: item.name || 'Passkey',
      transports: item.transports || [],
      deviceType: item.deviceType,
      backedUp: Boolean(item.backedUp),
      createdAt: item.createdAt,
      lastUsedAt: item.lastUsedAt
    }))
  };
};

const revokeCredential = async ({ identityId, identityType, credentialId }) => {
  const normalized = normalizeCredentialId(credentialId);
  const result = await getModel(identityType).updateOne(
    { _id: identityId, 'webAuthnCredentials.credentialId': normalized },
    { $pull: { webAuthnCredentials: { credentialId: normalized } } }
  );
  if (!result.modifiedCount) throw new NotFoundError('WebAuthn credential', normalized);
  operationalMetrics.increment('webauthn_credentials_revoked_total');
  return { revoked: true };
};

const generateRecoveryCodes = async ({ identityId, identityType, count = 10 }) => {
  const identity = await getModel(identityType).findById(identityId).select('_id');
  if (!identity) throw new AuthenticationError('Account not found');

  const codeCount = Math.min(Math.max(Number(count) || 10, 1), 20);
  const batchId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = recoveryCodeExpiry();
  const codes = Array.from({ length: codeCount }, () => formatRecoveryCode());

  await WebAuthnRecoveryCode.updateMany(
    { identityId, identityType, usedAt: null, replacedAt: null },
    { $set: { replacedAt: now } }
  );
  await WebAuthnRecoveryCode.insertMany(codes.map(code => ({
    identityId,
    identityType,
    batchId,
    codeHash: hash(code),
    expiresAt
  })));

  operationalMetrics.increment('webauthn_recovery_code_batches_created_total');
  return { batchId, codes, expiresAt };
};

const recoveryCodeStatus = async ({ identityId, identityType }) => {
  const [remaining, used] = await Promise.all([
    WebAuthnRecoveryCode.countDocuments({
      identityId,
      identityType,
      usedAt: null,
      replacedAt: null,
      expiresAt: { $gt: new Date() }
    }),
    WebAuthnRecoveryCode.countDocuments({ identityId, identityType, usedAt: { $ne: null } })
  ]);
  return { remaining, used };
};

const recoverLostDevice = async ({ identityId, identityType, recoveryCode, revokePasskeys = true }) => {
  const normalized = String(recoveryCode || '').trim().toUpperCase();
  if (!normalized) throw new ValidationError('Recovery code is required');

  const code = await WebAuthnRecoveryCode.findOneAndUpdate(
    {
      identityId,
      identityType,
      codeHash: hash(normalized),
      usedAt: null,
      replacedAt: null,
      expiresAt: { $gt: new Date() }
    },
    { $set: { usedAt: new Date() } },
    { new: true }
  );
  if (!code) throw new AuthenticationError('Recovery code is invalid or already used');

  if (revokePasskeys) {
    await getModel(identityType).updateOne(
      { _id: identityId },
      { $set: { webAuthnCredentials: [] } }
    );
    operationalMetrics.increment('webauthn_lost_device_passkey_revocations_total');
  }

  const challenge = await WebAuthnChallenge.create({
    identityId,
    identityType,
    purpose: 'PASSWORD_CHANGE',
    challenge: crypto.randomBytes(32).toString('base64url'),
    recoveryCodeId: code._id,
    verifiedAt: new Date(),
    expiresAt: challengeExpiry()
  });
  operationalMetrics.increment('webauthn_lost_device_recoveries_total');
  return { recovered: true, confirmationId: challenge._id, passkeysRevoked: Boolean(revokePasskeys) };
};

const registrationOptions = async ({ identityId, identityType }) => {
  const identity = await getModel(identityType).findById(identityId).select('+webAuthnCredentials');
  if (!identity) throw new AuthenticationError('Account not found');
  const config = getConfig();
  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpID,
    userName: identity.email,
    userDisplayName: identity.name,
    excludeCredentials: getCredentials(identity).map(item => ({
      id: item.credentialId,
      transports: item.transports
    })),
    authenticatorSelection: { userVerification: 'required' }
  });
  const record = await createChallenge({
    identityId,
    identityType,
    purpose: 'REGISTRATION',
    challenge: options.challenge
  });
  return { options, challengeId: record._id };
};

const verifyRegistration = async ({ identityId, identityType, challengeId, response, name }) => {
  const challenge = await WebAuthnChallenge.findOne({
    _id: challengeId,
    identityId,
    identityType,
    purpose: 'REGISTRATION',
    consumedAt: null,
    expiresAt: { $gt: new Date() }
  });
  if (!challenge) throw new ValidationError('WebAuthn registration challenge is invalid or expired');
  const config = getConfig();
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: config.origin,
    expectedRPID: config.rpID,
    requireUserVerification: true
  });
  if (!verification.verified || !verification.registrationInfo) {
    throw new AuthenticationError('WebAuthn registration verification failed');
  }
  const credential = verification.registrationInfo.credential;
  const result = await getModel(identityType).updateOne(
    { _id: identityId, 'webAuthnCredentials.credentialId': { $ne: credential.id } },
    {
      $push: {
        webAuthnCredentials: {
          credentialId: credential.id,
          publicKey: Buffer.from(credential.publicKey).toString('base64url'),
          counter: credential.counter,
          transports: credential.transports,
          deviceType: verification.registrationInfo.credentialDeviceType,
          backedUp: verification.registrationInfo.credentialBackedUp,
          name
        }
      }
    }
  );
  if (!result.modifiedCount) throw new ConflictError('WebAuthn credential is already enrolled', 'credentialId');
  challenge.consumedAt = new Date();
  await challenge.save();
  return { verified: true };
};

const authenticationOptions = async ({ identityId, identityType, purpose = 'PASSWORD_CHANGE' }) => {
  const identity = await getModel(identityType).findById(identityId).select('+webAuthnCredentials');
  const credentials = identity ? getCredentials(identity) : [];
  if (!credentials.length) throw new ValidationError('No WebAuthn credential is enrolled');
  const config = getConfig();
  const options = await generateAuthenticationOptions({
    rpID: config.rpID,
    userVerification: 'required',
    allowCredentials: credentials.map(item => ({ id: item.credentialId, transports: item.transports }))
  });
  const record = await createChallenge({ identityId, identityType, purpose, challenge: options.challenge });
  return { options, challengeId: record._id };
};

const verifyAuthentication = async ({ identityId, identityType, challengeId, response }) => {
  const challenge = await WebAuthnChallenge.findOne({
    _id: challengeId,
    identityId,
    identityType,
    purpose: 'PASSWORD_CHANGE',
    consumedAt: null,
    verifiedAt: null,
    expiresAt: { $gt: new Date() }
  });
  if (!challenge) throw new ValidationError('WebAuthn authentication challenge is invalid or expired');
  const identity = await getModel(identityType).findById(identityId).select('+webAuthnCredentials');
  const stored = getCredentials(identity).find(item => item.credentialId === response.id);
  if (!stored) throw new AuthenticationError('WebAuthn credential is not registered for this account');
  const config = getConfig();
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: config.origin,
    expectedRPID: config.rpID,
    credential: {
      id: stored.credentialId,
      publicKey: Buffer.from(stored.publicKey, 'base64url'),
      counter: stored.counter,
      transports: stored.transports
    },
    requireUserVerification: true
  });
  if (!verification.verified) throw new AuthenticationError('WebAuthn authentication verification failed');
  stored.counter = verification.authenticationInfo.newCounter;
  stored.lastUsedAt = new Date();
  challenge.verifiedAt = new Date();
  await Promise.all([identity.save(), challenge.save()]);
  return { verified: true, confirmationId: challenge._id };
};

const consumePasswordConfirmation = async ({ identityId, identityType, confirmationId, session }) => {
  const result = await WebAuthnChallenge.findOneAndUpdate(
    {
      _id: confirmationId,
      identityId,
      identityType,
      purpose: 'PASSWORD_CHANGE',
      verifiedAt: { $ne: null },
      consumedAt: null,
      expiresAt: { $gt: new Date() }
    },
    { consumedAt: new Date() },
    { new: true, session }
  );
  if (!result) throw new AuthenticationError('A recent WebAuthn confirmation is required');
};

module.exports = {
  listCredentials,
  revokeCredential,
  generateRecoveryCodes,
  recoveryCodeStatus,
  recoverLostDevice,
  registrationOptions,
  verifyRegistration,
  authenticationOptions,
  verifyAuthentication,
  consumePasswordConfirmation
};
