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
 *   access      new members are admin team members (role ops_admin) with the
 *               admin sections and partner types the main admin picks
 *               (constants/adminAccess.js); older onboarding reviewers keep
 *               applications + documents for every partner type
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
const { ADMIN_SECTIONS, VERIFY_KINDS, accessSummary, sanitizeAccess } = require('../constants/adminAccess');

const ROLE = 'ops_admin';
// Team accounts this service manages (older onboarding reviewers included).
const TEAM_ROLES = ['ops_admin', 'onboarding_reviewer'];

function cleanAccess(access) {
  const clean = sanitizeAccess(access || {});
  if (!clean.sections.length) throw new ValidationError('Give at least one section of the admin panel');
  const verifies = clean.sections.some((s) => ['partners', 'documents', 'verification'].includes(s));
  if (verifies && !clean.partnerKinds.length) throw new ValidationError('Choose which partner types they can verify');
  return clean;
}
// Dots are excluded from the domain labels so the pattern can't backtrack polynomially.
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@.]{1,63}(?:\.[^\s@.]{1,63}){1,8}$/;

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
  role: u.role,
  access: accessSummary(u),
  isActive: u.isActive !== false,
  mfaEnrolled: !!(u.adminMfa && u.adminMfa.enabledAt),
  createdAt: u.createdAt,
  lastActive: u.lastActive || null
});

async function list() {
  const rows = await User.find({ role: { $in: TEAM_ROLES } }).sort({ createdAt: -1 }).select('name email role adminAccess isActive adminMfa.enabledAt createdAt lastActive').lean();
  return {
    reviewers: rows.map(publicReviewer),
    allowedDomains: allowedDomains(),
    // What the main admin can hand out (the panel's checklists).
    sections: ADMIN_SECTIONS,
    partnerKinds: VERIFY_KINDS.map(({ key, label }) => ({ key, label }))
  };
}

/** A platform admin adds a reviewer. Returns the invite outcome (link only off production without SMTP). */
async function create(admin, { name, email, access } = {}, req) {
  const cleanName = String(name || '').trim().slice(0, 80);
  const loginId = String(email || '').trim().toLowerCase();
  if (cleanName.length < 2) throw new ValidationError('Enter the team member’s full name');
  if (!EMAIL_RE.test(loginId)) throw new ValidationError('Enter a valid email as the login ID');
  if (!isAllowedLoginId(loginId)) {
    throw new ValidationError(`Login IDs must be on ${allowedDomains().map((d) => `@${d}`).join(' or ')}`);
  }
  if (await User.exists({ email: loginId })) throw new ConflictError('An account with this email already exists');
  const adminAccess = cleanAccess(access);

  const user = await User.create({
    name: cleanName,
    email: loginId,
    role: ROLE,
    adminAccess: { ...adminAccess, updatedAt: new Date(), updatedBy: admin._id },
    // Unusable until the reviewer sets their own through the invite link.
    password: `${require('crypto').randomBytes(24).toString('base64url')}Aa1!`,
    isVerified: true
  });
  const invite = await passwordResetService.invite(user, { team: true });
  await securityAuditService.record({
    event: 'admin_onboarding_reviewer_created', actorId: admin._id, actorType: 'user', targetType: 'user', targetId: user._id, req,
    metadata: { email: loginId, inviteEmailed: invite.sent, access: adminAccess }
  });
  logger.info('Admin team member created', { userId: String(user._id), by: String(admin._id) });
  return { reviewer: publicReviewer(user.toObject()), invite };
}

/** Suspend or restore a reviewer. Suspending ends their sessions at once. */
async function setActive(admin, id, active, req) {
  const user = await User.findOne({ _id: id, role: { $in: TEAM_ROLES } }).select('_id isActive').lean();
  if (!user) throw new NotFoundError('Team member');
  await User.updateOne({ _id: id, role: { $in: TEAM_ROLES } }, active
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
  const user = await User.findOne({ _id: id, role: { $in: TEAM_ROLES }, isActive: { $ne: false } }).select('_id name email').lean();
  if (!user) throw new NotFoundError('Active reviewer');
  if (!isAllowedLoginId(user.email)) throw new ValidationError('This login ID is not on an allowed domain. Create a new reviewer on the Nabz domain.');
  const invite = await passwordResetService.invite(user, { team: true });
  await securityAuditService.record({
    event: 'admin_onboarding_reviewer_invite_resent', actorId: admin._id, actorType: 'user', targetType: 'user', targetId: id, req,
    metadata: { inviteEmailed: invite.sent }
  });
  return { invite };
}

/**
 * Change what a team member can open. An older onboarding reviewer becomes an
 * admin team member with exactly this access. Takes effect on their next request.
 */
async function setAccess(admin, id, access, req) {
  const adminAccess = cleanAccess(access);
  const user = await User.findOneAndUpdate(
    { _id: id, role: { $in: TEAM_ROLES } },
    { $set: { role: ROLE, adminAccess: { ...adminAccess, updatedAt: new Date(), updatedBy: admin._id } } },
    { new: true }
  ).select('name email role adminAccess isActive adminMfa.enabledAt createdAt lastActive').lean();
  if (!user) throw new NotFoundError('Team member');
  await securityAuditService.record({
    event: 'admin_team_access_changed', actorId: admin._id, actorType: 'user', targetType: 'user', targetId: id, req, metadata: { access: adminAccess }
  });
  return { reviewer: publicReviewer(user) };
}

module.exports = { ROLE, TEAM_ROLES, allowedDomains, isAllowedLoginId, list, create, setActive, setAccess, resendInvite };
