jest.mock('../../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../../config/redis', () => ({
  getRedisClient: jest.fn()
}));

const { rateLimitKeyGenerator } = require('../../../middleware/rateLimiter');

describe('rate limiter key generation', () => {
  it('uses authenticated user id when available', () => {
    expect(rateLimitKeyGenerator({
      user: { _id: '507f1f77bcf86cd799439011' },
      ip: '203.0.113.10'
    })).toBe('user:507f1f77bcf86cd799439011');
  });

  it('uses express-rate-limit IPv6-safe IP keys for anonymous requests', () => {
    expect(rateLimitKeyGenerator({
      ip: '2001:db8:abcd:0012:0000:0000:0000:0001'
    })).toBe('2001:db8:abcd::/56');
  });
});
