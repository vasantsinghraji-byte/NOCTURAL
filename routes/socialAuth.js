/**
 * Customer sign-in with Google or phone OTP (rate-limited in app.js).
 *   GET  /auth/social/methods        which sign-in options are live
 *   POST /auth/social/google         { idToken }
 *   POST /auth/social/phone/start    { phone }
 *   POST /auth/social/phone/verify   { phone, code }
 *   POST /auth/social/complete       { signupToken, name, email?, phone? }
 * A response is either a session (cookies for web, body tokens for the app)
 * or { needsProfile, signupToken, profile } for a first-time user.
 */

const express = require('express');
const { body } = require('express-validator');
const { validate } = require('../middleware/validation');
const socialAuthService = require('../services/socialAuthService');
const refreshSessionService = require('../services/refreshSessionService');
const { setAuthCookies } = require('../utils/authCookies');
const { addMobileTokens } = require('../utils/mobileAuth');

const router = express.Router();

async function respond(req, res, result) {
  if (result.session) {
    const s = result.session;
    await refreshSessionService.create({ token: s.refreshToken, userId: s.patient.id, userType: 'patient', req });
    setAuthCookies(res, s);
    return res.json({ success: true, ...addMobileTokens(req, { patient: s.patient }, s) });
  }
  return res.json({ success: true, needsProfile: true, signupToken: result.signupToken, profile: result.profile });
}

const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};

router.get('/methods', (req, res) => res.json({ success: true, methods: socialAuthService.getMethods() }));

router.post(
  '/google',
  [body('idToken').isString().isLength({ min: 20, max: 4096 }).withMessage('Google sign-in token missing')],
  validate,
  wrap(async (req, res) => respond(req, res, await socialAuthService.googleSignIn(req.body.idToken)))
);

router.post(
  '/phone/start',
  [body('phone').isString().isLength({ min: 10, max: 16 }).withMessage('Enter your mobile number')],
  validate,
  wrap(async (req, res) => res.json({ success: true, ...(await socialAuthService.startPhoneSignIn(req.body.phone, req.ip)) }))
);

router.post(
  '/phone/verify',
  [
    body('phone').isString().isLength({ min: 10, max: 16 }),
    body('code').isString().matches(/^\d{6}$/).withMessage('Enter the 6-digit code')
  ],
  validate,
  wrap(async (req, res) => respond(req, res, await socialAuthService.verifyPhoneSignIn(req.body.phone, req.body.code)))
);

router.post(
  '/complete',
  [
    body('signupToken').isString().isLength({ min: 20, max: 2048 }),
    body('name').isString().trim().isLength({ min: 2, max: 80 }).withMessage('Tell us your name'),
    body('email').optional().isEmail().withMessage('Enter a valid email'),
    body('phone').optional().isString().isLength({ min: 10, max: 16 })
  ],
  validate,
  wrap(async (req, res) => respond(req, res, await socialAuthService.completeSignup(req.body)))
);

module.exports = router;
