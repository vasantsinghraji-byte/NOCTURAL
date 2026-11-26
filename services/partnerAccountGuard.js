/**
 * Partner and staff identities (nurses, physios, pharmacies, riders, labs,
 * admins) belong in the Nabz Partner app and partner portals. The customer
 * app and customer website refuse an email or phone that already belongs to
 * one of those accounts, so a partner doesn't end up with a second, customer
 * account on the same identity.
 *
 * Callers run this only after the person has proved the identity (correct
 * password, Google token, phone OTP) or where the endpoint already says the
 * email is taken (sign-up), so it doesn't reveal who is a partner.
 */

const User = require('../models/user');
const { AuthorizationError } = require('../utils/errors');

const PARTNER_ACCOUNT_MESSAGE = 'This account is registered as a Nabz partner. Please sign in with the Nabz Partner app.';

const lastTenDigits = (phone) => String(phone || '').replace(/\D/g, '').slice(-10);

/** Does this email or phone belong to a partner / staff (User) account? */
async function isPartnerIdentity({ email, phone } = {}) {
  const or = [];
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (cleanEmail) or.push({ email: cleanEmail });
  const ten = lastTenDigits(phone);
  if (ten.length === 10) or.push({ phone: { $in: [ten, `91${ten}`, `+91${ten}`, `0${ten}`] } });
  if (!or.length) return false;
  return Boolean(await User.exists({ $or: or }));
}

/** Throws a 403 (code PARTNER_ACCOUNT) for partner identities. */
async function assertCustomerIdentity({ email, phone } = {}) {
  if (await isPartnerIdentity({ email, phone })) {
    const err = new AuthorizationError(PARTNER_ACCOUNT_MESSAGE);
    err.code = 'PARTNER_ACCOUNT';
    throw err;
  }
}

module.exports = { isPartnerIdentity, assertCustomerIdentity, PARTNER_ACCOUNT_MESSAGE };
