/**
 * Consultation Routes
 *
 * Telemedicine consultation requests, doctor queue, and clinical notes
 */

const express = require('express');
const router = express.Router();
const { validate } = require('../middleware/validation');
const { protect, authorize } = require('../middleware/auth');
const { protectPatient, protectBoth } = require('../middleware/patientAuth');
const {
  requestConsultation,
  getConsultation,
  getMyConsultations,
  getDoctorQueue,
  getDoctorConsultations,
  acceptConsultation,
  startConsultation,
  completeConsultation,
  sendChatMessage,
  cancelConsultation
} = require('../controllers/consultationController');
const {
  requestConsultationValidation,
  completeConsultationValidation,
  chatMessageValidation
} = require('../validators/consultationValidator');

// Patient routes
router.post('/', protectPatient, requestConsultationValidation, validate, requestConsultation);
router.get('/my-consultations', protectPatient, getMyConsultations);

// Doctor routes
router.get('/doctor-queue', protect, authorize('doctor', 'admin', 'platform_admin'), getDoctorQueue);
router.get('/doctor-history', protect, authorize('doctor', 'admin', 'platform_admin'), getDoctorConsultations);
router.patch('/:id/accept', protect, authorize('doctor'), acceptConsultation);
router.patch('/:id/start', protect, authorize('doctor'), startConsultation);
router.patch('/:id/complete', protect, authorize('doctor'), completeConsultationValidation, validate, completeConsultation);

// Shared routes (patient & doctor)
router.post('/:id/messages', protectBoth, chatMessageValidation, validate, sendChatMessage);
router.get('/:id', protectBoth, getConsultation);
router.patch('/:id/cancel', protectBoth, cancelConsultation);

module.exports = router;
