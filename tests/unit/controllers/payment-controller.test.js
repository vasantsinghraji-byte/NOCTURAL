jest.mock('../../../services/paymentService', () => ({
  createOrder: jest.fn(),
  verifyPayment: jest.fn(),
  handlePaymentFailure: jest.fn(),
  getPaymentStatus: jest.fn(),
  processRefund: jest.fn()
}));

jest.mock('../../../utils/responseHelper', () => ({
  sendSuccess: jest.fn(),
  sendBadRequest: jest.fn(),
  handleServiceError: jest.fn()
}));

const paymentService = require('../../../services/paymentService');
const responseHelper = require('../../../utils/responseHelper');
const paymentController = require('../../../controllers/paymentController');

const createRes = () => {
  const res = {
    status: jest.fn(),
    json: jest.fn()
  };

  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);

  return res;
};

describe('Payment Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should pass req.user.id to createOrder', async () => {
    const req = {
      body: { bookingId: 'booking123' },
      user: { id: 'patient123' }
    };
    const res = createRes();
    const result = { order: { id: 'order123' } };

    paymentService.createOrder.mockResolvedValue(result);

    await paymentController.createOrder(req, res);

    expect(paymentService.createOrder).toHaveBeenCalledWith('booking123', 'patient123');
    expect(responseHelper.sendSuccess).toHaveBeenCalledWith(
      res,
      result,
      'Payment order created successfully'
    );
  });

  it('should pass req.user.id to verifyPayment', async () => {
    const req = {
      body: {
        bookingId: 'booking123',
        razorpay_order_id: 'order123',
        razorpay_payment_id: 'payment123',
        razorpay_signature: 'signature123'
      },
      user: { id: 'patient123' }
    };
    const res = createRes();
    const result = { booking: { id: 'booking123', paymentStatus: 'PAID' } };

    paymentService.verifyPayment.mockResolvedValue(result);

    await paymentController.verifyPayment(req, res);

    expect(paymentService.verifyPayment).toHaveBeenCalledWith(req.body, 'patient123');
    expect(responseHelper.sendSuccess).toHaveBeenCalledWith(
      res,
      result,
      'Payment verified successfully'
    );
  });

  it('should pass req.user.id to handlePaymentFailure', async () => {
    const req = {
      body: {
        bookingId: 'booking123',
        error: { description: 'Gateway timeout' }
      },
      user: { id: 'patient123' }
    };
    const res = createRes();
    const result = { booking: { id: 'booking123', paymentStatus: 'FAILED' } };

    paymentService.handlePaymentFailure.mockResolvedValue(result);

    await paymentController.handlePaymentFailure(req, res);

    expect(paymentService.handlePaymentFailure).toHaveBeenCalledWith(
      'booking123',
      { description: 'Gateway timeout' },
      'patient123'
    );
    expect(responseHelper.sendSuccess).toHaveBeenCalledWith(
      res,
      result,
      'Payment failure recorded'
    );
  });

  it('should pass req.user.id to getPaymentStatus', async () => {
    const req = {
      params: { bookingId: 'booking123' },
      user: { id: 'patient123' }
    };
    const res = createRes();
    const result = { payment: { status: 'PENDING' } };

    paymentService.getPaymentStatus.mockResolvedValue(result);

    await paymentController.getPaymentStatus(req, res);

    expect(paymentService.getPaymentStatus).toHaveBeenCalledWith('booking123', 'patient123');
    expect(responseHelper.sendSuccess).toHaveBeenCalledWith(
      res,
      result,
      'Payment status fetched successfully'
    );
  });
});
