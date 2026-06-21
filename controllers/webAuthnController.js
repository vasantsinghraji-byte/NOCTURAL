const webAuthnService = require('../services/webAuthnService');
const securityAuditService = require('../services/securityAuditService');
const responseHelper = require('../utils/responseHelper');

const getIdentityType = req => req.userType === 'patient' ? 'patient' : 'user';
const getIdentity = req => ({ identityId: req.user.id, identityType: getIdentityType(req) });
const audit = (req, event, outcome, metadata = {}) => securityAuditService.record({
  event,
  actorId: req.user.id,
  actorType: getIdentityType(req),
  targetType: getIdentityType(req),
  targetId: req.user.id,
  outcome,
  req,
  metadata
});

exports.listCredentials = async (req, res, next) => {
  try {
    const result = await webAuthnService.listCredentials(getIdentity(req));
    responseHelper.sendSuccess(res, result, 'WebAuthn credentials loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.revokeCredential = async (req, res, next) => {
  try {
    const result = await webAuthnService.revokeCredential({
      ...getIdentity(req),
      credentialId: req.params.credentialId
    });
    await audit(req, 'webauthn_passkey_revoked', 'success', {
      credentialId: req.params.credentialId
    });
    responseHelper.sendSuccess(res, result, 'WebAuthn credential revoked');
  } catch (error) {
    await audit(req, 'webauthn_passkey_revoked', 'failure', {
      credentialId: req.params.credentialId,
      error: error.message
    });
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.registrationOptions = async (req, res, next) => {
  try {
    const result = await webAuthnService.registrationOptions(getIdentity(req));
    responseHelper.sendSuccess(res, result, 'WebAuthn registration options created');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.verifyRegistration = async (req, res, next) => {
  try {
    const result = await webAuthnService.verifyRegistration({
      ...getIdentity(req),
      challengeId: req.body.challengeId,
      response: req.body.response,
      name: req.body.name
    });
    responseHelper.sendSuccess(res, result, 'WebAuthn credential enrolled');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.passwordOptions = async (req, res, next) => {
  try {
    const result = await webAuthnService.authenticationOptions(getIdentity(req));
    responseHelper.sendSuccess(res, result, 'WebAuthn password-change options created');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.verifyPasswordConfirmation = async (req, res, next) => {
  try {
    const result = await webAuthnService.verifyAuthentication({
      ...getIdentity(req),
      challengeId: req.body.challengeId,
      response: req.body.response
    });
    responseHelper.sendSuccess(res, result, 'WebAuthn password-change confirmation verified');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.generateRecoveryCodes = async (req, res, next) => {
  try {
    const result = await webAuthnService.generateRecoveryCodes({
      ...getIdentity(req),
      count: req.body.count
    });
    await audit(req, 'webauthn_recovery_codes_generated', 'success', {
      batchId: result.batchId,
      count: result.codes.length,
      expiresAt: result.expiresAt
    });
    responseHelper.sendSuccess(res, result, 'Recovery codes generated');
  } catch (error) {
    await audit(req, 'webauthn_recovery_codes_generated', 'failure', {
      error: error.message
    });
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.recoveryCodeStatus = async (req, res, next) => {
  try {
    const result = await webAuthnService.recoveryCodeStatus(getIdentity(req));
    responseHelper.sendSuccess(res, result, 'Recovery code status loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.recoverLostDevice = async (req, res, next) => {
  try {
    const result = await webAuthnService.recoverLostDevice({
      ...getIdentity(req),
      recoveryCode: req.body.recoveryCode,
      revokePasskeys: req.body.revokePasskeys !== false
    });
    await audit(req, 'webauthn_lost_device_recovered', 'success', {
      passkeysRevoked: result.passkeysRevoked
    });
    responseHelper.sendSuccess(res, result, 'Lost-device recovery completed');
  } catch (error) {
    await audit(req, 'webauthn_lost_device_recovery_failed', 'failure', {
      error: error.message
    });
    responseHelper.handleServiceError(error, res, next);
  }
};
