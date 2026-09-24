/**
 * Forgot / reset password for customers (Patient) and staff/partners (User).
 *
 *   request(email) → always the same answer (no account enumeration); if the
 *   account exists, email a one-time link valid for 30 minutes.
 *   reset(token, password) → set the new password, sign out every session,
 *   invalidate other outstanding links. Admin two-step verification stays on.
 */

const crypto = require('crypto');
const mongoose = require('mongoose');
const Patient = require('../models/patient');
const User = require('../models/user');
const PasswordResetToken = require('../models/passwordResetToken');
const SecurityNotificationOutbox = require('../models/securityNotificationOutbox');
const refreshSessionService = require('./refreshSessionService');
const compromisedPasswordService = require('./compromisedPasswordService');
const { encodePayload } = require('./securityNotificationPayloadCrypto');
const mailer = require('./mailer');
const logger = require('../utils/logger');
const { ValidationError } = require('../utils/errors');

const TOKEN_TTL_MINUTES = 30;
const MAX_LINKS_PER_HOUR = 3;

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
const webBase = () => (process.env.WEB_APP_URL || process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');

async function findAccount(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;
  const patient = await Patient.findOne({ email: normalized }).select('name email isActive').lean();
  if (patient) return { type: 'patient', doc: patient };
  const user = await User.findOne({ email: normalized }).select('name email isActive role').lean();
  if (user) return { type: 'user', doc: user };
  return null;
}

function emailBody(name, link) {
  const first = String(name || '').split(' ')[0] || 'there';
  const text = [
    `Hi ${first},`,
    '',
    'We received a request to reset your Nabz password. Open this link to choose a new one:',
    link,
    '',
    `The link works once and expires in ${TOKEN_TTL_MINUTES} minutes.`,
    'If you did not ask for this, ignore this email; your password stays the same.',
    '',
    'Nabz'
  ].join('\n');
  const html = `<!doctype html><html><body style="margin:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;color:#0a0f24">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:20px;padding:32px">
    <tr><td style="font-size:22px;font-weight:800;letter-spacing:-0.5px">nabz</td></tr>
    <tr><td style="padding-top:20px;font-size:16px;line-height:24px">Hi ${first.replace(/[<>&"]/g, '')},<br><br>
      We received a request to reset your Nabz password.</td></tr>
    <tr><td style="padding:24px 0"><a href="${link}" style="display:inline-block;background:#0a0f24;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:14px">Choose a new password</a></td></tr>
    <tr><td style="font-size:13px;line-height:20px;color:#7a8299">The link works once and expires in ${TOKEN_TTL_MINUTES} minutes.
      If you did not ask for this, ignore this email; your password stays the same.</td></tr>
  </table></td></tr></table></body></html>`;
  return { text, html };
}

/** Always resolves the same way whether or not the account exists. */
async function request(email, { ip } = {}) {
  const account = await findAccount(email);
  if (!account || account.doc.isActive === false) {
    logger.logSecurity('password_reset_requested_unknown', { ip });
    return;
  }
  const recent = await PasswordResetToken.countDocuments({
    account: account.doc._id,
    createdAt: { $gte: new Date(Date.now() - 3600 * 1000) }
  });
  if (recent >= MAX_LINKS_PER_HOUR) {
    logger.logSecurity('password_reset_throttled', { accountId: String(account.doc._id) });
    return;
  }
  const token = crypto.randomBytes(32).toString('base64url');
  await PasswordResetToken.create({
    accountType: account.type,
    account: account.doc._id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000),
    requestIp: ip
  });
  const link = `${webBase()}/reset-password?token=${encodeURIComponent(token)}`;
  const { text, html } = emailBody(account.doc.name, link);
  try {
    await mailer.sendMail({ to: account.doc.email, subject: 'Reset your Nabz password', text, html });
  } catch (error) {
    // Don't reveal delivery problems to the requester; ops see it in logs.
    logger.error('Password reset email failed', { accountId: String(account.doc._id), error: error.message });
  }
  logger.logSecurity('password_reset_requested', { accountId: String(account.doc._id), accountType: account.type });
}

async function reset(token, password, { ip } = {}) {
  const tokenHash = hashToken(token);
  // Single use: claim the token atomically before touching the password.
  const claimed = await PasswordResetToken.findOneAndUpdate(
    { tokenHash, usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    { new: true }
  );
  if (!claimed) throw new ValidationError('This reset link is invalid or has expired. Request a new one.');

  await compromisedPasswordService.assertPasswordNotCompromised(password);

  const Model = claimed.accountType === 'patient' ? Patient : User;
  const identity = await Model.findById(claimed.account).select('+password +sessionVersion');
  if (!identity || identity.isActive === false) throw new ValidationError('This reset link is invalid or has expired. Request a new one.');

  identity.password = password;
  identity.sessionVersion = (Number(identity.sessionVersion) || 0) + 1; // signs out every device
  await identity.save();

  const userType = claimed.accountType === 'patient' ? 'patient' : 'user';
  await refreshSessionService.revokeAllForUser({ userId: identity._id, userType, reason: 'PASSWORD_RESET' });
  await PasswordResetToken.updateMany({ account: identity._id, usedAt: null }, { $set: { usedAt: new Date() } });

  if (mongoose.connection.readyState === 1) {
    await SecurityNotificationOutbox.create({
      identityId: identity._id,
      identityType: userType,
      event: 'PASSWORD_CHANGED',
      payloadEncrypted: encodePayload({
        identityId: identity._id,
        identityType: userType,
        email: identity.email,
        name: identity.name,
        changedAt: new Date(),
        via: 'password_reset',
        ip
      })
    }).catch((error) => logger.error('Password change notification not queued', { error: error.message }));
  }
  logger.logSecurity('password_reset_completed', { accountId: String(identity._id), accountType: claimed.accountType });
  return { accountType: claimed.accountType, role: claimed.accountType === 'user' ? identity.role : 'patient' };
}

/** Lets the reset page say "link expired" before the user types a password. */
async function check(token) {
  const doc = await PasswordResetToken.findOne({ tokenHash: hashToken(token), usedAt: null, expiresAt: { $gt: new Date() } })
    .select('expiresAt').lean();
  return { valid: !!doc, expiresAt: doc ? doc.expiresAt : null };
}

module.exports = { request, reset, check, TOKEN_TTL_MINUTES };
