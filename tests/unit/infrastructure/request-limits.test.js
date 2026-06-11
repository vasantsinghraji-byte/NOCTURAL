describe('Centralized request limits', () => {
  const originalMaxContentLength = process.env.MAX_CONTENT_LENGTH;

  afterEach(() => {
    if (originalMaxContentLength === undefined) {
      delete process.env.MAX_CONTENT_LENGTH;
    } else {
      process.env.MAX_CONTENT_LENGTH = originalMaxContentLength;
    }
    jest.resetModules();
  });

  it('defaults the global content-length guard to 10 MB', () => {
    delete process.env.MAX_CONTENT_LENGTH;
    jest.resetModules();

    const { MAX_CONTENT_LENGTH } = require('../../../config/requestLimits');

    expect(MAX_CONTENT_LENGTH).toBe(10 * 1024 * 1024);
  });

  it('honors a positive MAX_CONTENT_LENGTH override', () => {
    process.env.MAX_CONTENT_LENGTH = String(12 * 1024 * 1024);
    jest.resetModules();

    const { MAX_CONTENT_LENGTH } = require('../../../config/requestLimits');

    expect(MAX_CONTENT_LENGTH).toBe(12 * 1024 * 1024);
  });

  it('falls back to 10 MB for an invalid override', () => {
    process.env.MAX_CONTENT_LENGTH = 'invalid';
    jest.resetModules();

    const { MAX_CONTENT_LENGTH } = require('../../../config/requestLimits');

    expect(MAX_CONTENT_LENGTH).toBe(10 * 1024 * 1024);
  });
});
