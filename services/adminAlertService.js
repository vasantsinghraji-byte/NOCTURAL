/**
 * Security alerts for the main admins (platform_admin).
 *
 * Anything that changes who can get into the admin panel is reported: a new
 * authenticator, a backup code used, new backup codes, a lockout after wrong
 * codes, an authenticator reset, team members added / changed / suspended.
 * Each main admin gets an in-app alert (shown on Team & access) and, where
 * email is set up, an email. Never throws: an alert must not block the action.
 */

const User = require('../models/user');
const Notification = require('../models/notification');
const mailer = require('./mailer');
const logger = require('../utils/logger');

const who = (u) => (u ? `${u.name || 'An admin'} (${u.email || String(u._id)})` : 'An admin');

async function alertMainAdmins(event, { title, message }) {
  try {
    const admins = await User.find({ role: 'platform_admin', isActive: { $ne: false } }).select('_id name email').lean();
    if (!admins.length) return 0;
    await Notification.insertMany(admins.map((a) => ({
      user: a._id, recipientModel: 'User', type: 'ADMIN_SECURITY', title: String(title).slice(0, 120), message: String(message).slice(0, 500),
      priority: 'HIGH', actionUrl: '/admin?tab=team', actionLabel: 'Review team'
    })));
    await Promise.all(admins.filter((a) => a.email).map((a) => mailer.sendMail({
      to: a.email,
      subject: `Nabz admin security: ${title}`,
      text: `${message}\n\nIf you didn't expect this, open Team & access in the Nabz admin panel and suspend the account.`
    }).catch(() => undefined)));
    logger.logSecurity('admin_alert_sent', { event, recipients: admins.length });
    return admins.length;
  } catch (err) {
    logger.error('Admin security alert failed', { event, error: err.message });
    return 0;
  }
}

/** Shorthand for an event about one admin account. */
async function aboutAccount(event, userOrId, title, detail) {
  let user;
  try {
    user = userOrId && userOrId.email ? userOrId : await User.findById(userOrId).select('name email').lean();
  } catch {
    user = null; // still alert, just without the name
  }
  return alertMainAdmins(event, { title, message: `${who(user)}: ${detail}` });
}

/** The newest alerts for one main admin (Team & access). */
async function recentFor(adminId, limit = 30) {
  return Notification.find({ user: adminId, type: 'ADMIN_SECURITY' }).sort({ createdAt: -1 }).limit(limit).select('title message createdAt read').lean();
}

module.exports = { alertMainAdmins, aboutAccount, recentFor };
