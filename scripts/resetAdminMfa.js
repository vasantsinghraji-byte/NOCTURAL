require('dotenv').config();

/**
 * Reset an admin's two-step verification (lost phone AND lost recovery codes).
 * Clears the authenticator secret and recovery codes and signs out every
 * session, so the admin sets it up again at the next sign-in.
 *
 * Deliberately manual: verify the person's identity out of band first.
 *   RESET_ADMIN_EMAIL=ops@example.com CONFIRM_RESET=yes node scripts/resetAdminMfa.js
 * On AWS: run as a one-off ECS task with those env overrides (see docs/MEDRUSH_AWS_DEPLOYMENT.md §5).
 */

const mongoose = require('mongoose');
const User = require('../models/user');
const { isAdminRole } = require('../services/adminMfaService');

async function main() {
  const email = String(process.env.RESET_ADMIN_EMAIL || '').trim().toLowerCase();
  if (!email || process.env.CONFIRM_RESET !== 'yes') {
    console.error('Usage: RESET_ADMIN_EMAIL=<email> CONFIRM_RESET=yes node scripts/resetAdminMfa.js');
    process.exit(1);
  }
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  const user = await User.findOne({ email }).select('role');
  if (!user || !isAdminRole(user.role)) {
    console.error('No admin account with that email');
    await mongoose.disconnect();
    process.exit(1);
  }
  await User.updateOne({ _id: user._id }, {
    $unset: {
      'adminMfa.totpSecret': 1, 'adminMfa.pendingSecret': 1, 'adminMfa.pendingCreatedAt': 1, 'adminMfa.enabledAt': 1,
      'adminMfa.lastUsedStep': 1, 'adminMfa.recoveryCodes': 1, 'adminMfa.lockUntil': 1
    },
    $set: { 'adminMfa.failedAttempts': 0 },
    $inc: { sessionVersion: 1 } // sign out everywhere
  });
  console.log('Two-step verification reset. All sessions signed out. The admin sets it up again at next sign-in.');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Reset failed:', err.message);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
