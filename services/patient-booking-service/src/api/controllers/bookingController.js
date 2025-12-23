/**
 * Booking Controller
 * Handles HTTP requests for booking operations
 */

const bookingService = require('../../services/bookingService');
const { createLogger } = require('@nocturnal/shared');

const logger = createLogger({ serviceName: 'patient-booking-service' });

class BookingController {
  /**
   * Create new booking
   * POST /api/bookings
   */
  async createBooking(req, res) {
    try {
      const booking = await bookingService.createBooking(req.user.id, req.body);

      res.status(201).json({
        success: true,
        message: 'Booking created successfully',
        data: booking
      });
    } catch (error) {
      logger.error('Error creating booking', {
        patientId: req.user?.id,
        error: error.message
      });

      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get patient bookings
   * GET /api/bookings
   */
  async getBookings(req, res) {
    try {
      const { status, page, limit } = req.query;

      const result = await bookingService.getPatientBookings(req.user.id, {
        status,
        page,
        limit
      });

      res.json({
        success: true,
        data: result.bookings,
        pagination: result.pagination
      });
    } catch (error) {
      logger.error('Error fetching bookings', {
        patientId: req.user?.id,
        error: error.message
      });

      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get booking by ID
   * GET /api/bookings/:id
   */
  async getBookingById(req, res) {
    try {
      const booking = await bookingService.getBookingById(
        req.params.id,
        req.user.id
      );

      res.json({
        success: true,
        data: booking
      });
    } catch (error) {
      logger.error('Error fetching booking', {
        bookingId: req.params.id,
        patientId: req.user?.id,
        error: error.message
      });

      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Update booking
   * PUT /api/bookings/:id
   */
  async updateBooking(req, res) {
    try {
      const booking = await bookingService.updateBooking(
        req.params.id,
        req.user.id,
        req.body
      );

      res.json({
        success: true,
        message: 'Booking updated successfully',
        data: booking
      });
    } catch (error) {
      logger.error('Error updating booking', {
        bookingId: req.params.id,
        patientId: req.user?.id,
        error: error.message
      });

      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Cancel booking
   * DELETE /api/bookings/:id
   */
  async cancelBooking(req, res) {
    try {
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a cancellation reason'
        });
      }

      const booking = await bookingService.cancelBooking(
        req.params.id,
        req.user.id,
        reason
      );

      res.json({
        success: true,
        message: 'Booking cancelled successfully',
        data: {
          booking,
          refundDetails: {
            refundAmount: booking.cancellation.refundAmount,
            cancellationFee: booking.cancellation.cancellationFee,
            refundEligible: booking.cancellation.refundEligible
          }
        }
      });
    } catch (error) {
      logger.error('Error cancelling booking', {
        bookingId: req.params.id,
        patientId: req.user?.id,
        error: error.message
      });

      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Add review
   * POST /api/bookings/:id/review
   */
  async addReview(req, res) {
    try {
      const { stars, review, punctuality, professionalism, skillLevel, communication } = req.body;

      if (!stars) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a star rating (1-5)'
        });
      }

      if (stars < 1 || stars > 5) {
        return res.status(400).json({
          success: false,
          message: 'Rating must be between 1 and 5'
        });
      }

      const booking = await bookingService.addReview(req.params.id, req.user.id, {
        stars,
        review,
        punctuality,
        professionalism,
        skillLevel,
        communication
      });

      res.status(201).json({
        success: true,
        message: 'Review added successfully',
        data: booking.rating
      });
    } catch (error) {
      logger.error('Error adding review', {
        bookingId: req.params.id,
        patientId: req.user?.id,
        error: error.message
      });

      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get upcoming bookings
   * GET /api/bookings/upcoming
   */
  async getUpcomingBookings(req, res) {
    try {
      const bookings = await bookingService.getUpcomingBookings(req.user.id);

      res.json({
        success: true,
        data: bookings
      });
    } catch (error) {
      logger.error('Error fetching upcoming bookings', {
        patientId: req.user?.id,
        error: error.message
      });

      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get booking history
   * GET /api/bookings/history
   */
  async getBookingHistory(req, res) {
    try {
      const { page, limit } = req.query;

      const result = await bookingService.getBookingHistory(
        req.user.id,
        page,
        limit
      );

      res.json({
        success: true,
        data: result.bookings,
        pagination: result.pagination
      });
    } catch (error) {
      logger.error('Error fetching booking history', {
        patientId: req.user?.id,
        error: error.message
      });

      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new BookingController();
