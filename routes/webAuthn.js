const express = require('express');
const { body } = require('express-validator');
const { protectBoth } = require('../middleware/patientAuth');
const { validate } = require('../middleware/validation');
const controller = require('../controllers/webAuthnController');
const {
  recoveryCodeGenerationLimiter,
  lostDeviceRecoveryLimiter
} = require('../middleware/webauthnRateLimit');

const router = express.Router();
const recoveryCodeValidation = [
  body('recoveryCode').trim().isLength({ min: 7, max: 64 }).withMessage('Valid recovery code is required'),
  body('revokePasskeys').optional().isBoolean().withMessage('revokePasskeys must be boolean'),
  validate
];
const verificationValidation = [
  body('challengeId').isMongoId().withMessage('Valid challengeId is required'),
  body('response').isObject().withMessage('WebAuthn response is required'),
  validate
];

router.use(protectBoth);
router.get('/credentials', controller.listCredentials);
router.delete('/credentials/:credentialId', controller.revokeCredential);
router.post('/registration/options', controller.registrationOptions);
router.post(
  '/registration/verify',
  [
    ...verificationValidation.slice(0, -1),
    body('name').optional().trim().isLength({ max: 100 }),
    validate
  ],
  controller.verifyRegistration
);
router.post('/password-change/options', controller.passwordOptions);
router.post('/password-change/verify', verificationValidation, controller.verifyPasswordConfirmation);
router.get('/recovery-codes/status', controller.recoveryCodeStatus);
router.post(
  '/recovery-codes',
  recoveryCodeGenerationLimiter,
  [
    body('count').optional().isInt({ min: 1, max: 20 }).withMessage('count must be between 1 and 20'),
    validate
  ],
  controller.generateRecoveryCodes
);
router.post('/lost-device/recover', lostDeviceRecoveryLimiter, recoveryCodeValidation, controller.recoverLostDevice);

module.exports = router;
