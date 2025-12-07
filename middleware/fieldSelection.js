/**
 * Field Selection Middleware
 * Allows clients to request specific fields to reduce payload size
 */

const logger = require('../utils/logger');

/**
 * Parse field selection from query parameter
 * Supports formats:
 * - ?fields=name,email,role
 * - ?select=name,email,role
 * - ?fields=-password,-__v (exclusion)
 */
const parseFields = (req) => {
  const fieldsParam = req.query.fields || req.query.select;

  if (!fieldsParam) {
    return null;
  }

  // Handle comma-separated fields
  if (typeof fieldsParam === 'string') {
    return fieldsParam.split(',').map(f => f.trim()).filter(f => f);
  }

  // Handle array format
  if (Array.isArray(fieldsParam)) {
    return fieldsParam;
  }

  return null;
};

/**
 * Sensitive fields that should never be exposed
 */
const ALWAYS_EXCLUDE = [
  'password',
  'passwordHash',
  'salt',
  '__v',
  'resetPasswordToken',
  'resetPasswordExpire',
  'verificationToken',
  'twoFactorSecret'
];

/**
 * Build field selection string for Mongoose
 */
const buildFieldSelection = (fields, excludeSensitive = true) => {
  if (!fields || fields.length === 0) {
    // No specific fields requested - just exclude sensitive fields
    if (excludeSensitive) {
      return ALWAYS_EXCLUDE.map(f => `-${f}`).join(' ');
    }
    return null;
  }

  // Check if using exclusion mode (starts with -)
  const isExclusionMode = fields.some(f => f.startsWith('-'));

  let selection = fields.join(' ');

  // Always exclude sensitive fields
  if (excludeSensitive) {
    const sensitiveExclusions = ALWAYS_EXCLUDE.map(f => `-${f}`).join(' ');

    if (isExclusionMode) {
      // Already in exclusion mode, just add our sensitive fields
      selection = `${selection} ${sensitiveExclusions}`;
    } else {
      // Inclusion mode - just append exclusions
      selection = `${selection} ${sensitiveExclusions}`;
    }
  }

  return selection.trim();
};

/**
 * Field selection middleware for Mongoose queries
 */
const fieldSelectionMiddleware = (options = {}) => {
  const {
    excludeSensitive = true,
    allowAll = false,
    defaultFields = null
  } = options;

  return (req, res, next) => {
    const requestedFields = parseFields(req);

    // Build field selection
    const fields = requestedFields || defaultFields;
    const selection = buildFieldSelection(fields, excludeSensitive);

    // Attach to request for use in route handlers
    req.fieldSelection = {
      fields: selection,
      original: requestedFields,

      // Helper to apply to Mongoose query
      apply(query) {
        if (selection) {
          return query.select(selection);
        }
        return query;
      },

      // Helper to filter JavaScript objects
      filterObject(obj) {
        if (!requestedFields || !obj) {
          return obj;
        }

        // Handle exclusion mode
        if (requestedFields.some(f => f.startsWith('-'))) {
          const excludeFields = requestedFields
            .filter(f => f.startsWith('-'))
            .map(f => f.substring(1));

          const filtered = { ...obj };
          excludeFields.forEach(field => {
            delete filtered[field];
          });

          // Also exclude sensitive fields
          if (excludeSensitive) {
            ALWAYS_EXCLUDE.forEach(field => {
              delete filtered[field];
            });
          }

          return filtered;
        }

        // Handle inclusion mode
        const includeFields = requestedFields;
        const filtered = {};

        includeFields.forEach(field => {
          if (obj[field] !== undefined) {
            filtered[field] = obj[field];
          }
        });

        return filtered;
      },

      // Helper to filter arrays of objects
      filterArray(arr) {
        if (!Array.isArray(arr)) {
          return arr;
        }

        return arr.map(obj => this.filterObject(obj));
      }
    };

    next();
  };
};

/**
 * Apply field selection to response data
 * Intercepts res.json to automatically filter fields
 */
const autoFilterResponseMiddleware = (req, res, next) => {
  if (!req.fieldSelection || !req.fieldSelection.original) {
    return next();
  }

  const originalJson = res.json.bind(res);

  res.json = function(data) {
    // Only filter successful responses
    if (res.statusCode === 200 && data) {
      // Handle paginated responses
      if (data.data && Array.isArray(data.data)) {
        data.data = req.fieldSelection.filterArray(data.data);
      }
      // Handle single object responses
      else if (data.data && typeof data.data === 'object') {
        data.data = req.fieldSelection.filterObject(data.data);
      }
      // Handle direct array responses
      else if (Array.isArray(data)) {
        data = req.fieldSelection.filterArray(data);
      }
      // Handle direct object responses
      else if (typeof data === 'object' && !data.success) {
        data = req.fieldSelection.filterObject(data);
      }
    }

    return originalJson(data);
  };

  next();
};

/**
 * Projection builder for aggregation pipelines
 */
const buildAggregationProjection = (fields) => {
  if (!fields || fields.length === 0) {
    // Exclude sensitive fields
    const projection = {};
    ALWAYS_EXCLUDE.forEach(field => {
      projection[field] = 0;
    });
    return projection;
  }

  const isExclusionMode = fields.some(f => f.startsWith('-'));

  if (isExclusionMode) {
    // Exclusion mode
    const projection = {};
    fields
      .filter(f => f.startsWith('-'))
      .forEach(field => {
        projection[field.substring(1)] = 0;
      });

    // Add sensitive fields
    ALWAYS_EXCLUDE.forEach(field => {
      projection[field] = 0;
    });

    return projection;
  }

  // Inclusion mode
  const projection = {};
  fields.forEach(field => {
    projection[field] = 1;
  });

  return projection;
};

/**
 * Sparse fieldsets for JSON:API compliance
 * Format: ?fields[users]=name,email&fields[posts]=title
 */
const sparseFieldsetsMiddleware = (req, res, next) => {
  const sparseFields = {};

  // Parse sparse fieldsets from query
  Object.keys(req.query).forEach(key => {
    const match = key.match(/^fields\[(\w+)\]$/);
    if (match) {
      const resourceType = match[1];
      const fields = req.query[key].split(',').map(f => f.trim());
      sparseFields[resourceType] = fields;
    }
  });

  req.sparseFieldsets = sparseFields;
  next();
};

/**
 * Preset field configurations for common use cases
 */
const FIELD_PRESETS = {
  // User fields
  userPublic: ['_id', 'name', 'email', 'role', 'avatar', 'createdAt'],
  userPrivate: ['_id', 'name', 'email', 'role', 'phone', 'avatar', 'profile', 'createdAt'],
  userMinimal: ['_id', 'name', 'avatar'],

  // Duty fields
  dutyList: ['_id', 'title', 'facility', 'date', 'shift', 'salary', 'status', 'applicationsCount'],
  dutyDetail: ['_id', 'title', 'description', 'facility', 'date', 'shift', 'salary', 'requirements', 'status', 'postedBy', 'applicationsCount', 'createdAt'],

  // Application fields
  applicationList: ['_id', 'duty', 'applicant', 'status', 'appliedAt'],
  applicationDetail: ['_id', 'duty', 'applicant', 'status', 'coverLetter', 'appliedAt', 'updatedAt']
};

/**
 * Apply preset field selection
 */
const applyPreset = (presetName) => {
  return fieldSelectionMiddleware({
    defaultFields: FIELD_PRESETS[presetName]
  });
};

module.exports = {
  fieldSelectionMiddleware,
  autoFilterResponseMiddleware,
  sparseFieldsetsMiddleware,
  buildFieldSelection,
  buildAggregationProjection,
  parseFields,
  applyPreset,
  FIELD_PRESETS,
  ALWAYS_EXCLUDE
};
