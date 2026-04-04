const express = require('express');
const request = require('supertest');

describe('Query Cache Redis Integration', () => {
  const loadQueryCacheModule = (mockRedisClient) => {
    let queryCacheModule;

    jest.isolateModules(() => {
      jest.doMock('../../../config/redis', () => ({
        getRedisClient: jest.fn(async () => mockRedisClient)
      }));

      jest.doMock('../../../utils/logger', () => ({
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
        debug: jest.fn(),
        logSecurity: jest.fn()
      }));

      queryCacheModule = require('../../../middleware/queryCache');
    });

    return queryCacheModule;
  };

  beforeEach(() => {
    jest.resetModules();
  });

  it('should serve cached GET responses from Redis', async () => {
    const mockRedisClient = {
      status: 'ready',
      get: jest.fn(),
      setex: jest.fn(),
      keys: jest.fn(),
      del: jest.fn(),
      info: jest.fn()
    };
    const { queryCache } = loadQueryCacheModule(mockRedisClient);

    mockRedisClient.get.mockResolvedValue(JSON.stringify({
      success: true,
      data: { source: 'redis' }
    }));

    const app = express();
    const handler = jest.fn((req, res) => {
      res.json({ success: true, data: { source: 'db' } });
    });

    app.get('/cached', queryCache(), handler);

    const response = await request(app).get('/cached');

    expect(response.status).toBe(200);
    expect(response.headers['x-cache']).toBe('HIT');
    expect(response.body).toEqual({
      success: true,
      data: { source: 'redis' }
    });
    expect(handler).not.toHaveBeenCalled();
    expect(mockRedisClient.get).toHaveBeenCalledTimes(1);
  });

  it('should invalidate matching cache keys through Redis', async () => {
    const mockRedisClient = {
      status: 'ready',
      get: jest.fn(),
      setex: jest.fn(),
      keys: jest.fn(),
      del: jest.fn(),
      info: jest.fn()
    };
    const { invalidateCache } = loadQueryCacheModule(mockRedisClient);

    mockRedisClient.keys.mockResolvedValue(['query:GET:/bookings:1', 'query:GET:/bookings:2']);
    mockRedisClient.del.mockResolvedValue(2);

    await invalidateCache('*:/api/bookings*');

    expect(mockRedisClient.keys).toHaveBeenCalledWith('query:*:/api/bookings**');
    expect(mockRedisClient.del).toHaveBeenCalledWith('query:GET:/bookings:1', 'query:GET:/bookings:2');
  });
});
