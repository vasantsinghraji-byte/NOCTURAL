/**
 * Patient Routes
 * Endpoints for patient registration, authentication, and profile management
 */

const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patientController');
const { protect } = require('../middleware/patientAuth');

/**
 * Public routes (no authentication required)
 */

// Register new patient
router.post('/register', patientController.register.bind(patientController));

// Login patient
router.post('/login', patientController.login.bind(patientController));

/**
 * Protected routes (authentication required)
 */

// Get patient profile
router.get('/profile', protect, patientController.getProfile.bind(patientController));

// Update patient profile
router.put('/profile', protect, patientController.updateProfile.bind(patientController));

// Update password
router.put('/password', protect, patientController.updatePassword.bind(patientController));

// Add saved address
router.post('/addresses', protect, patientController.addAddress.bind(patientController));

// Get patient statistics
router.get('/stats', protect, patientController.getStats.bind(patientController));

module.exports = router;
