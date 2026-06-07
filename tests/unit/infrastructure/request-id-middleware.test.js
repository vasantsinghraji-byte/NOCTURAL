jest.mock('crypto', () => ({
  randomUUID: jest.fn()
}));

const crypto = require('crypto');
const requestId = require('../../../middleware/requestId');

describe('Request ID middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should generate and attach a requestId when the header is absent', () => {
    crypto.randomUUID.mockReturnValue('generated-request-id');

    const req = {
      headers: {}
    };
    const res = {
      locals: {},
      setHeader: jest.fn()
    };
    const next = jest.fn();

    requestId(req, res, next);

    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(req.requestId).toBe('generated-request-id');
    expect(res.locals.requestId).toBe('generated-request-id');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'generated-request-id');
    expect(next).toHaveBeenCalledTimes(1);
  });
});
