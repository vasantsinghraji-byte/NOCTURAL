/**
 * Forgot / reset password (customers and staff/partners).
 *   POST /auth/password/forgot  { email }                          → always 200 (no account enumeration)
 *   POST /auth/password/check   { token }                          → { valid }
 *   POST /auth/password/reset   { token, password, confirmPassword } → 200, all sessions signed out
 * The token travels in the body, never in a URL path (paths end up in logs).
 * Rate limits: forgot 3/hour/IP (passwordResetRateLimiter); check/reset use the auth limiter (app.js).
 */

const express = require('express');
const { body } = require('express-validator');
const { validate } = require('../middleware/validation');
const { passwordResetRateLimiter } = require('../middleware/rateLimitEnhanced');
const { FIELD_LIMITS } = require('../constants/enums');
const passwordResetService = require('../services/passwordResetService');

const router = express.Router();
const isTest = process.env.NODE_ENV === 'test';

const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};

const token = body('token').isString().isLength({ min: 20, max: 200 }).withMessage('Invalid reset link');

router.post(
  '/forgot',
  isTest ? (req, res, next) => next() : passwordResetRateLimiter,
  [body('email').trim().isEmail().withMessage('Enter a valid email').isLength({ max: 254 })],
  validate,
  wrap(async (req, res) => {
    await passwordResetService.request(req.body.email, { ip: req.ip });
    res.json({
      success: true,
      message: 'If an account exists for that email, we’ve sent a link to reset the password. It expires in 30 minutes.'
    });
  })
);

router.post('/check', [token], validate, wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, ...(await passwordResetService.check(req.body.token)) });
}));

router.post(
  '/reset',
  [
    token,
    body('password')
      .isString()
      .isLength(FIELD_LIMITS.PASSWORD).withMessage(`Password must be ${FIELD_LIMITS.PASSWORD.min}–${FIELD_LIMITS.PASSWORD.max} characters`)
      .matches(FIELD_LIMITS.PASSWORD_PATTERN)
      .withMessage('Use at least one uppercase letter, one lowercase letter, one number and one symbol (@$!%*?&#)'),
    body('confirmPassword').custom((value, { req }) => {
      if (value !== req.body.password) throw new Error('Passwords do not match');
      return true;
    })
  ],
  validate,
  wrap(async (req, res) => {
    const result = await passwordResetService.reset(req.body.token, req.body.password, { ip: req.ip });
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, message: 'Password updated. Sign in with your new password.', ...result });
  })
);

module.exports = router;
