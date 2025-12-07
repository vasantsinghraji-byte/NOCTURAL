const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';

// Validate and get encryption key (lazy evaluation to avoid requiring .env to be loaded immediately)
const getEncryptionKey = () => {
  if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length !== 64) {
    throw new Error('ENCRYPTION_KEY environment variable must be set to a 64-character hex string');
  }
  return process.env.ENCRYPTION_KEY;
};

// Encrypt sensitive data
exports.encrypt = (text) => {
  if (!text) return null;

  try {
    const ENCRYPTION_KEY = getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      ALGORITHM,
      Buffer.from(ENCRYPTION_KEY, 'hex'),
      iv
    );

    let encrypted = cipher.update(text.toString());
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    return iv.toString('hex') + ':' + encrypted.toString('hex');
  } catch (error) {
    logger.error('Encryption error', {
      error: error.message,
      stack: error.stack
    });
    throw new Error('Failed to encrypt data');
  }
};

// Decrypt sensitive data
exports.decrypt = (text) => {
  if (!text) return null;

  try {
    const ENCRYPTION_KEY = getEncryptionKey();
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedText = Buffer.from(parts.join(':'), 'hex');

    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      Buffer.from(ENCRYPTION_KEY, 'hex'),
      iv
    );

    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString();
  } catch (error) {
    logger.error('Decryption error', {
      error: error.message,
      stack: error.stack
    });
    return null;
  }
};

// Hash sensitive data (one-way - cannot be decrypted)
exports.hash = (text) => {
  if (!text) return null;

  return crypto
    .createHash('sha256')
    .update(text.toString())
    .digest('hex');
};
