const crypto = require('crypto');
const { ValidationError, ExternalServiceError } = require('../utils/errors');
const { getFromCache, setToCache } = require('../config/redis');
const operationalMetrics = require('../utils/operationalMetrics');

const COMMON_COMPROMISED_PASSWORDS = new Set([
  '12345678',
  'password',
  'password123',
  'qwerty123',
  'admin123'
]);
const memoryCache = new Map();
let consecutiveFailures = 0;
let circuitOpenUntil = 0;

const getCacheTtlSeconds = () => Number(process.env.COMPROMISED_PASSWORD_CACHE_TTL_SECONDS) || 24 * 60 * 60;
const getCircuitThreshold = () => Number(process.env.COMPROMISED_PASSWORD_CIRCUIT_FAILURE_THRESHOLD) || 5;
const getCircuitResetMs = () => Number(process.env.COMPROMISED_PASSWORD_CIRCUIT_RESET_MS) || 60 * 1000;

const getCachedRange = async (prefix) => {
  const memory = memoryCache.get(prefix);
  if (memory && memory.expiresAt > Date.now()) return memory.body;
  const cached = await getFromCache(`hibp:range:${prefix}`);
  if (typeof cached === 'string') {
    memoryCache.set(prefix, { body: cached, expiresAt: Date.now() + getCacheTtlSeconds() * 1000 });
    return cached;
  }
  return null;
};

const cacheRange = async (prefix, body) => {
  memoryCache.set(prefix, { body, expiresAt: Date.now() + getCacheTtlSeconds() * 1000 });
  await setToCache(`hibp:range:${prefix}`, body, getCacheTtlSeconds());
};

const checkRemoteRange = async (password) => {
  if (process.env.COMPROMISED_PASSWORD_CHECK_ENABLED !== 'true') return false;
  if (typeof global.fetch !== 'function') {
    throw new ExternalServiceError('compromised-password-check');
  }

  // HIBP's k-anonymity protocol requires SHA-1; this digest is never stored or used for authentication.
  // eslint-disable-next-line no-restricted-syntax
  const hash = crypto.createHash('sha1').update(password).digest('hex').toUpperCase(); // lgtm[js/insufficient-password-hash]
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  const cached = await getCachedRange(prefix);
  if (cached !== null) {
    operationalMetrics.increment('compromised_password_cache_hits_total');
    return cached.split(/\r?\n/).some(line => line.split(':')[0] === suffix);
  }
  if (circuitOpenUntil > Date.now()) {
    operationalMetrics.increment('compromised_password_circuit_open_rejections_total');
    if (process.env.COMPROMISED_PASSWORD_CHECK_FAIL_OPEN === 'true') return false;
    throw new ExternalServiceError('compromised-password-check');
  }
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Number(process.env.COMPROMISED_PASSWORD_CHECK_TIMEOUT_MS) || 3000
  );

  try {
    const response = await global.fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'Nocturnal-Password-Security' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.text();
    consecutiveFailures = 0;
    circuitOpenUntil = 0;
    await cacheRange(prefix, body);
    return body.split(/\r?\n/).some(line => line.split(':')[0] === suffix);
  } catch (error) {
    consecutiveFailures++;
    operationalMetrics.increment('compromised_password_provider_failures_total');
    if (consecutiveFailures >= getCircuitThreshold()) {
      circuitOpenUntil = Date.now() + getCircuitResetMs();
      operationalMetrics.increment('compromised_password_circuit_opened_total');
    }
    if (process.env.COMPROMISED_PASSWORD_CHECK_FAIL_OPEN === 'true') return false;
    throw new ExternalServiceError('compromised-password-check', error);
  } finally {
    clearTimeout(timeout);
  }
};

const assertPasswordNotCompromised = async (password) => {
  if (COMMON_COMPROMISED_PASSWORDS.has(String(password).toLowerCase())) {
    throw new ValidationError('Choose a password that has not appeared in known breaches');
  }
  if (await checkRemoteRange(String(password))) {
    throw new ValidationError('Choose a password that has not appeared in known breaches');
  }
};

module.exports = { assertPasswordNotCompromised };
