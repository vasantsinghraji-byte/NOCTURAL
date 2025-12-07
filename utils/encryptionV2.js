/**
 * Enhanced Encryption Utilities - Version 2
 *
 * Upgrades from AES-256-CBC to AES-256-GCM (authenticated encryption)
 * Implements key versioning for rotation
 * Adds authentication tags to prevent tampering
 */

const crypto = require('crypto');
const logger = require('./logger');

// Use AES-256-GCM for authenticated encryption
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12;  // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 16;

/**
 * Key versioning for rotation support
 * Format: keyId:version:encryptedData
 */
const KEY_VERSIONS = {
  v1: {
    id: 'v1',
    key: null, // Lazy loaded from ENCRYPTION_KEY
    algorithm: 'aes-256-gcm',
    deprecated: false
  },
  v2: {
    id: 'v2',
    key: null, // Lazy loaded from ENCRYPTION_KEY_V2 if exists
    algorithm: 'aes-256-gcm',
    deprecated: false
  }
};

// Current active key version
const CURRENT_KEY_VERSION = 'v1';

/**
 * Get encryption key for a specific version
 */
function getKey(version = CURRENT_KEY_VERSION) {
  const keyConfig = KEY_VERSIONS[version];

  if (!keyConfig) {
    throw new Error(`Unknown key version: ${version}`);
  }

  // Lazy load key
  if (!keyConfig.key) {
    const envKey = version === 'v1'
      ? process.env.ENCRYPTION_KEY
      : process.env[`ENCRYPTION_KEY_${version.toUpperCase()}`];

    if (!envKey) {
      throw new Error(`${version === 'v1' ? 'ENCRYPTION_KEY' : `ENCRYPTION_KEY_${version.toUpperCase()}`} not set`);
    }

    if (envKey.length !== 64) {
      throw new Error(`Encryption key must be 64 hex characters (32 bytes)`);
    }

    keyConfig.key = Buffer.from(envKey, 'hex');
  }

  return keyConfig.key;
}

/**
 * Encrypt data with AES-256-GCM (authenticated encryption)
 * Returns format: version:iv:authTag:encryptedData (all hex-encoded)
 */
function encrypt(plaintext, options = {}) {
  if (!plaintext) return null;

  const {
    keyVersion = CURRENT_KEY_VERSION,
    encoding = 'utf8'
  } = options;

  try {
    // Get key for specified version
    const key = getKey(keyVersion);

    // Generate random IV (96 bits for GCM)
    const iv = crypto.randomBytes(IV_LENGTH);

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Encrypt data
    const encrypted = Buffer.concat([
      cipher.update(plaintext, encoding),
      cipher.final()
    ]);

    // Get authentication tag (GCM provides this)
    const authTag = cipher.getAuthTag();

    // Return version:iv:authTag:encrypted (all hex-encoded)
    return [
      keyVersion,
      iv.toString('hex'),
      authTag.toString('hex'),
      encrypted.toString('hex')
    ].join(':');

  } catch (error) {
    logger.error('Encryption error', {
      error: error.message,
      keyVersion,
      stack: error.stack
    });
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt data encrypted with AES-256-GCM
 * Supports multiple key versions for rotation
 */
function decrypt(ciphertext, options = {}) {
  if (!ciphertext) return null;

  const { encoding = 'utf8' } = options;

  try {
    // Parse format: version:iv:authTag:encrypted
    const parts = ciphertext.split(':');

    if (parts.length < 4) {
      // Legacy format without version - try v1
      logger.warn('Decrypting legacy format without version tag');
      return decryptLegacy(ciphertext);
    }

    const [version, ivHex, authTagHex, encryptedHex] = parts;

    // Check if version is deprecated
    const keyConfig = KEY_VERSIONS[version];
    if (keyConfig && keyConfig.deprecated) {
      logger.warn('Using deprecated key version', { version });
    }

    // Get key for this version
    const key = getKey(version);

    // Decode components
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

    // Set auth tag (required for GCM)
    decipher.setAuthTag(authTag);

    // Decrypt
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);

    return decrypted.toString(encoding);

  } catch (error) {
    logger.error('Decryption error', {
      error: error.message,
      stack: error.stack
    });
    return null;
  }
}

/**
 * Decrypt legacy CBC-encrypted data (for migration)
 * Format: iv:encrypted
 */
function decryptLegacy(ciphertext) {
  try {
    const parts = ciphertext.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid legacy format');
    }

    const key = getKey('v1');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = Buffer.from(parts[1], 'hex');

    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);

    return decrypted.toString('utf8');

  } catch (error) {
    logger.error('Legacy decryption failed', { error: error.message });
    return null;
  }
}

/**
 * Re-encrypt data with current key version
 * Use this to migrate from old key version to new
 */
function reencrypt(ciphertext, options = {}) {
  const plaintext = decrypt(ciphertext);

  if (!plaintext) {
    throw new Error('Failed to decrypt for re-encryption');
  }

  return encrypt(plaintext, {
    keyVersion: CURRENT_KEY_VERSION,
    ...options
  });
}

/**
 * Hash sensitive data (one-way, cannot be decrypted)
 * Uses SHA-256 with optional salt
 */
function hash(text, options = {}) {
  if (!text) return null;

  const {
    salt = '',
    algorithm = 'sha256',
    iterations = 1
  } = options;

  try {
    let hash = text.toString() + salt;

    for (let i = 0; i < iterations; i++) {
      hash = crypto.createHash(algorithm).update(hash).digest('hex');
    }

    return hash;

  } catch (error) {
    logger.error('Hashing error', { error: error.message });
    throw new Error('Failed to hash data');
  }
}

/**
 * Derive key from password using PBKDF2
 * For password-based encryption
 */
function deriveKey(password, salt, iterations = 100000) {
  return crypto.pbkdf2Sync(
    password,
    salt,
    iterations,
    KEY_LENGTH,
    'sha256'
  );
}

/**
 * Generate random token
 */
function generateToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Compare hash with plaintext (constant-time comparison)
 */
function compareHash(plaintext, hash, options = {}) {
  const computed = this.hash(plaintext, options);

  // Use timingSafeEqual to prevent timing attacks
  if (computed.length !== hash.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(computed),
    Buffer.from(hash)
  );
}

/**
 * Encrypt object (serializes to JSON first)
 */
function encryptObject(obj, options = {}) {
  if (!obj) return null;

  const json = JSON.stringify(obj);
  return encrypt(json, options);
}

/**
 * Decrypt object (deserializes from JSON)
 */
function decryptObject(ciphertext, options = {}) {
  if (!ciphertext) return null;

  const json = decrypt(ciphertext, options);

  if (!json) return null;

  try {
    return JSON.parse(json);
  } catch (error) {
    logger.error('Failed to parse decrypted JSON', { error: error.message });
    return null;
  }
}

/**
 * Get current key version info
 */
function getKeyInfo() {
  return {
    currentVersion: CURRENT_KEY_VERSION,
    algorithm: ALGORITHM,
    versions: Object.keys(KEY_VERSIONS).map(v => ({
      version: v,
      deprecated: KEY_VERSIONS[v].deprecated,
      algorithm: KEY_VERSIONS[v].algorithm
    }))
  };
}

module.exports = {
  // Core functions
  encrypt,
  decrypt,
  hash,

  // Advanced functions
  reencrypt,
  deriveKey,
  generateToken,
  compareHash,

  // Object encryption
  encryptObject,
  decryptObject,

  // Key management
  getKeyInfo,

  // Legacy support
  decryptLegacy,

  // Constants
  ALGORITHM,
  CURRENT_KEY_VERSION
};
