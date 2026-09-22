/**
 * Staff Location & Availability Routes
 */

const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  updateLocation,
  updateAvailability,
  getNearbyStaff,
  getMyStatus
} = require('../controllers/staffLocationController');

const FIELD_STAFF_ROLES = ['medical_staff', 'nurse', 'physiotherapist', 'phlebotomist', 'doctor'];

// Staff status & live tracking
router.patch('/location', protect, authorize(...FIELD_STAFF_ROLES), updateLocation);
router.patch('/availability', protect, authorize(...FIELD_STAFF_ROLES), updateAvailability);
router.get('/me/status', protect, authorize(...FIELD_STAFF_ROLES), getMyStatus);

// Proximity queries
router.get('/nearby', getNearbyStaff);

module.exports = router;
