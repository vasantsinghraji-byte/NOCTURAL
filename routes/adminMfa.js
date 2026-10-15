/**
 * Admin two-step login (rate-limited in app.js like /auth/login).
 *   POST /auth/admin-mfa/enroll/start    { mfaToken }                  → { secret, otpauthUri }
 *   POST /auth/admin-mfa/enroll/verify   { mfaToken, code }            → session + recoveryCodes (shown once)
 *   POST /auth/admin-mfa/verify          { mfaToken, code | recoveryCode } → session
 *   POST /auth/admin-mfa/step-up         { code }  (signed-in admin)   → fresh session for sensitive actions
 *   POST /auth/admin-mfa/recovery-codes  { code }  (signed-in admin)   → new recovery codes (old ones stop working)
 *   GET  /auth/admin-mfa/status                    (signed-in admin)
 */

const express = require('express');
const { body } = require('express-validator');
const { validate } = require('../middleware/validation');
const { protect, parseCookieHeader } = require('../middleware/auth');
const adminMfa = require('../services/adminMfaService');
const refreshSessionService = require('../services/refreshSessionService');
const { setAuthCookies, REFRESH_TOKEN_COOKIE } = require('../utils/authCookies');
const { addMobileTokens } = require('../utils/mobileAuth');

const router = express.Router();

const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};

const adminOnly = (req, res, next) => (adminMfa.isAdminRole(req.user && req.user.role)
  ? next()
  : res.status(403).json({ success: false, message: 'Admins only' }));

async function startSession(req, res, session, extra = {}) {
  await refreshSessionService.create({ token: session.refreshToken, userId: session.user.id, userType: 'user', req });
  setAuthCookies(res, session);
  res.set('Cache-Control', 'no-store');
  return res.json({ success: true, ...extra, ...addMobileTokens(req, { user: session.user }, session) });
}

const mfaToken = body('mfaToken').isString().isLength({ min: 20, max: 2048 }).withMessage('Sign-in step missing');
const code = body('code').isString().matches(/^\d{6}$/).withMessage('Enter the 6-digit code');

router.post('/enroll/start', [mfaToken], validate, wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, ...(await adminMfa.startEnrollment(req.body.mfaToken)) });
}));

router.post('/enroll/verify', [mfaToken, code], validate, wrap(async (req, res) => {
  const { session, recoveryCodes } = await adminMfa.completeEnrollment(req.body.mfaToken, req.body.code);
  return startSession(req, res, session, { recoveryCodes });
}));

router.post(
  '/verify',
  [
    mfaToken,
    body('code').optional().isString().matches(/^\d{6}$/).withMessage('Enter the 6-digit code'),
    body('recoveryCode').optional().isString().isLength({ min: 8, max: 20 }),
    body().custom((b) => !!(b && (b.code || b.recoveryCode))).withMessage('Enter a code')
  ],
  validate,
  wrap(async (req, res) => {
    const { session, recoveryCodesLeft } = await adminMfa.verifyChallenge(req.body.mfaToken, {
      code: req.body.code,
      recoveryCode: req.body.recoveryCode
    });
    return startSession(req, res, session, recoveryCodesLeft !== undefined ? { recoveryCodesLeft } : {});
  })
);

router.post('/step-up', protect, adminOnly, [code], validate, wrap(async (req, res) => {
  const session = await adminMfa.stepUp(req.user._id, req.body.code);
  // Replace the current refresh session with the fresh one.
  const current = parseCookieHeader(req.headers.cookie)[REFRESH_TOKEN_COOKIE]
    || (req.body && typeof req.body.refreshToken === 'string' ? req.body.refreshToken : null);
  if (current) await refreshSessionService.revoke(current).catch(() => undefined);
  return startSession(req, res, session);
}));

router.post('/recovery-codes', protect, adminOnly, [code], validate, wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, recoveryCodes: await adminMfa.regenerateRecoveryCodes(req.user._id, req.body.code) });
}));

router.get('/status', protect, adminOnly, wrap(async (req, res) => {
  res.json({ success: true, ...(await adminMfa.status(req.user._id)) });
}));

module.exports = router;
