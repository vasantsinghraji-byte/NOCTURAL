describe('enhanced rate limiter user keys', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  function loadWithRateLimitMock() {
    const capturedConfigs = [];
    const mockRateLimit = jest.fn((config) => {
      capturedConfigs.push(config);
      return jest.fn((_req, _res, next) => next());
    });
    mockRateLimit.ipKeyGenerator = jest.fn(ip => `ip-key:${ip}`);

    jest.doMock('express-rate-limit', () => mockRateLimit);
    jest.doMock('rate-limit-redis', () => jest.fn());
    jest.doMock('ioredis', () => jest.fn());
    jest.doMock('../../../utils/logger', () => ({
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn()
    }));
    jest.doMock('../../../utils/monitoring', () => ({
      trackEvent: jest.fn(),
      triggerAlert: jest.fn()
    }));

    const rateLimitEnhanced = require('../../../middleware/rateLimitEnhanced');
    return { capturedConfigs, mockRateLimit, rateLimitEnhanced };
  }

  it('passes configured keyGenerator options through to express-rate-limit', () => {
    process.env.NODE_ENV = 'test';
    process.env.RATE_LIMIT_ENABLED = 'false';

    const { capturedConfigs, rateLimitEnhanced } = loadWithRateLimitMock();
    const customKeyGenerator = jest.fn(() => 'custom-key');

    rateLimitEnhanced.createRateLimiter({
      windowMs: 1000,
      max: 1,
      message: 'custom limit',
      keyGenerator: customKeyGenerator
    });

    expect(capturedConfigs[capturedConfigs.length - 1].keyGenerator).toBe(customKeyGenerator);
  });

  it('keys built-in user scoped limiters by authenticated user and falls back with ipKeyGenerator', () => {
    process.env.NODE_ENV = 'test';
    process.env.RATE_LIMIT_ENABLED = 'false';

    const { capturedConfigs, mockRateLimit } = loadWithRateLimitMock();
    const uploadConfig = capturedConfigs.find(config => (
      config.message.error === 'Too many file uploads, please try again later'
    ));

    expect(uploadConfig.keyGenerator({
      user: { _id: 'user-123' },
      ip: '2001:db8::1'
    })).toBe('upload:user:user-123');

    expect(uploadConfig.keyGenerator({
      ip: '2001:db8::1'
    })).toBe('upload:ip:ip-key:2001:db8::1');
    expect(mockRateLimit.ipKeyGenerator).toHaveBeenCalledWith('2001:db8::1');
  });

  it('requires Redis-backed rate limits in production when rate limiting is enabled', () => {
    process.env.NODE_ENV = 'production';
    process.env.RATE_LIMIT_ENABLED = 'true';
    process.env.REDIS_ENABLED = 'true';
    delete process.env.REDIS_URL;

    expect(() => loadWithRateLimitMock()).toThrow('REDIS_URL is required for production rate limiting');
  });

  it('allows production startup with memory rate limits when Redis is explicitly disabled', () => {
    process.env.NODE_ENV = 'production';
    process.env.RATE_LIMIT_ENABLED = 'true';
    process.env.REDIS_ENABLED = 'false';
    delete process.env.REDIS_URL;

    expect(() => loadWithRateLimitMock()).not.toThrow();
  });
});
