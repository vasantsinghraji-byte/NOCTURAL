/**
 * Admin two-step login.
 *
 *   password OK ──► challenge (5-min signed token, no session yet)
 *        │
 *        ├─ not enrolled: enroll/start (QR) ──► enroll/verify (first code) ──► recovery codes + session
 *        └─ enrolled:     verify (authenticator code or one-time recovery code) ──► session
 *
 * Sessions of admin roles carry `mfa: true` + `authTime`; middleware/auth.js
 * rejects admin tokens without them, ends admin sessions after
 * ADMIN_SESSION_MAX_HOURS and asks for a fresh code (step-up) before sensitive actions.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const totp = require('../utils/totp');
const { encrypt, decrypt } = require('../utils/encryptionV2');
const { generateAccessToken, generateRefreshToken, IDENTITY_TYPES } = require('../utils/authTokens');
const { AuthenticationError, ConflictError, ValidationError } = require('../utils/errors');
const logger = require('../utils/logger');

const ADMIN_ROLES = Object.freeze(['platform_admin', 'admin']);
const CHALLENGE_AUDIENCE = 'nabz:admin-mfa';
const CHALLENGE_TTL = '5m';
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const RECOVERY_CODE_COUNT = 10;
const PENDING_REUSE_MS = 15 * 60 * 1000;
const SECRET_FIELDS = '+adminMfa.totpSecret +adminMfa.pendingSecret +adminMfa.pendingCreatedAt +adminMfa.lastUsedStep +adminMfa.recoveryCodes +adminMfa.failedAttempts +adminMfa.lockUntil +sessionVersion';

const isAdminRole = (role) => ADMIN_ROLES.includes(role);

/** On by default everywhere except the unit/integration test runner (which opts in explicitly). */
function isRequired() {
  if (process.env.ADMIN_MFA_REQUIRED === 'false') return false;
  if (process.env.NODE_ENV === 'test') return process.env.ADMIN_MFA_REQUIRED === 'true';
  return true;
}

const sessionMaxSeconds = () => Math.max(1, Number(process.env.ADMIN_SESSION_MAX_HOURS) || 8) * 3600;
const stepUpSeconds = () => Math.max(1, Number(process.env.ADMIN_STEP_UP_MINUTES) || 15) * 60;
const nowSeconds = () => Math.floor(Date.now() / 1000);

const secretKey = () => process.env.JWT_SECRET;

function hashRecoveryCode(code) {
  const normalized = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return crypto.createHmac('sha256', secretKey()).update(`admin-recovery:${normalized}`).digest('hex');
}

function newRecoveryCodes() {
  // 10 chars from an unambiguous alphabet, shown as XXXXX-XXXXX.
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const chars = Array.from({ length: 10 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}

/** After the password check: a short-lived challenge instead of a session. */
async function createChallenge(userId) {
  const user = await User.findById(userId).select('+sessionVersion adminMfa.enabledAt role');
  if (!user || !isAdminRole(user.role)) throw new AuthenticationError('Not an admin account');
  const mfaToken = jwt.sign(
    { sub: String(user._id), sv: Number(user.sessionVersion) || 0, purpose: 'admin-mfa' },
    secretKey(),
    { audience: CHALLENGE_AUDIENCE, expiresIn: CHALLENGE_TTL, algorithm: 'HS256' }
  );
  return { mfaRequired: true, mfaToken, enrolled: !!(user.adminMfa && user.adminMfa.enabledAt) };
}

async function readChallenge(mfaToken) {
  let decoded;
  try {
    decoded = jwt.verify(String(mfaToken || ''), secretKey(), { audience: CHALLENGE_AUDIENCE, algorithms: ['HS256'] });
  } catch {
    throw new AuthenticationError('Sign-in step expired. Enter your email and password again.');
  }
  if (decoded.purpose !== 'admin-mfa') throw new AuthenticationError('Invalid sign-in step');
  const user = await User.findById(decoded.sub).select(SECRET_FIELDS);
  if (!user || user.isActive === false || !isAdminRole(user.role) || (Number(user.sessionVersion) || 0) !== decoded.sv) {
    throw new AuthenticationError('Sign-in step is no longer valid. Sign in again.');
  }
  return user;
}

function assertNotLocked(user) {
  const until = user.adminMfa && user.adminMfa.lockUntil;
  if (until && until.getTime() > Date.now()) {
    const mins = Math.ceil((until.getTime() - Date.now()) / 60000);
    throw new AuthenticationError(`Too many wrong codes. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
  }
}

async function recordFailure(user, reason) {
  const attempts = ((user.adminMfa && user.adminMfa.failedAttempts) || 0) + 1;
  const update = attempts >= MAX_FAILED
    ? { $set: { 'adminMfa.failedAttempts': 0, 'adminMfa.lockUntil': new Date(Date.now() + LOCK_MINUTES * 60000) } }
    : { $set: { 'adminMfa.failedAttempts': attempts } };
  await User.updateOne({ _id: user._id }, update);
  logger.logSecurity(attempts >= MAX_FAILED ? 'admin_mfa_locked' : 'admin_mfa_failed', { userId: String(user._id), reason });
}

/** Issue an admin session that proves the second factor. */
function issueSession(user) {
  const auth = { mfa: true, authTime: nowSeconds() };
  return {
    token: generateAccessToken(user._id, IDENTITY_TYPES.USER, user.sessionVersion, auth),
    refreshToken: generateRefreshToken(user._id, IDENTITY_TYPES.USER, user.sessionVersion, auth),
    user: publicUser(user)
  };
}

function publicUser(user) {
  return { _id: user._id, id: String(user._id), name: user.name, email: user.email, role: user.role };
}

async function startEnrollment(mfaToken) {
  const user = await readChallenge(mfaToken);
  assertNotLocked(user);
  if (user.adminMfa && user.adminMfa.enabledAt) throw new ConflictError('Two-step verification is already set up');
  // Reloading the setup page must not silently replace a QR code the admin already
  // scanned, so a recent pending secret is reused instead of generating a new one.
  const m = user.adminMfa || {};
  const recent = m.pendingSecret && m.pendingCreatedAt && Date.now() - new Date(m.pendingCreatedAt).getTime() < PENDING_REUSE_MS;
  let secret = recent ? decrypt(m.pendingSecret) : null;
  if (!secret) {
    secret = totp.generateSecret();
    await User.updateOne({ _id: user._id }, { $set: { 'adminMfa.pendingSecret': encrypt(secret), 'adminMfa.pendingCreatedAt': new Date() } });
  }
  logger.logSecurity('admin_mfa_enroll_started', { userId: String(user._id), reused: !!recent });
  return { secret, otpauthUri: totp.otpauthUri({ secret, account: user.email }) };
}

async function completeEnrollment(mfaToken, code) {
  const user = await readChallenge(mfaToken);
  assertNotLocked(user);
  if (user.adminMfa && user.adminMfa.enabledAt) throw new ConflictError('Two-step verification is already set up');
  const pending = user.adminMfa && user.adminMfa.pendingSecret ? decrypt(user.adminMfa.pendingSecret) : null;
  if (!pending) throw new ValidationError('Start setup again: scan the QR code first.');
  const step = totp.verify(pending, code);
  if (step === null) {
    await recordFailure(user, 'enroll_wrong_code');
    throw new AuthenticationError('That code is not right. Use the newest "Nabz Admin" entry in your authenticator app (delete older ones) and make sure your phone’s time is set automatically.');
  }
  const codes = newRecoveryCodes();
  await User.updateOne({ _id: user._id }, {
    $set: {
      'adminMfa.totpSecret': encrypt(pending),
      'adminMfa.enabledAt': new Date(),
      'adminMfa.lastUsedStep': step,
      'adminMfa.recoveryCodes': codes.map((c) => ({ hash: hashRecoveryCode(c) })),
      'adminMfa.failedAttempts': 0
    },
    $unset: { 'adminMfa.pendingSecret': 1, 'adminMfa.pendingCreatedAt': 1, 'adminMfa.lockUntil': 1 }
  });
  logger.logSecurity('admin_mfa_enrolled', { userId: String(user._id) });
  return { session: issueSession(user), recoveryCodes: codes };
}

/** Check an authenticator code (with replay protection) or a one-time recovery code. */
async function checkFactor(user, { code, recoveryCode }) {
  if (recoveryCode) {
    const hash = hashRecoveryCode(recoveryCode);
    // Compare-and-set: a recovery code can be used exactly once, even in parallel.
    const res = await User.updateOne(
      { _id: user._id, 'adminMfa.recoveryCodes': { $elemMatch: { hash, usedAt: null } } },
      { $set: { 'adminMfa.recoveryCodes.$.usedAt': new Date() } }
    );
    if (res.modifiedCount === 1) {
      logger.logSecurity('admin_mfa_recovery_code_used', { userId: String(user._id) });
      return true;
    }
    return false;
  }
  const secret = user.adminMfa && user.adminMfa.totpSecret ? decrypt(user.adminMfa.totpSecret) : null;
  const last = user.adminMfa && Number.isFinite(user.adminMfa.lastUsedStep) ? user.adminMfa.lastUsedStep : -1;
  const step = totp.verify(secret, code, { afterStep: last });
  if (step === null) return false;
  // Only the first use of a step wins (blocks replaying a code seen over the shoulder).
  const res = await User.updateOne(
    { _id: user._id, $or: [{ 'adminMfa.lastUsedStep': { $exists: false } }, { 'adminMfa.lastUsedStep': { $lt: step } }] },
    { $set: { 'adminMfa.lastUsedStep': step } }
  );
  return res.modifiedCount === 1;
}

async function verifyChallenge(mfaToken, factor) {
  const user = await readChallenge(mfaToken);
  assertNotLocked(user);
  if (!user.adminMfa || !user.adminMfa.enabledAt) throw new ValidationError('Set up two-step verification first.');
  if (!(await checkFactor(user, factor))) {
    await recordFailure(user, factor.recoveryCode ? 'wrong_recovery_code' : 'wrong_code');
    throw new AuthenticationError('That code is not right.');
  }
  await User.updateOne({ _id: user._id }, { $set: { 'adminMfa.failedAttempts': 0, lastActive: new Date() }, $unset: { 'adminMfa.lockUntil': 1 } });
  logger.logSecurity('admin_signed_in', { userId: String(user._id), method: factor.recoveryCode ? 'recovery_code' : 'totp' });
  const remaining = factor.recoveryCode
    ? ((await User.findById(user._id).select('+adminMfa.recoveryCodes').lean()).adminMfa.recoveryCodes || []).filter((c) => !c.usedAt).length
    : undefined;
  return { session: issueSession(user), recoveryCodesLeft: remaining };
}

/** Signed-in admin re-confirms with a fresh code before a sensitive action. */
async function stepUp(userId, code) {
  const user = await User.findById(userId).select(SECRET_FIELDS);
  if (!user || !isAdminRole(user.role)) throw new AuthenticationError('Not an admin session');
  assertNotLocked(user);
  if (!(await checkFactor(user, { code }))) {
    await recordFailure(user, 'step_up_wrong_code');
    throw new AuthenticationError('That code is not right.');
  }
  await User.updateOne({ _id: user._id }, { $set: { 'adminMfa.failedAttempts': 0 } });
  logger.logSecurity('admin_step_up', { userId: String(user._id) });
  return issueSession(user);
}

async function regenerateRecoveryCodes(userId, code) {
  const user = await User.findById(userId).select(SECRET_FIELDS);
  if (!user || !isAdminRole(user.role)) throw new AuthenticationError('Not an admin session');
  assertNotLocked(user);
  if (!(await checkFactor(user, { code }))) {
    await recordFailure(user, 'regenerate_wrong_code');
    throw new AuthenticationError('That code is not right.');
  }
  const codes = newRecoveryCodes();
  await User.updateOne({ _id: user._id }, { $set: { 'adminMfa.recoveryCodes': codes.map((c) => ({ hash: hashRecoveryCode(c) })), 'adminMfa.failedAttempts': 0 } });
  logger.logSecurity('admin_mfa_recovery_codes_regenerated', { userId: String(user._id) });
  return codes;
}

async function status(userId) {
  const user = await User.findById(userId).select('+adminMfa.recoveryCodes role adminMfa.enabledAt').lean();
  const codes = (user && user.adminMfa && user.adminMfa.recoveryCodes) || [];
  return {
    enrolled: !!(user && user.adminMfa && user.adminMfa.enabledAt),
    enabledAt: (user && user.adminMfa && user.adminMfa.enabledAt) || null,
    recoveryCodesLeft: codes.filter((c) => !c.usedAt).length
  };
}

/**
 * Checks an admin's decoded access token. Returns null when fine, else a reason.
 * Used by middleware/auth.js and middleware/patientAuth.js.
 */
function sessionProblem(role, decoded) {
  if (!isRequired() || !isAdminRole(role)) return null;
  if (decoded.mfa !== true || !decoded.authTime) return 'mfa_required';
  if (nowSeconds() - decoded.authTime > sessionMaxSeconds()) return 'session_expired';
  return null;
}

module.exports = {
  ADMIN_ROLES,
  isAdminRole,
  isRequired,
  sessionMaxSeconds,
  stepUpSeconds,
  createChallenge,
  startEnrollment,
  completeEnrollment,
  verifyChallenge,
  stepUp,
  regenerateRecoveryCodes,
  status,
  sessionProblem,
  hashRecoveryCode
};
