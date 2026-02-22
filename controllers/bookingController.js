/**
 * Booking Controller
 *
 * HTTP request handlers for nurse/physiotherapist booking operations
 * Thin layer that delegates to bookingService
 */

const bookingService = require('../services/bookingService');
const { HTTP_STATUS } = require('../constants');
const responseHelper = require('../utils/responseHelper');

/**
 * @desc    Create a new booking
 * @route   POST /api/bookings
 * @access  Private (Patient)
 */
exports.createBooking = async (req, res, next) => {
  try {
    const booking = await bookingService.createBooking(req.body, req.user.id);

    responseHelper.sendCreated(res, { booking }, 'Booking created successfully');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get booking by ID
 * @route   GET /api/bookings/:id
 * @access  Private (Patient/Provider/Admin)
 */
exports.getBooking = async (req, res, next) => {
  try {
    const booking = await bookingService.getBookingById(req.params.id, req.user._id.toString(), req.user.role);

    responseHelper.sendSuccess(res, { booking }, 'Booking fetched successfully');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get all bookings (admin) or filtered bookings
 * @route   GET /api/bookings
 * @access  Private (Admin)
 */
exports.getAllBookings = async (req, res, next) => {
  try {
    const {
      page,
      limit,
      status,
      serviceType,
      startDate,
      endDate
    } = req.query;

    // Build filters
    const filters = {};
    if (status) filters.status = status;
    if (serviceType) filters.serviceType = serviceType;
    if (startDate || endDate) {
      filters.scheduledDate = {};
      if (startDate) filters.scheduledDate.$gte = new Date(startDate);
      if (endDate) filters.scheduledDate.$lte = new Date(endDate);
    }

    const options = {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20
    };

    const result = await bookingService.getAllBookings(filters, options);

    responseHelper.sendPaginated(
      res,
      result.bookings,
      result.pagination,
      'Bookings fetched successfully'
    );
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get patient's bookings
 * @route   GET /api/bookings/patient/me
 * @access  Private (Patient)
 */
exports.getMyBookings = async (req, res, next) => {
  try {
    const { page, limit, status } = req.query;

    const filters = {};
    if (status) filters.status = status;

    const options = {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20
    };

    const result = await bookingService.getPatientBookings(req.user.id, options);

    responseHelper.sendPaginated(
      res,
      result.bookings,
      result.pagination,
      'Your bookings fetched successfully'
    );
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get provider's bookings
 * @route   GET /api/bookings/provider/me
 * @access  Private (Nurse/Physiotherapist)
 */
exports.getProviderBookings = async (req, res, next) => {
  try {
    const { page, limit, status } = req.query;

    const filters = {};
    if (status) filters.status = status;

    const options = {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20
    };

    const result = await bookingService.getProviderBookings(req.user.id, options);

    responseHelper.sendPaginated(
      res,
      result.bookings,
      result.pagination,
      'Your assigned bookings fetched successfully'
    );
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Assign provider to booking
 * @route   PUT /api/bookings/:id/assign
 * @access  Private (Admin)
 */
exports.assignProvider = async (req, res, next) => {
  try {
    const { providerId } = req.body;

    if (!providerId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Provider ID is required'
      });
    }

    const booking = await bookingService.assignProvider(req.params.id, providerId);

    responseHelper.sendSuccess(res, { booking }, 'Provider assigned successfully');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Update booking status
 * @route   PUT /api/bookings/:id/status
 * @access  Private (Provider/Admin)
 */
exports.updateStatus = async (req, res, next) => {
  try {
    const { status, note } = req.body;

    if (!status) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Status is required'
      });
    }

    const booking = await bookingService.updateStatus(
      req.params.id,
      status,
      req.user.id,
      note
    );

    responseHelper.sendSuccess(res, { booking }, 'Booking status updated successfully');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Start service (mark as in progress)
 * @route   PUT /api/bookings/:id/start
 * @access  Private (Provider)
 */
exports.startService = async (req, res, next) => {
  try {
    const booking = await bookingService.updateStatus(
      req.params.id,
      'IN_PROGRESS',
      req.user.id,
      'Service started'
    );

    responseHelper.sendSuccess(res, { booking }, 'Service started successfully');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Complete service with report
 * @route   PUT /api/bookings/:id/complete
 * @access  Private (Provider)
 */
exports.completeService = async (req, res, next) => {
  try {
    const booking = await bookingService.completeService(
      req.params.id,
      req.user.id,
      req.body
    );

    responseHelper.sendSuccess(res, { booking }, 'Service completed successfully');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Add rating and review
 * @route   POST /api/bookings/:id/review
 * @access  Private (Patient)
 */
exports.addReview = async (req, res, next) => {
  try {
    const { stars, comment } = req.body;

    if (!stars || stars < 1 || stars > 5) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Rating must be between 1 and 5 stars'
      });
    }

    const booking = await bookingService.addReview(
      req.params.id,
      req.user.id,
      { stars, comment }
    );

    responseHelper.sendSuccess(res, { booking }, 'Review added successfully');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Cancel booking
 * @route   PUT /api/bookings/:id/cancel
 * @access  Private (Patient/Provider/Admin)
 */
exports.cancelBooking = async (req, res, next) => {
  try {
    const { reason } = req.body;

    if (!reason) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Cancellation reason is required'
      });
    }

    const booking = await bookingService.cancelBooking(
      req.params.id,
      req.user.id,
      reason
    );

    responseHelper.sendSuccess(res, { booking }, 'Booking cancelled successfully');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get booking statistics
 * @route   GET /api/bookings/stats/overview
 * @access  Private (Admin)
 */
exports.getBookingStats = async (req, res, next) => {
  try {
    const { startDate, endDate, serviceType } = req.query;

    const filters = {};
    if (startDate || endDate) {
      filters.scheduledDate = {};
      if (startDate) filters.scheduledDate.$gte = new Date(startDate);
      if (endDate) filters.scheduledDate.$lte = new Date(endDate);
    }
    if (serviceType) filters.serviceType = serviceType;

    const stats = await bookingService.getBookingStats(filters);

    responseHelper.sendSuccess(res, { stats }, 'Statistics fetched successfully');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Confirm booking (provider accepts assignment)
 * @route   PUT /api/bookings/:id/confirm
 * @access  Private (Provider)
 */
exports.confirmBooking = async (req, res, next) => {
  try {
    const booking = await bookingService.updateStatus(
      req.params.id,
      'CONFIRMED',
      req.user.id,
      'Provider confirmed the booking'
    );

    responseHelper.sendSuccess(res, { booking }, 'Booking confirmed successfully');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Mark provider as en route
 * @route   PUT /api/bookings/:id/en-route
 * @access  Private (Provider)
 */
exports.markEnRoute = async (req, res, next) => {
  try {
    const booking = await bookingService.updateStatus(
      req.params.id,
      'EN_ROUTE',
      req.user.id,
      'Provider is on the way'
    );

    responseHelper.sendSuccess(res, { booking }, 'Status updated to en route');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};
