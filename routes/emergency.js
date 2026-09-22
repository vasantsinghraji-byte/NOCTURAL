/**
 * Emergency SOS Routes
 */

const express = require('express');
const router = express.Router();
const { validate } = require('../middleware/validation');
const { protect, authorize } = require('../middleware/auth');
const { protectPatient, protectBoth } = require('../middleware/patientAuth');
const {
  triggerEmergency,
  getActiveEmergency,
  getEmergency,
  acceptEmergency,
  updateEmergencyStatus,
  recordService,
  cancelEmergency
} = require('../controllers/emergencyController');
const {
  triggerEmergencyValidation,
  updateEmergencyStatusValidation
} = require('../validators/emergencyValidator');

// Patient SOS trigger
router.post('/', protectPatient, triggerEmergencyValidation, validate, triggerEmergency);
router.get('/active', protectBoth, getActiveEmergency);

// Staff actions
router.patch('/:id/accept', protect, authorize('medical_staff', 'nurse', 'doctor'), acceptEmergency);
router.patch(
  '/:id/status',
  protect,
  authorize('medical_staff', 'nurse', 'doctor', 'admin', 'platform_admin'),
  updateEmergencyStatusValidation,
  validate,
  updateEmergencyStatus
);
router.post('/:id/service-report', protect, authorize('medical_staff', 'nurse', 'doctor'), recordService);

// Shared (patient / staff)
router.get('/:id', protectBoth, getEmergency);
router.patch('/:id/cancel', protectBoth, cancelEmergency);

module.exports = router;
