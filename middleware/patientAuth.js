/**
 * Patient Authentication Middleware
 *
 * Handles JWT authentication specifically for B2C patients
 * Separate from provider/admin authentication
 */

const jwt = require('jsonwebtoken');
const Patient = require('../models/patient');
const logger = require('../utils/logger');

/**
 * Protect patient routes - JWT verification for patients only
 */
exports.protectPatient = async (req, res, next) => {
  try {
    let token;

    // Get token from header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized - No token provided'
      });
    }

    // Verify JWT token with signature validation
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get patient from database
    const patient = await Patient.findById(decoded.id).select('-password');

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
    req.user = patient;
    req.patient = patient; // Also available as req.patient
    req.userType = 'patient'; // Identify user type

    next();
  } catch (error) {
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
    let token;

    // Get token from header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized - No token provided'
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Try to find user in Patient model first
    let user = await Patient.findById(decoded.id).select('-password');
    let userType = 'patient';

    // If not found in Patient, try User model
    if (!user) {
      const User = require('../models/user');
      user = await User.findById(decoded.id).select('-password');
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
    req.user = user;
    req.userType = userType;

    if (userType === 'patient') {
      req.patient = user;
    }

    next();
  } catch (error) {
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
