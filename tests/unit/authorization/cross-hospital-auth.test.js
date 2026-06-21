/**
 * Cross-Hospital Authorization Tests
 *
 * Verifies tenant-scoping on admin mutations so one hospital admin cannot
 * read, alter, or reference another hospital's records:
 * - ShiftSeries create binds hospital server-side; mutations scope by hospital
 * - Earning create binds hospital and validates referenced duty/application/user
 * - Earning payment-status is scoped to the admin's hospital
 *
 * Route handlers are invoked directly (no DB) using the mock req/res helpers.
 * Mock implementations are (re)set in beforeEach because jest is configured
 * with resetMocks: true.
 */

jest.mock('../../../middleware/auth', () => ({
  protect: jest.fn(),
  authorize: jest.fn(() => jest.fn())
}));

jest.mock('../../../models/shiftSeries', () => {
  const ShiftSeries = jest.fn();
  ShiftSeries.findOne = jest.fn();
  ShiftSeries.findById = jest.fn();
  ShiftSeries.createDutiesFromSeries = jest.fn();
  ShiftSeries.prototype.save = jest.fn();
  return ShiftSeries;
});

jest.mock('../../../models/earning', () => {
  const Earning = jest.fn();
  Earning.findById = jest.fn();
  Earning.findOne = jest.fn();
  Earning.prototype.generateInvoiceNumber = jest.fn();
  Earning.prototype.save = jest.fn();
  return Earning;
});

jest.mock('../../../models/duty', () => ({ findById: jest.fn() }));
jest.mock('../../../models/application', () => ({ findById: jest.fn() }));
jest.mock('../../../models/analytics', () => ({ DoctorAnalytics: {} }));

const ShiftSeries = require('../../../models/shiftSeries');
const Earning = require('../../../models/earning');
const Duty = require('../../../models/duty');
const Application = require('../../../models/application');
const shiftSeriesRouter = require('../../../routes/shiftSeries');
const earningsRouter = require('../../../routes/earnings');
const { mockRequest, mockResponse, mockNext } = require('../../helpers');

// Pull the final route handler (after protect/authorize) out of the router stack
function getHandler(router, method, routePath) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === routePath && l.route.methods[method]
  );
  if (!layer) {
    throw new Error(`Route ${method.toUpperCase()} ${routePath} not found`);
  }
  const handlers = layer.route.stack;
  return handlers[handlers.length - 1].handle;
}

describe('Cross-hospital authorization on admin mutations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ShiftSeries POST / (create)', () => {
    const handler = getHandler(shiftSeriesRouter, 'post', '/');

    it('binds the new series to the admin\'s hospital, ignoring the request body', async () => {
      const req = mockRequest({
        body: { hospital: 'Hospital EVIL', hospitalId: 'hospital-evil', title: 'Series' },
        user: { _id: 'adminA', hospital: 'Hospital A', hospitalId: 'hospital-a' }
      });
      const res = mockResponse();

      await handler(req, res, mockNext());

      expect(ShiftSeries).toHaveBeenCalledWith(
        expect.objectContaining({
          hospital: 'Hospital A',
          hospitalId: 'hospital-a',
          postedBy: 'adminA'
        })
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('returns 403 when the admin has no hospital assigned', async () => {
      const req = mockRequest({ body: {}, user: { _id: 'adminA' } });
      const res = mockResponse();

      await handler(req, res, mockNext());

      expect(res.status).toHaveBeenCalledWith(403);
      expect(ShiftSeries).not.toHaveBeenCalled();
    });
  });

  describe('ShiftSeries PUT /:id/applications/:appId', () => {
    const handler = getHandler(shiftSeriesRouter, 'put', '/:id/applications/:appId');

    it('returns 404 when the series belongs to another hospital', async () => {
      ShiftSeries.findOne.mockResolvedValue(null);

      const req = mockRequest({
        params: { id: 'series1', appId: 'app1' },
        body: { status: 'ACCEPTED' },
        user: { _id: 'adminB', hospital: 'Same Hospital Name', hospitalId: 'hospital-b' }
      });
      const res = mockResponse();

      await handler(req, res, mockNext());

      expect(ShiftSeries.findOne).toHaveBeenCalledWith({ _id: 'series1', hospitalId: 'hospital-b' });
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 403 when the admin has no hospital assigned', async () => {
      const req = mockRequest({
        params: { id: 'series1', appId: 'app1' },
        body: { status: 'ACCEPTED' },
        user: { _id: 'adminB' }
      });
      const res = mockResponse();

      await handler(req, res, mockNext());

      expect(res.status).toHaveBeenCalledWith(403);
      expect(ShiftSeries.findOne).not.toHaveBeenCalled();
    });
  });

  describe('ShiftSeries POST /:id/create-duties', () => {
    const handler = getHandler(shiftSeriesRouter, 'post', '/:id/create-duties');

    it('returns 404 and does not create duties for a series owned by another hospital', async () => {
      ShiftSeries.findOne.mockResolvedValue(null);

      const req = mockRequest({
        params: { id: 'series1' },
        user: { _id: 'adminB', hospital: 'Same Hospital Name', hospitalId: 'hospital-b' }
      });
      const res = mockResponse();

      await handler(req, res, mockNext());

      expect(ShiftSeries.findOne).toHaveBeenCalledWith({ _id: 'series1', hospitalId: 'hospital-b' });
      expect(res.status).toHaveBeenCalledWith(404);
      expect(ShiftSeries.createDutiesFromSeries).not.toHaveBeenCalled();
    });

    it('returns 403 when the admin has no hospital assigned', async () => {
      const req = mockRequest({ params: { id: 'series1' }, user: { _id: 'adminB' } });
      const res = mockResponse();

      await handler(req, res, mockNext());

      expect(res.status).toHaveBeenCalledWith(403);
      expect(ShiftSeries.findOne).not.toHaveBeenCalled();
      expect(ShiftSeries.createDutiesFromSeries).not.toHaveBeenCalled();
    });
  });

  describe('Earning POST / (create)', () => {
    const handler = getHandler(earningsRouter, 'post', '/');

    it('binds hospital and creates when all referenced records belong to the hospital', async () => {
      Duty.findById.mockResolvedValue({ _id: 'duty1', hospital: 'Hospital A', hospitalId: 'hospital-a' });
      Application.findById.mockResolvedValue({ duty: 'duty1', applicant: 'user1' });

      const req = mockRequest({
        body: {
          hospital: 'Hospital EVIL',
          hospitalId: 'hospital-evil',
          duty: 'duty1',
          application: 'app1',
          user: 'user1',
          totalAmount: 100
        },
        user: { _id: 'adminA', hospital: 'Hospital A', hospitalId: 'hospital-a' }
      });
      const res = mockResponse();

      await handler(req, res, mockNext());

      expect(Earning).toHaveBeenCalledWith(expect.objectContaining({
        hospital: 'Hospital A',
        hospitalId: 'hospital-a'
      }));
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('returns 403 when the referenced duty belongs to another hospital', async () => {
      Duty.findById.mockResolvedValue({
        _id: 'duty1',
        hospital: 'Same Hospital Name',
        hospitalId: 'hospital-b'
      });

      const req = mockRequest({
        body: { duty: 'duty1', application: 'app1', user: 'user1' },
        user: { _id: 'adminA', hospital: 'Same Hospital Name', hospitalId: 'hospital-a' }
      });
      const res = mockResponse();

      await handler(req, res, mockNext());

      expect(res.status).toHaveBeenCalledWith(403);
      expect(Earning).not.toHaveBeenCalled();
    });

    it('returns 400 when the referenced user does not match the application', async () => {
      Duty.findById.mockResolvedValue({ _id: 'duty1', hospital: 'Hospital A', hospitalId: 'hospital-a' });
      Application.findById.mockResolvedValue({ duty: 'duty1', applicant: 'someoneElse' });

      const req = mockRequest({
        body: { duty: 'duty1', application: 'app1', user: 'user1' },
        user: { _id: 'adminA', hospital: 'Hospital A', hospitalId: 'hospital-a' }
      });
      const res = mockResponse();

      await handler(req, res, mockNext());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(Earning).not.toHaveBeenCalled();
    });

    it('returns 403 when the admin has no hospital assigned', async () => {
      const req = mockRequest({
        body: { duty: 'duty1', application: 'app1', user: 'user1' },
        user: { _id: 'adminA' }
      });
      const res = mockResponse();

      await handler(req, res, mockNext());

      expect(res.status).toHaveBeenCalledWith(403);
      expect(Duty.findById).not.toHaveBeenCalled();
      expect(Earning).not.toHaveBeenCalled();
    });
  });

  describe('Earning PUT /:id/payment-status', () => {
    const handler = getHandler(earningsRouter, 'put', '/:id/payment-status');

    it('returns 403 when the earning belongs to another hospital', async () => {
      Earning.findOne.mockResolvedValue(null);

      const req = mockRequest({
        params: { id: 'e1' },
        body: { paymentStatus: 'PAID' },
        user: { _id: 'adminA', hospital: 'Same Hospital Name', hospitalId: 'hospital-a' }
      });
      const res = mockResponse();

      await handler(req, res, mockNext());

      expect(Earning.findOne).toHaveBeenCalledWith({ _id: 'e1', hospitalId: 'hospital-a' });
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('allows the update when the earning belongs to the admin\'s hospital', async () => {
      const save = jest.fn().mockResolvedValue(true);
      Earning.findOne.mockResolvedValue({
        _id: 'e1',
        hospital: 'Hospital A',
        hospitalId: 'hospital-a',
        paymentReminders: [],
        save
      });

      const req = mockRequest({
        params: { id: 'e1' },
        body: { paymentStatus: 'PAID' },
        user: { _id: 'adminA', hospital: 'Hospital A', hospitalId: 'hospital-a' }
      });
      const res = mockResponse();

      await handler(req, res, mockNext());

      expect(save).toHaveBeenCalled();
      expect(res.data).toMatchObject({ success: true });
    });
  });
});
