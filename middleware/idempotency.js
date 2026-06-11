const crypto = require('crypto');
const IdempotencyKey = require('../models/idempotencyKey');
const { encrypt, decrypt } = require('../utils/encryptionV2');
const logger = require('../utils/logger');
const idempotencyIndexes = require('../config/idempotencyIndexes');

const MAX_KEY_LENGTH = 255;

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

// Order-independent stringify so the same payload always hashes identically.
const canonicalize = (value) => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value === undefined ? null : value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`)
    .join(',')}}`;
};

const getIdentity = (req) => {
  const user = req.user || {};
  return (user.id || (user._id && user._id.toString())) || 'anonymous';
};

/**
 * Per-route idempotency for explicitly approved mutation endpoints.
 *
 * Attach to a single route (never globally). If the request carries no
 * `Idempotency-Key` header it passes through unchanged. When a key is present it:
 *   - atomically claims the scoped key (identity + method + route + key),
 *   - replays the original response for a completed duplicate (same payload),
 *   - rejects the same key reused with a different payload (422),
 *   - rejects a concurrent in-flight duplicate (409),
 *   - caches only successful (2xx) responses, encrypted, and releases the claim
 *     on failure so the client may retry.
 *
 * @param {{ route: string, failClosed?: boolean }} options - stable route
 * identifier for scoping. Set failClosed=false only for naturally idempotent
 * operations that must remain available when index verification is unavailable.
 */
module.exports = function idempotency(options = {}) {
  const route = options.route;
  const failClosed = options.failClosed !== false;
  if (!route) {
    throw new Error('idempotency() requires a non-empty { route } identifier');
  }

  return async function idempotencyMiddleware(req, res, next) {
    const rawKey = req.get('Idempotency-Key');
    if (!rawKey || typeof rawKey !== 'string' || !rawKey.trim()) {
      return next(); // No key => no protection requested.
    }

    if (!idempotencyIndexes.isReady()) {
      if (!failClosed) {
        logger.warn('Idempotency unavailable; allowing naturally idempotent operation', { route });
        return next();
      }

      logger.error('Idempotent mutation blocked because indexes are unavailable', { route });
      res.set('Retry-After', '30');
      return res.status(503).json({
        success: false,
        message: 'This operation is temporarily unavailable'
      });
    }

    const key = rawKey.trim();
    if (key.length > MAX_KEY_LENGTH) {
      return res.status(400).json({ success: false, message: 'Idempotency-Key is too long' });
    }

    const scope = sha256(`${getIdentity(req)}|${req.method}|${route}|${key}`);
    const requestHash = sha256(canonicalize(req.body || {}));

    // 1) Atomically claim the key (unique index => only one winner).
    try {
      await IdempotencyKey.create({ scope, requestHash, status: 'processing' });
    } catch (error) {
      if (error && error.code === 11000) {
        return handleDuplicate({ res, next, scope, requestHash, route });
      }
      logger.error('Idempotency claim failed', { route, error: error.message });
      return next(error);
    }

    // 2) Capture the response so a future duplicate can replay it.
    const originalJson = res.json.bind(res);
    let snapshot = null;
    res.json = (body) => {
      snapshot = { statusCode: res.statusCode || 200, body };
      return originalJson(body);
    };

    res.on('finish', () => {
      persistOutcome({ scope, snapshot, route }).catch((error) => {
        logger.error('Idempotency persistence failed', { route, error: error.message });
      });
    });

    return next();
  };
};

async function handleDuplicate({ res, next, scope, requestHash, route }) {
  const existing = await IdempotencyKey.findOne({ scope });
  if (!existing) {
    // Record expired/removed between claim attempt and lookup — treat as new.
    return next();
  }

  if (existing.requestHash !== requestHash) {
    return res.status(422).json({
      success: false,
      message: 'Idempotency-Key was already used with a different request payload'
    });
  }

  if (existing.status === 'completed') {
    let body;
    try {
      body = JSON.parse(decrypt(existing.responseBody));
    } catch (error) {
      logger.error('Idempotency replay decode failed', { route, error: error.message });
      return res.status(409).json({ success: false, message: 'Idempotent response is unavailable' });
    }
    res.set('Idempotent-Replayed', 'true');
    return res.status(existing.responseStatus || 200).json(body);
  }

  // Still processing => a concurrent duplicate is already in flight.
  return res.status(409).json({
    success: false,
    message: 'A request with this Idempotency-Key is already being processed'
  });
}

async function persistOutcome({ scope, snapshot }) {
  const isSuccess = snapshot && snapshot.statusCode >= 200 && snapshot.statusCode < 300;
  if (isSuccess) {
    await IdempotencyKey.updateOne(
      { scope },
      {
        $set: {
          status: 'completed',
          responseStatus: snapshot.statusCode,
          responseBody: encrypt(JSON.stringify(snapshot.body))
        }
      }
    );
    return;
  }
  // Non-2xx or no JSON body => release the claim so the client can retry.
  await IdempotencyKey.deleteOne({ scope });
}
