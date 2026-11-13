/**
 * Admin section guards (constants/adminAccess.js). Use after `protect`:
 *
 *   router.get('/x', protect, adminSection('payments'), handler)
 *
 * platform_admin always passes; an ops_admin passes only for sections the main
 * admin gave them. `legacyAdmin: true` also lets the older 'admin' role through
 * on routes that already allowed it. Sets req.adminKinds (partner types this
 * account may verify; null = all) for the services to filter by.
 */
const logger = require('../utils/logger');
const { hasSection, kindsFor } = require('../constants/adminAccess');

function adminSection(sections, { legacyAdmin = false } = {}) {
  const wanted = Array.isArray(sections) ? sections : [sections];
  return (req, res, next) => {
    const user = req.user;
    const ok = !!user && ((legacyAdmin && user.role === 'admin') || wanted.some((s) => hasSection(user, s)));
    if (!ok) {
      logger.logSecurity('admin_section_denied', { userId: user && String(user._id), role: user && user.role, sections: wanted, path: req.originalUrl });
      return res.status(403).json({ success: false, message: 'You don’t have access to this part of the admin panel. Ask the main admin.' });
    }
    req.adminKinds = user.role === 'admin' ? null : kindsFor(user);
    return next();
  };
}

module.exports = { adminSection };
