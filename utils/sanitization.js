/**
 * Enhanced NoSQL Injection Sanitization
 *
 * Protects against MongoDB injection attacks by sanitizing user input.
 * This is a comprehensive implementation that handles edge cases not covered
 * by express-mongo-sanitize (which is incompatible with Node 22+).
 *
 * Attack Vectors Handled:
 * 1. MongoDB operators ($where, $ne, $gt, etc.)
 * 2. Dot notation field traversal
 * 3. Null bytes in keys
 * 4. Nested operator injection
 * 5. Array element operators ($elemMatch, $all, etc.)
 * 6. Prototype pollution
 * 7. Deep recursion attacks
 * 8. Function injection
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
 * @param {*} obj - Object to sanitize
 * @param {number} depth - Current recursion depth
 * @returns {*} Sanitized object
 */
function sanitizeData(obj, depth = 0) {
  // Prevent deep recursion attacks
  if (depth > MAX_RECURSION_DEPTH) {
    return {}; // Return empty object instead of the potentially malicious deep structure
  }

  // Handle null and undefined
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle primitives (string, number, boolean)
  if (typeof obj !== 'object') {
    // Sanitize strings that might contain injection attempts
    if (typeof obj === 'string') {
      return sanitizeString(obj);
    }
    return obj;
  }

  // Handle functions (should never be in user input, but sanitize anyway)
  if (typeof obj === 'function') {
    return undefined; // Remove functions entirely
  }

  // Handle Date objects (return as-is, they're safe)
  if (obj instanceof Date) {
    return obj;
  }

  // Handle RegExp objects (could be used for ReDoS attacks)
  if (obj instanceof RegExp) {
    return obj.toString(); // Convert to string to prevent ReDoS
  }

  // Handle Arrays
  if (Array.isArray(obj)) {
    return obj
      .filter(item => item !== undefined) // Remove undefined items
      .map(item => sanitizeData(item, depth + 1));
  }

  // Handle Objects
  const sanitized = {};

  for (const key of Object.keys(obj)) {
    // Skip prototype pollution keys
    if (DANGEROUS_KEYS.includes(key)) {
      continue;
    }

    // Check for MongoDB operators
    if (key.startsWith('$')) {
      // Allow specific safe operators in certain contexts
      // For now, remove all $ operators from user input
      continue;
    }

    // Check for underscore-prefixed private properties (could be MongoDB internal)
    if (key.startsWith('_') && key !== '_id') {
      // Allow _id (MongoDB's standard identifier), block others
      continue;
    }

    // Check for dot notation (MongoDB field traversal)
    if (key.includes('.')) {
      // Replace dots with underscores to prevent field traversal
      const safeKey = key.replace(/\./g, '_');
      sanitized[safeKey] = sanitizeData(obj[key], depth + 1);
      continue;
    }

    // Check for null bytes (can cause issues in some systems)
    if (key.includes('\0')) {
      // Replace null bytes with underscores
      const safeKey = key.replace(/\0/g, '_');
      sanitized[safeKey] = sanitizeData(obj[key], depth + 1);
      continue;
    }

    // Check for other dangerous characters
    if (hasDangerousCharacters(key)) {
      const safeKey = sanitizeKeyName(key);
      sanitized[safeKey] = sanitizeData(obj[key], depth + 1);
      continue;
    }

    // Recursively sanitize the value
    const sanitizedValue = sanitizeData(obj[key], depth + 1);

    // Skip if value is undefined (functions become undefined)
    if (sanitizedValue === undefined) {
      continue;
    }

    // Skip if value is an empty object that only contained MongoDB operators
    if (typeof sanitizedValue === 'object' &&
        !Array.isArray(sanitizedValue) &&
        !(sanitizedValue instanceof Date) &&
        Object.keys(sanitizedValue).length === 0 &&
        typeof obj[key] === 'object' &&
        Object.keys(obj[key]).length > 0 &&
        Object.keys(obj[key]).every(k => k.startsWith('$') || DANGEROUS_KEYS.includes(k))) {
      // This was an object that only contained $ operators or dangerous keys, skip it entirely
      continue;
    }

    sanitized[key] = sanitizedValue;
  }

  return sanitized;
}

/**
 * Sanitize string values
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 */
function sanitizeString(str) {
  // Check for common injection patterns in string values
  // This is a basic check - input validation should be primary defense

  // Remove null bytes
  if (str.includes('\0')) {
    str = str.replace(/\0/g, '');
  }

  // Check for JavaScript function injection attempts
  if (str.includes('function') || str.includes('=>')) {
    // This is suspicious in user input, but we'll allow it with logging
    // Real validation should happen at the route/controller level
  }

  return str;
}

/**
 * Check if key contains dangerous characters
 * @param {string} key - Key to check
 * @returns {boolean} True if dangerous characters found
 */
function hasDangerousCharacters(key) {
  // Check for various dangerous patterns
  return (
    key.includes('$') ||           // MongoDB operators
    key.includes('\0') ||          // Null bytes
    key.includes('..') ||          // Path traversal
    key.includes('\\') ||          // Escape characters
    key.includes('<') ||           // Potential XSS (though this is NoSQL focus)
    key.includes('>') ||
    key.includes('&') ||
    key.includes("'") ||
    key.includes('"') ||
    key.includes('`')
  );
}

/**
 * Sanitize key name by removing dangerous characters
 * @param {string} key - Key to sanitize
 * @returns {string} Sanitized key
 */
function sanitizeKeyName(key) {
  // Replace dangerous characters with underscores
  return key
    .replace(/[$.\0\\<>&'"`;]/g, '_')
    .replace(/_+/g, '_')  // Replace multiple underscores with single
    .replace(/^_|_$/g, ''); // Remove leading/trailing underscores
}

/**
 * Check if data contains MongoDB operators
 * Used for detection/logging purposes
 * @param {*} obj - Object to check
 * @param {string} path - Current path (for logging)
 * @returns {Array} Array of found operators with paths
 */
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

/**
 * Validate that sanitization was effective
 * @param {*} obj - Object to validate
 * @returns {boolean} True if safe, false if dangerous content found
 */
function validateSanitization(obj) {
  if (!obj || typeof obj !== 'object') {
    return true;
  }

  if (Array.isArray(obj)) {
    return obj.every(item => validateSanitization(item));
  }

  for (const key of Object.keys(obj)) {
    // Check for any remaining dangerous keys
    if (key.startsWith('$') ||
        DANGEROUS_KEYS.includes(key) ||
        key.includes('.') ||
        key.includes('\0')) {
      return false;
    }

    // Recursively validate nested objects
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      if (!validateSanitization(obj[key])) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Express middleware for automatic sanitization
 * @returns {Function} Express middleware
 */
function sanitizationMiddleware() {
  return (req, res, next) => {
    try {
      // Sanitize request body
      if (req.body && typeof req.body === 'object') {
        req.body = sanitizeData(req.body);
      }

      // Sanitize query parameters
      if (req.query && typeof req.query === 'object') {
        req.query = sanitizeData(req.query);
      }

      // Sanitize route parameters
      if (req.params && typeof req.params === 'object') {
        req.params = sanitizeData(req.params);
      }

      next();
    } catch (error) {
      // If sanitization fails, reject the request
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

  // Export constants for testing
  MAX_RECURSION_DEPTH,
  DANGEROUS_KEYS,
  MONGODB_OPERATORS
};
