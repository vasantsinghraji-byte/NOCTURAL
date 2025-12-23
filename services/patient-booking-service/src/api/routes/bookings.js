/**
 * Booking Routes
 * Endpoints for booking operations
 */

const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { protect } = require('../middleware/patientAuth');

// All booking routes require authentication
router.use(protect);

/**
 * Booking CRUD operations
 */

// Create new booking
router.post('/', bookingController.createBooking.bind(bookingController));

// Get patient's bookings (with optional filters)
router.get('/', bookingController.getBookings.bind(bookingController));

// Get upcoming bookings
router.get('/upcoming', bookingController.getUpcomingBookings.bind(bookingController));

// Get booking history
router.get('/history', bookingController.getBookingHistory.bind(bookingController));

// Get specific booking
router.get('/:id', bookingController.getBookingById.bind(bookingController));

// Update booking
router.put('/:id', bookingController.updateBooking.bind(bookingController));

// Cancel booking
router.delete('/:id', bookingController.cancelBooking.bind(bookingController));

/**
 * Review operations
 */

// Add review to booking
router.post('/:id/review', bookingController.addReview.bind(bookingController));

module.exports = router;
