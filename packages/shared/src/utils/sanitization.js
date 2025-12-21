/**
 * Enhanced NoSQL Injection Sanitization
 *
 * Protects against MongoDB injection attacks by sanitizing user input.
 * This is a comprehensive implementation that handles edge cases.
 */

const MAX_RECURSION_DEPTH = 10;
const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];
const MONGODB_OPERATORS = [
  '$where', '$regex', '$expr', '$jsonSchema', '$text',
  '$eq', '$ne', '$gt', '$gte', '$lt', '$lte',
  '$in', '$nin', '$exists', '$type',
  '$and', '$or', '$not', '$nor',
  '$elemMatch', '$all', '$size',
  '$mod', '$slice', '$push', '$pull',
  '$set', '$unset', '$inc', '$mul',
  '$rename', '$setOnInsert', '$currentDate'
];

/**
 * Enhanced sanitization function
 */
function sanitizeData(obj, depth = 0) {
  if (depth > MAX_RECURSION_DEPTH) {
    return {};
  }

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'function') {
    return undefined;
  }

  if (typeof obj !== 'object') {
    if (typeof obj === 'string') {
      return sanitizeString(obj);
    }
    return obj;
  }

  if (obj instanceof Date) {
    return obj;
  }

  if (obj instanceof RegExp) {
    return obj.toString();
  }

  if (Array.isArray(obj)) {
    return obj
      .filter(item => item !== undefined)
      .map(item => sanitizeData(item, depth + 1));
  }

  const sanitized = {};

  for (const key of Object.keys(obj)) {
    if (DANGEROUS_KEYS.includes(key)) {
      continue;
    }

    if (key.startsWith('$')) {
      continue;
    }

    if (key.startsWith('_') && key !== '_id') {
      continue;
    }

    if (key.includes('.')) {
      const safeKey = key.replace(/\./g, '_');
      sanitized[safeKey] = sanitizeData(obj[key], depth + 1);
      continue;
    }

    if (key.includes('\0')) {
      const safeKey = key.replace(/\0/g, '_');
      sanitized[safeKey] = sanitizeData(obj[key], depth + 1);
      continue;
    }

    if (hasDangerousCharacters(key)) {
      const safeKey = sanitizeKeyName(key);
      sanitized[safeKey] = sanitizeData(obj[key], depth + 1);
      continue;
    }

    const sanitizedValue = sanitizeData(obj[key], depth + 1);

    if (sanitizedValue === undefined) {
      continue;
    }

    sanitized[key] = sanitizedValue;
  }

  return sanitized;
}

function sanitizeString(str) {
  if (str.includes('\0')) {
    str = str.replace(/\0/g, '');
  }
  return str;
}

function hasDangerousCharacters(key) {
  return (
    key.includes('$') ||
    key.includes('.') ||
    key.includes('\0') ||
    key.includes('..') ||
    key.includes('\\') ||
    key.includes('<') ||
    key.includes('>') ||
    key.includes('&') ||
    key.includes("'") ||
    key.includes('"') ||
    key.includes('`')
  );
}

function sanitizeKeyName(key) {
  return key
    .replace(/[$.\0\\<>&'"`;]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function detectMongoOperators(obj, path = '') {
  const found = [];

  if (!obj || typeof obj !== 'object') {
    return found;
  }

  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      found.push(...detectMongoOperators(item, `${path}[${index}]`));
    });
    return found;
  }

  for (const key of Object.keys(obj)) {
    const currentPath = path ? `${path}.${key}` : key;

    if (key.startsWith('$')) {
      found.push({
        operator: key,
        path: currentPath,
        value: obj[key]
      });
    }

    if (typeof obj[key] === 'object' && obj[key] !== null) {
      found.push(...detectMongoOperators(obj[key], currentPath));
    }
  }

  return found;
}

function validateSanitization(obj) {
  if (!obj || typeof obj !== 'object') {
    return true;
  }

  if (Array.isArray(obj)) {
    return obj.every(item => validateSanitization(item));
  }

  for (const key of Object.keys(obj)) {
    if (key.startsWith('$') ||
        DANGEROUS_KEYS.includes(key) ||
        key.includes('.') ||
        key.includes('\0')) {
      return false;
    }

    if (typeof obj[key] === 'object' && obj[key] !== null) {
      if (!validateSanitization(obj[key])) {
        return false;
      }
    }
  }

  return true;
}

function sanitizationMiddleware() {
  return (req, res, next) => {
    try {
      if (req.body && typeof req.body === 'object') {
        req.body = sanitizeData(req.body);
      }

      if (req.query && typeof req.query === 'object') {
        req.query = sanitizeData(req.query);
      }

      if (req.params && typeof req.params === 'object') {
        req.params = sanitizeData(req.params);
      }

      next();
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        message: 'Request contains potentially malicious content'
      });
    }
  };
}

module.exports = {
  sanitizeData,
  sanitizeString,
  hasDangerousCharacters,
  sanitizeKeyName,
  detectMongoOperators,
  validateSanitization,
  sanitizationMiddleware,
  MAX_RECURSION_DEPTH,
  DANGEROUS_KEYS,
  MONGODB_OPERATORS
};
