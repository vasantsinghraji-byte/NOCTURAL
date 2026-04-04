const mockRedisClient = {
  status: 'ready',
  on: jest.fn(),
  sendCommand: jest.fn(),
  hSet: jest.fn(),
  expire: jest.fn(),
  set: jest.fn(),
  get: jest.fn(),
  hGet: jest.fn(),
  keys: jest.fn()
};

jest.mock('../../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  logSecurity: jest.fn()
}));

jest.mock('../../../utils/monitoring', () => ({
  trackSuspiciousActivity: jest.fn()
}));

jest.mock('../../../config/redis', () => ({
  getRedisClient: jest.fn(async () => mockRedisClient)
}));

const rateLimitFactory = jest.fn((config) => config);
jest.mock('express-rate-limit', () => rateLimitFactory);

const redisStoreFactory = jest.fn((options) => ({ options }));
jest.mock('rate-limit-redis', () => redisStoreFactory);

describe('Rate Limit Redis Integration', () => {
  const originalRedisEnabled = process.env.REDIS_ENABLED;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.REDIS_ENABLED = 'true';
    mockRedisClient.status = 'ready';
  });

  afterEach(() => {
    jest.resetModules();
    process.env.REDIS_ENABLED = originalRedisEnabled;
  });

  it('should configure RedisStore with a lazy sendCommand backed by getRedisClient()', async () => {
    jest.isolateModules(() => {
      require('../../../config/rateLimit');
    });

    const rateLimitConfig = rateLimitFactory.mock.calls[0][0];
    const storeOptions = redisStoreFactory.mock.calls[0][0];

    expect(redisStoreFactory).toHaveBeenCalled();
    expect(rateLimitConfig.passOnStoreError).toBe(true);

    mockRedisClient.sendCommand.mockResolvedValue('PONG');

    const result = await storeOptions.sendCommand('PING');

    expect(result).toBe('PONG');
    expect(mockRedisClient.sendCommand).toHaveBeenCalledWith(['PING']);
  });
});
