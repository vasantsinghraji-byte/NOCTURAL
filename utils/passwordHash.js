/**
 * Password hashing that doesn't freeze the server.
 *
 * bcryptjs (pure JavaScript) hashes on the one main thread: a load test of 200
 * simultaneous sign-ins took ~26 s each and stalled every other request for up
 * to 20 s. @node-rs/bcrypt runs the same bcrypt on background threads. Hashes
 * are the standard $2a$/$2b$ format, so existing passwords keep working both
 * ways. If the native module can't load on some platform, we fall back to
 * bcryptjs rather than break sign-in.
 */

const logger = require('./logger');

const ROUNDS = 10;
let impl;

function load() {
  if (impl) return impl;
  try {
    const native = require('@node-rs/bcrypt');
    impl = { name: 'native', hash: (p) => native.hash(p, ROUNDS), compare: (p, h) => native.compare(p, h) };
  } catch (err) {
    logger.warn('Native bcrypt unavailable, using bcryptjs (slower under load)', { error: err.message });
    const js = require('bcryptjs');
    impl = { name: 'js', hash: (p) => js.hash(p, ROUNDS), compare: (p, h) => js.compare(p, h) };
  }
  return impl;
}

/** Hash a new password. */
const hashPassword = (plain) => load().hash(String(plain));

/** Check a password against a stored hash. False for a missing or malformed hash. */
async function comparePassword(plain, hash) {
  if (typeof hash !== 'string' || !/^\$2[aby]\$\d{2}\$/.test(hash)) return false;
  return load().compare(String(plain), hash);
}

module.exports = { hashPassword, comparePassword, implementation: () => load().name };
