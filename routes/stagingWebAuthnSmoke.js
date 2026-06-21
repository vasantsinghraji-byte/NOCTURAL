const express = require('express');
const crypto = require('crypto');
const stagingWebAuthnSmokeService = require('../services/stagingWebAuthnSmokeService');

const router = express.Router();

const isEnabled = () => process.env.NODE_ENV === 'staging' || process.env.ENABLE_STAGING_TEST_APIS === 'true';
const timingSafeEquals = (left, right) => {
  const leftBuffer = Buffer.from(left || '');
  const rightBuffer = Buffer.from(right || '');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const requireStagingSmokeSecret = (req, res, next) => {
  const expected = process.env.STAGING_TEST_API_SECRET;
  const provided = req.get('x-staging-test-secret');

  if (!isEnabled()) {
    return res.status(404).json({ success: false, message: 'Not found' });
  }

  if (!expected || !provided || !timingSafeEquals(provided, expected)) {
    return res.status(401).json({ success: false, message: 'Unauthorized staging smoke API request' });
  }

  next();
};

router.use(requireStagingSmokeSecret);

router.post('/webauthn-smoke/accounts', async (_req, res, next) => {
  try {
    const account = await stagingWebAuthnSmokeService.createAccount();
    res.status(201).json({ success: true, ...account });
  } catch (error) {
    next(error);
  }
});

router.delete('/webauthn-smoke/accounts/:accountId', async (req, res, next) => {
  try {
    const result = await stagingWebAuthnSmokeService.revokeAccount(req.params.accountId);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
