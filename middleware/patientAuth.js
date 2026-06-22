/**
 * Patient Authentication Middleware
 *
 * Handles JWT authentication specifically for B2C patients
 * Separate from provider/admin authentication
 */

const Patient = require('../models/patient');
const { getAccessTokenFromRequest, verifyAccessToken } = require('./auth');
const { IDENTITY_TYPES } = require('../utils/authTokens');
const { normalizeObjectId } = require('../utils/safeMongo');

const requirePatientAccessToken = (req) => {
  const token = getAccessTokenFromRequest(req);
  if (!token) {
    const error = new Error('No patient access token provided');
    error.name = 'MissingAccessTokenError';
    throw error;
  }
  return token;
};

const normalizeAuthenticatedUser = (user) => {
  if (!user) return user;

  if (!user.id && user._id) {
    user.id = typeof user._id.toString === 'function' ? user._id.toString() : user._id;
  }

  return user;
};

/**
 * Protect patient routes - JWT verification for patients only
 */
exports.protectPatient = async (req, res, next) => {
  try {
    const token = requirePatientAccessToken(req);

    // Verify JWT token with signature validation
    const decoded = verifyAccessToken(token, IDENTITY_TYPES.PATIENT);

    // Get patient from database
    const patient = await Patient.findById(normalizeObjectId(decoded.id, 'token subject')).select('-password');

    if (!patient) {
      return res.status(401).json({
        success: false,
        message: 'Patient not found or token invalid'
      });
    }

    // Check if patient account is active
    if (patient.isActive === false) {
      return res.status(401).json({
        success: false,
        message: 'Account has been deactivated'
      });
    }

    // Check if password was changed after token was issued
    if (patient.passwordChangedAt && decoded.iat) {
      const changedAtSec = Math.floor(patient.passwordChangedAt.getTime() / 1000);
      if (decoded.iat < changedAtSec) {
        return res.status(401).json({
          success: false,
          message: 'Password recently changed - please login again'
        });
      }
    }

    // Attach patient to request as 'user' for consistency
    req.user = normalizeAuthenticatedUser(patient);
    req.patient = req.user; // Also available as req.patient
    req.userType = 'patient'; // Identify user type

    next();
  } catch (error) {
    if (error.name === 'MissingAccessTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Not authorized - No token provided'
      });
    }
    // Handle specific JWT errors
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token - authentication failed'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired - please login again'
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Not authorized'
    });
  }
};

/**
 * Dual authentication - checks both Patient and User models
 * Used for endpoints that can be accessed by both patients and providers
 */
exports.protectBoth = async (req, res, next) => {
  try {
    const token = requirePatientAccessToken(req);

    // Verify JWT token
    const decoded = verifyAccessToken(token);
    const decodedUserId = normalizeObjectId(decoded.id, 'token subject');

    // Try to find user in Patient model first
    let user = await Patient.findById(decodedUserId).select('-password');
    let userType = 'patient';

    // If not found in Patient, try User model
    if (!user) {
      const User = require('../models/user');
      user = await User.findById(decodedUserId).select('-password');
      userType = 'provider';
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found or token invalid'
      });
    }

    // Check if account is active
    if (user.isActive === false) {
      return res.status(401).json({
        success: false,
        message: 'Account has been deactivated'
      });
    }

    // Attach user to request
    req.user = normalizeAuthenticatedUser(user);
    req.userType = userType;

    if (userType === 'patient') {
      req.patient = req.user;
    }

    next();
  } catch (error) {
    if (error.name === 'MissingAccessTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Not authorized - No token provided'
      });
    }
    // Handle specific JWT errors
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token - authentication failed'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired - please login again'
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Not authorized'
    });
  }
};

module.exports = {
  protectPatient: exports.protectPatient,
  protectBoth: exports.protectBoth
};
