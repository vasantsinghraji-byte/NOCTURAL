/**
 * Onboarding team: the people who review partner applications and documents
 * in the onboarding panel (website /onboarding), separate from full admins.
 *
 *   create      a platform admin assigns the login ID (email); the reviewer
 *               sets their own password through a one-time link
 *   sign-in     password, then a code from an authenticator app (enrolled at
 *               first sign-in): the role is in adminMfaService.ADMIN_ROLES
 *   domains     ONBOARDING_LOGIN_DOMAINS (comma list, e.g. "nabz.in") limits
 *               login IDs to Nabz addresses, both when creating an account and
 *               at every sign-in. Unset = any domain (until the domain exists).
 *   access      applications and partner documents only (routes/onboarding.js)
 *
 * WARNING (security): the admin never chooses the reviewer's password. An
 * admin-set password is known to the admin, who could then enrol their own
 * authenticator on that account and act as the reviewer, so the audit trail
 * could no longer say who approved a partner. Keep the one-time link.
 */

const User = require('../models/user');
const passwordResetService = require('./passwordResetService');
const securityAuditService = require('./securityAuditService');
const { ValidationError, NotFoundError, ConflictError } = require('../utils/errors');
const logger = require('../utils/logger');

const ROLE = 'onboarding_reviewer';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Allowed login-ID domains, lower-case; empty = any. */
function allowedDomains() {
  return String(process.env.ONBOARDING_LOGIN_DOMAINS || '')
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
}

/** Is this login ID on an allowed domain? (Exact domain match, no subdomains.) */
function isAllowedLoginId(email) {
  const domains = allowedDomains();
  if (!domains.length) return true;
  const domain = String(email || '').trim().toLowerCase().split('@')[1] || '';
  return domains.includes(domain);
}

const publicReviewer = (u) => ({
  _id: String(u._id),
  name: u.name,
  email: u.email,
  isActive: u.isActive !== false,
  mfaEnrolled: !!(u.adminMfa && u.adminMfa.enabledAt),
  createdAt: u.createdAt,
  lastActive: u.lastActive || null
});

async function list() {
  const rows = await User.find({ role: ROLE }).sort({ createdAt: -1 }).select('name email isActive adminMfa.enabledAt createdAt lastActive').lean();
  return { reviewers: rows.map(publicReviewer), allowedDomains: allowedDomains() };
}

/** A platform admin adds a reviewer. Returns the invite outcome (link only off production without SMTP). */
async function create(admin, { name, email } = {}, req) {
  const cleanName = String(name || '').trim().slice(0, 80);
  const loginId = String(email || '').trim().toLowerCase();
  if (cleanName.length < 2) throw new ValidationError('Enter the reviewer’s full name');
  if (!EMAIL_RE.test(loginId)) throw new ValidationError('Enter a valid email as the login ID');
  if (!isAllowedLoginId(loginId)) {
    throw new ValidationError(`Login IDs must be on ${allowedDomains().map((d) => `@${d}`).join(' or ')}`);
  }
  if (await User.exists({ email: loginId })) throw new ConflictError('An account with this email already exists');

  const user = await User.create({
    name: cleanName,
    email: loginId,
    role: ROLE,
    // Unusable until the reviewer sets their own through the invite link.
    password: `${require('crypto').randomBytes(24).toString('base64url')}Aa1!`,
    isVerified: true
  });
  const invite = await passwordResetService.invite(user, { team: true });
  await securityAuditService.record({
    event: 'admin_onboarding_reviewer_created', actorId: admin._id, actorType: 'user', targetType: 'user', targetId: user._id, req,
    metadata: { email: loginId, inviteEmailed: invite.sent }
  });
  logger.info('Onboarding reviewer created', { userId: String(user._id), by: String(admin._id) });
  return { reviewer: publicReviewer(user.toObject()), invite };
}

/** Suspend or restore a reviewer. Suspending ends their sessions at once. */
async function setActive(admin, id, active, req) {
  const user = await User.findOne({ _id: id, role: ROLE }).select('_id isActive').lean();
  if (!user) throw new NotFoundError('Reviewer');
  await User.updateOne({ _id: id, role: ROLE }, active
    ? { $set: { isActive: true } }
    : { $set: { isActive: false }, $inc: { sessionVersion: 1 } });
  await securityAuditService.record({
    event: active ? 'admin_onboarding_reviewer_restored' : 'admin_onboarding_reviewer_suspended',
    actorId: admin._id, actorType: 'user', targetType: 'user', targetId: id, req, metadata: {}
  });
  return { active: !!active };
}

/** Send a fresh set-password link (forgotten password, or the first one expired). */
async function resendInvite(admin, id, req) {
  const user = await User.findOne({ _id: id, role: ROLE, isActive: { $ne: false } }).select('_id name email').lean();
  if (!user) throw new NotFoundError('Active reviewer');
  if (!isAllowedLoginId(user.email)) throw new ValidationError('This login ID is not on an allowed domain. Create a new reviewer on the Nabz domain.');
  const invite = await passwordResetService.invite(user, { team: true });
  await securityAuditService.record({
    event: 'admin_onboarding_reviewer_invite_resent', actorId: admin._id, actorType: 'user', targetType: 'user', targetId: id, req,
    metadata: { inviteEmailed: invite.sent }
  });
  return { invite };
}

module.exports = { ROLE, allowedDomains, isAllowedLoginId, list, create, setActive, resendInvite };
