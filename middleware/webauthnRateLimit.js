const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const operationalMetrics = require('../utils/operationalMetrics');

const identityKey = req => {
  const userId = req.user?._id || req.user?.id || 'anonymous';
  return `${userId}:${ipKeyGenerator(req.ip)}`;
};

const identityType = req => (req.userType === 'patient' ? 'patient' : (req.user ? 'user' : 'anonymous'));

const makeLimiter = ({ windowMs, max, metricName, message }) => rateLimit({
  windowMs,
  max,
  keyGenerator: identityKey,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    operationalMetrics.increment(metricName);
    operationalMetrics.incrementLabeled(metricName, { identity_type: identityType(req) });
    res.status(429).json({
      success: false,
      message,
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

const recoveryCodeGenerationLimiter = makeLimiter({
  windowMs: Number(process.env.WEBAUTHN_RECOVERY_CODE_GENERATION_WINDOW_MS) || 60 * 60 * 1000,
  max: Number(process.env.WEBAUTHN_RECOVERY_CODE_GENERATION_MAX) || 3,
  metricName: 'webauthn_recovery_code_generation_rate_limited_total',
  message: 'Recovery codes were generated too recently. Please try again later.'
});

const lostDeviceRecoveryLimiter = makeLimiter({
  windowMs: Number(process.env.WEBAUTHN_LOST_DEVICE_RECOVERY_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.WEBAUTHN_LOST_DEVICE_RECOVERY_MAX) || 5,
  metricName: 'webauthn_lost_device_recovery_rate_limited_total',
  message: 'Too many recovery-code attempts. Please try again later.'
});

module.exports = {
  recoveryCodeGenerationLimiter,
  lostDeviceRecoveryLimiter
};
