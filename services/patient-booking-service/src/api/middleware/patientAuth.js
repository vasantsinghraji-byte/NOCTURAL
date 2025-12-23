/**
 * Patient Authentication Middleware
 * Uses shared auth middleware factory with patient-specific user lookup
 */

const { createProtectMiddleware } = require('@nocturnal/shared');
const { Patient } = require('../../models');

/**
 * Get patient by ID (required by shared auth middleware)
 */
async function getPatientById(id) {
  return await Patient.findById(id);
}

/**
 * Create protect middleware for patient routes
 */
const protect = createProtectMiddleware(getPatientById);

module.exports = { protect };
