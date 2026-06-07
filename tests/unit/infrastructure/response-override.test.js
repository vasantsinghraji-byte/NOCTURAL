jest.mock('../../../utils/logger', () => ({
  error: jest.fn()
}));

const logger = require('../../../utils/logger');
const { wrapResponseMethod } = require('../../../utils/responseOverride');

describe('response override helper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should still call the original response method when beforeCall throws', () => {
    const req = {
      requestId: 'req-before',
      method: 'GET',
      originalUrl: '/test/before'
    };

    const originalJson = jest.fn().mockReturnValue('sent');
    const res = {
      json: originalJson
    };

    wrapResponseMethod(res, 'json', {
      req,
      errorMessage: 'Override failed',
      beforeCall: () => {
        throw new Error('before failure');
      }
    });

    const result = res.json({ ok: true });

    expect(result).toBe('sent');
    expect(originalJson).toHaveBeenCalledWith({ ok: true });
    expect(logger.error).toHaveBeenCalledWith(
      'Override failed',
      expect.objectContaining({
        requestId: 'req-before',
        method: 'GET',
        path: '/test/before',
        responseMethod: 'json',
        error: 'before failure'
      })
    );
  });

  it('should still return the original response result when afterCall throws', () => {
    const req = {
      requestId: 'req-after',
      method: 'GET',
      originalUrl: '/test/after'
    };

    const originalJson = jest.fn().mockReturnValue('sent');
    const res = { json: originalJson };

    wrapResponseMethod(res, 'json', {
      req,
      errorMessage: 'Override failed',
      afterCall: () => {
        throw new Error('after failure');
      }
    });

    const payload = { ok: true };
    const result = res.json(payload);

    expect(result).toBe('sent');
    expect(originalJson).toHaveBeenCalledWith(payload);
    expect(logger.error).toHaveBeenCalledWith(
      'Override failed',
      expect.objectContaining({
        requestId: 'req-after',
        method: 'GET',
        path: '/test/after',
        responseMethod: 'json',
        error: 'after failure'
      })
    );
  });
});
