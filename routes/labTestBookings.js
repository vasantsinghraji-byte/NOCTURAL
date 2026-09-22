/**
 * Lab Test Booking Routes
 *
 * Booking creation, assignment, tracking, and report delivery
 */

const express = require('express');
const router = express.Router();
const { validate } = require('../middleware/validation');
const { protect, authorize } = require('../middleware/auth');
const { protectPatient, protectBoth } = require('../middleware/patientAuth');
const {
  createBooking,
  getBooking,
  getMyBookings,
  getPhlebotomistBookings,
  assignPhlebotomist,
  updateSampleStatus,
  uploadReport,
  cancelBooking
} = require('../controllers/labTestBookingController');
const {
  bookLabTestValidation,
  updateSampleStatusValidation
} = require('../validators/labTestValidator');

// Patient routes
router.post('/', protectPatient, bookLabTestValidation, validate, createBooking);
router.get('/my-bookings', protectPatient, getMyBookings);

// Phlebotomist routes
router.get(
  '/phlebotomist-tasks',
  protect,
  authorize('phlebotomist', 'medical_staff', 'nurse', 'admin', 'platform_admin'),
  getPhlebotomistBookings
);

// Admin assignment
router.patch('/:id/assign', protect, authorize('admin', 'platform_admin'), assignPhlebotomist);

// Status and report routes
router.patch(
  '/:id/status',
  protect,
  authorize('phlebotomist', 'medical_staff', 'admin', 'platform_admin'),
  updateSampleStatusValidation,
  validate,
  updateSampleStatus
);

router.post(
  '/:id/report',
  protect,
  authorize('doctor', 'admin', 'platform_admin'),
  uploadReport
);

// Booking detail & cancellation (accessible by both patient and provider/admin)
router.get('/:id', protectBoth, getBooking);
router.patch('/:id/cancel', protectBoth, cancelBooking);

module.exports = router;
