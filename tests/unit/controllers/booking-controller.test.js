jest.mock('../../../services/bookingService', () => ({
  createBooking: jest.fn(),
  getBookingById: jest.fn(),
  getPatientBookings: jest.fn(),
  getProviderBookings: jest.fn(),
  getAssignableProviders: jest.fn(),
  assignProvider: jest.fn(),
  updateStatus: jest.fn(),
  completeService: jest.fn(),
  addReview: jest.fn(),
  updateReview: jest.fn(),
  deleteReview: jest.fn(),
  cancelBooking: jest.fn()
}));

jest.mock('../../../utils/responseHelper', () => ({
  sendCreated: jest.fn(),
  sendSuccess: jest.fn(),
  sendPaginated: jest.fn(),
  sendBadRequest: jest.fn(),
  handleServiceError: jest.fn()
}));

const bookingService = require('../../../services/bookingService');
const responseHelper = require('../../../utils/responseHelper');
const bookingController = require('../../../controllers/bookingController');

const createRes = () => {
  const res = {
    status: jest.fn(),
    json: jest.fn()
  };

  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);

  return res;
};

const createReviewReq = (overrides = {}) => ({
  ...overrides,
  params: {
    id: 'booking123',
    ...(overrides.params || {})
  },
  body: {
    stars: 5,
    comment: 'Excellent service',
    ...(overrides.body || {})
  },
  user: {
    id: 'patient123',
    ...(overrides.user || {})
  }
});

const createControllerContext = (booking = { _id: 'booking123' }) => ({
  res: createRes(),
  next: jest.fn(),
  booking
});

describe('Booking Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should pass req.user.id to createBooking', async () => {
    const req = {
      body: { serviceType: 'INJECTION' },
      user: { id: 'patient123' }
    };
    const { res, next, booking } = createControllerContext();

    bookingService.createBooking.mockResolvedValue(booking);

    await bookingController.createBooking(req, res, next);

    expect(bookingService.createBooking).toHaveBeenCalledWith(req.body, 'patient123');
    expect(responseHelper.sendCreated).toHaveBeenCalledWith(
      res,
      { booking },
      'Booking created successfully'
    );
  });

  it('should pass req.user.id and req.user.role to getBooking', async () => {
    const req = {
      params: { id: 'booking123' },
      user: {
        id: 'user123',
        role: 'patient'
      }
    };
    const { res, next, booking } = createControllerContext();

    bookingService.getBookingById.mockResolvedValue(booking);

    await bookingController.getBooking(req, res, next);

    expect(bookingService.getBookingById).toHaveBeenCalledWith('booking123', 'user123', 'patient');
    expect(responseHelper.sendSuccess).toHaveBeenCalledWith(
      res,
      { booking },
      'Booking fetched successfully'
    );
  });

  it('should pass req.user.id to getMyBookings', async () => {
    const req = {
      query: { page: '2', limit: '10' },
      user: { id: 'patient123' }
    };
    const res = createRes();
    const next = jest.fn();
    const result = { bookings: [{ _id: 'booking1' }], pagination: { total: 1, page: 2, pages: 1, limit: 10 } };

    bookingService.getPatientBookings.mockResolvedValue(result);

    await bookingController.getMyBookings(req, res, next);

    expect(bookingService.getPatientBookings).toHaveBeenCalledWith('patient123', { page: 2, limit: 10 });
    expect(responseHelper.sendPaginated).toHaveBeenCalledWith(
      res,
      result.bookings,
      result.pagination,
      'Your bookings fetched successfully'
    );
  });

  it('should pass req.user.id to getProviderBookings', async () => {
    const req = {
      query: { page: '1', limit: '5' },
      user: { id: 'provider123' }
    };
    const res = createRes();
    const next = jest.fn();
    const result = { bookings: [{ _id: 'booking1' }], pagination: { total: 1, page: 1, pages: 1, limit: 5 } };

    bookingService.getProviderBookings.mockResolvedValue(result);

    await bookingController.getProviderBookings(req, res, next);

    expect(bookingService.getProviderBookings).toHaveBeenCalledWith('provider123', { page: 1, limit: 5 });
    expect(responseHelper.sendPaginated).toHaveBeenCalledWith(
      res,
      result.bookings,
      result.pagination,
      'Your assigned bookings fetched successfully'
    );
  });

  it('should pass req.user.id to assignProvider as the acting admin', async () => {
    const req = {
      params: { id: 'booking123' },
      body: { providerId: 'provider123' },
      user: { id: 'admin123', role: 'admin' }
    };
    const { res, next, booking } = createControllerContext();

    bookingService.assignProvider.mockResolvedValue(booking);

    await bookingController.assignProvider(req, res, next);

    expect(bookingService.assignProvider).toHaveBeenCalledWith('booking123', 'provider123', 'admin123');
    expect(responseHelper.sendSuccess).toHaveBeenCalledWith(
      res,
      { booking },
      'Provider assigned successfully'
    );
  });

  it('should return assignable providers for admin booking assignment', async () => {
    const req = {
      user: { id: 'admin123', role: 'admin' }
    };
    const res = createRes();
    const next = jest.fn();
    const providers = [{ _id: 'provider123', name: 'Nurse One' }];

    bookingService.getAssignableProviders.mockResolvedValue(providers);

    await bookingController.getAssignableProviders(req, res, next);

    expect(bookingService.getAssignableProviders).toHaveBeenCalledWith();
    expect(responseHelper.sendSuccess).toHaveBeenCalledWith(
      res,
      { providers },
      'Assignable providers fetched successfully'
    );
  });

  it('should pass req.user.id and req.user.role to updateStatus', async () => {
    const req = {
      params: { id: 'booking123' },
      body: { status: 'CANCELLED', note: 'Unable to reach patient' },
      user: { id: 'provider123', role: 'physiotherapist' }
    };
    const { res, next, booking } = createControllerContext();

    bookingService.updateStatus.mockResolvedValue(booking);

    await bookingController.updateStatus(req, res, next);

    expect(bookingService.updateStatus).toHaveBeenCalledWith(
      'booking123',
      'CANCELLED',
      'provider123',
      'Unable to reach patient',
      'physiotherapist'
    );
  });

  it('should pass req.user.id and req.user.role to startService', async () => {
    const req = {
      params: { id: 'booking123' },
      user: { id: 'provider123', role: 'nurse' }
    };
    const { res, next, booking } = createControllerContext();

    bookingService.updateStatus.mockResolvedValue(booking);

    await bookingController.startService(req, res, next);

    expect(bookingService.updateStatus).toHaveBeenCalledWith(
      'booking123',
      'IN_PROGRESS',
      'provider123',
      'Service started',
      'nurse'
    );
  });

  it('should pass req.user.id to completeService', async () => {
    const req = {
      params: { id: 'booking123' },
      body: { observations: 'Stable' },
      user: { id: 'provider123', role: 'nurse' }
    };
    const { res, next, booking } = createControllerContext();

    bookingService.completeService.mockResolvedValue(booking);

    await bookingController.completeService(req, res, next);

    expect(bookingService.completeService).toHaveBeenCalledWith(
      'booking123',
      'provider123',
      req.body
    );
  });

  it('should pass req.user.id to addReview', async () => {
    const req = createReviewReq();
    const { res, next, booking } = createControllerContext();

    bookingService.addReview.mockResolvedValue(booking);

    await bookingController.addReview(req, res, next);

    expect(bookingService.addReview).toHaveBeenCalledWith(
      'booking123',
      'patient123',
      { stars: 5, comment: 'Excellent service' }
    );
  });

  it('should pass req.user.id to updateReview', async () => {
    const req = createReviewReq({
      body: { stars: 4, comment: 'Updated review' }
    });
    const { res, next, booking } = createControllerContext();

    bookingService.updateReview.mockResolvedValue(booking);

    await bookingController.updateReview(req, res, next);

    expect(bookingService.updateReview).toHaveBeenCalledWith(
      'booking123',
      'patient123',
      { stars: 4, comment: 'Updated review' }
    );
    expect(responseHelper.sendSuccess).toHaveBeenCalledWith(
      res,
      { booking },
      'Review updated successfully'
    );
  });

  it('should reject updateReview when stars are outside the allowed range', async () => {
    const req = createReviewReq({
      body: { stars: 0, comment: 'Invalid review' }
    });
    const { res, next } = createControllerContext();

    await bookingController.updateReview(req, res, next);

    expect(responseHelper.sendBadRequest).toHaveBeenCalledWith(
      res,
      'Rating must be between 1 and 5 stars'
    );
    expect(bookingService.updateReview).not.toHaveBeenCalled();
  });

  it('should pass req.user.id to deleteReview', async () => {
    const req = createReviewReq();
    const { res, next, booking } = createControllerContext();

    bookingService.deleteReview.mockResolvedValue(booking);

    await bookingController.deleteReview(req, res, next);

    expect(bookingService.deleteReview).toHaveBeenCalledWith('booking123', 'patient123');
    expect(responseHelper.sendSuccess).toHaveBeenCalledWith(
      res,
      { booking },
      'Review deleted successfully'
    );
  });

  it('should delegate deleteReview service failures to responseHelper.handleServiceError', async () => {
    const req = createReviewReq();
    const { res, next } = createControllerContext();
    const error = new Error('Review not found');

    bookingService.deleteReview.mockRejectedValue(error);

    await bookingController.deleteReview(req, res, next);

    expect(responseHelper.handleServiceError).toHaveBeenCalledWith(error, res, next);
    expect(responseHelper.sendSuccess).not.toHaveBeenCalled();
  });

  describe('review route happy-path response contract', () => {
    it('should return the addReview success payload and message', async () => {
      const req = createReviewReq();
      const { res, next, booking } = createControllerContext();

      bookingService.addReview.mockResolvedValue(booking);

      await bookingController.addReview(req, res, next);

      expect(responseHelper.sendSuccess).toHaveBeenCalledWith(
        res,
        { booking },
        'Review added successfully'
      );
    });

    it('should return the updateReview success payload and message', async () => {
      const req = createReviewReq({
        body: { stars: 4, comment: 'Updated review' }
      });
      const { res, next, booking } = createControllerContext();

      bookingService.updateReview.mockResolvedValue(booking);

      await bookingController.updateReview(req, res, next);

      expect(responseHelper.sendSuccess).toHaveBeenCalledWith(
        res,
        { booking },
        'Review updated successfully'
      );
    });

    it('should return the deleteReview success payload and message', async () => {
      const req = createReviewReq();
      const { res, next, booking } = createControllerContext();

      bookingService.deleteReview.mockResolvedValue(booking);

      await bookingController.deleteReview(req, res, next);

      expect(responseHelper.sendSuccess).toHaveBeenCalledWith(
        res,
        { booking },
        'Review deleted successfully'
      );
    });
  });

  it('should pass req.user.id and req.user.role to cancelBooking', async () => {
    const req = {
      params: { id: 'booking123' },
      body: { reason: 'Need to reschedule' },
      user: { id: 'patient123', role: 'patient' }
    };
    const { res, next, booking } = createControllerContext();

    bookingService.cancelBooking.mockResolvedValue(booking);

    await bookingController.cancelBooking(req, res, next);

    expect(bookingService.cancelBooking).toHaveBeenCalledWith(
      'booking123',
      'patient123',
      'Need to reschedule',
      'patient'
    );
  });

  it('should pass req.user.id and req.user.role to confirmBooking', async () => {
    const req = {
      params: { id: 'booking123' },
      user: { id: 'provider123', role: 'nurse' }
    };
    const { res, next, booking } = createControllerContext();

    bookingService.updateStatus.mockResolvedValue(booking);

    await bookingController.confirmBooking(req, res, next);

    expect(bookingService.updateStatus).toHaveBeenCalledWith(
      'booking123',
      'CONFIRMED',
      'provider123',
      'Provider confirmed the booking',
      'nurse'
    );
  });

  it('should pass req.user.id and req.user.role to markEnRoute', async () => {
    const req = {
      params: { id: 'booking123' },
      user: { id: 'provider123', role: 'nurse' }
    };
    const { res, next, booking } = createControllerContext();

    bookingService.updateStatus.mockResolvedValue(booking);

    await bookingController.markEnRoute(req, res, next);

    expect(bookingService.updateStatus).toHaveBeenCalledWith(
      'booking123',
      'EN_ROUTE',
      'provider123',
      'Provider is on the way',
      'nurse'
    );
  });
});
