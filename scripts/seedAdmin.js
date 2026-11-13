require('dotenv').config();

/**
 * Seed / upsert a platform admin account (LOCAL DEV).
 *
 * Credentials come only from env (never hardcoded, so they can't leak via git):
 *   ADMIN_EMAIL, ADMIN_PASSWORD (min 12 chars, upper + lower + digit + symbol), ADMIN_NAME
 * The admin then sets up two-step verification (authenticator app) at first sign-in.
 * Put them in your local .env (git-ignored). Refuses to run with
 * NODE_ENV=production unless ALLOW_ADMIN_SEED=true.
 *
 * Run: node scripts/seedAdmin.js
 */

const mongoose = require('mongoose');
const User = require('../models/user');

const EMAIL = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const PASSWORD = process.env.ADMIN_PASSWORD || '';
const NAME = process.env.ADMIN_NAME || 'Platform Admin';
const STRONG = PASSWORD.length >= 12 && /[a-z]/.test(PASSWORD) && /[A-Z]/.test(PASSWORD) && /\d/.test(PASSWORD) && /[^A-Za-z0-9]/.test(PASSWORD);
if (!EMAIL || !STRONG) {
  console.error('❌ Set ADMIN_EMAIL and a strong ADMIN_PASSWORD (12+ chars with upper, lower, digit and symbol) in your local .env');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_ADMIN_SEED !== 'true') {
  console.error('❌ Refusing to seed an admin in production (set ALLOW_ADMIN_SEED=true to override deliberately)');
  process.exit(1);
}
// platform_admin is cross-tenant and needs no hospitalId (unlike 'admin').
const ROLE = 'platform_admin';

async function seed() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI is not set (run: npm run setup:env)');
    process.exit(1);
  }
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    let user = await User.findOne({ email: EMAIL }).select('+password');
    if (user) {
      user.name = NAME;
      user.role = ROLE;
      user.password = PASSWORD; // re-hashed by the User pre-save hook
      user.isActive = true;
      user.isVerified = true;
      await user.save();
      console.log(`🔁 Updated existing admin: ${EMAIL}`);
    } else {
      user = await User.create({
        name: NAME,
        email: EMAIL,
        password: PASSWORD,
        role: ROLE,
        isActive: true,
        isVerified: true
      });
      console.log(`✅ Created admin: ${EMAIL}`);
    }

    console.log('\n👤 Admin login (local dev):');
    console.log(`   Email:    ${EMAIL}`);
    console.log('   Password: (from ADMIN_PASSWORD in your .env; never printed)');
    console.log(`   Role:     ${ROLE}`);
    console.log('\n⚠️  Change this password before deploying anywhere public.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding admin:', error);
    process.exit(1);
  }
}

seed();
