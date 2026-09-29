/**
 * Razorpay gateway helper
 *
 * Lazily builds a Razorpay SDK client and exposes signature verification.
 * Uses the same feature flag as the B2C payment routes (routes/v1/index.js):
 * enabled only when RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET are set and
 * RAZORPAY_ENABLED !== 'false'. When disabled, callers get a 503.
 */

const crypto = require('crypto');
const logger = require('./logger');
const { ServiceError, ExternalServiceError } = require('./errors');
const { HTTP_STATUS } = require('../constants');

let client = null;

function isEnabled() {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
    && process.env.RAZORPAY_ENABLED !== 'false';
}

/** Publishable key id (safe to send to the browser checkout). */
function getPublicKeyId() {
  return isEnabled() ? process.env.RAZORPAY_KEY_ID : null;
}

function getClient() {
  if (client) return client;
  if (!isEnabled()) {
    throw new ServiceError(
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      'Online payment is not available right now. Please choose Cash on Delivery.'
    );
  }

  let Razorpay;
  try {
    Razorpay = require('razorpay');
  } catch (err) {
    logger.error('razorpay package is not installed', { error: err.message });
    throw new ExternalServiceError('Razorpay', err);
  }

  client = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
  return client;
}

/**
 * Verify the checkout handler signature: HMAC-SHA256(order_id|payment_id, secret).
 * Constant-time comparison so the signature can't be probed byte-by-byte.
 */
function verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, signature) {
  if (!process.env.RAZORPAY_KEY_SECRET || typeof signature !== 'string') return false;
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(signature, 'utf8');
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

/** INR rupees → integer paise. */
const toPaise = (amount) => Math.round(Number(amount) * 100);

/** Test hook: drop the cached client (env changes between tests). */
function resetClient() {
  client = null;
}

module.exports = {
  isEnabled,
  getPublicKeyId,
  getClient,
  verifyPaymentSignature,
  toPaise,
  resetClient
};
