const express = require('express');
const request = require('supertest');

function createRateLimitMetrics(overrides = {}) {
  return {
    metrics: {
      auth: { total: 10, blocked: 2 },
      api: {
        total: 20,
        blocked: 4,
        endpoints: {
          '/api/v1/users/:objectId': 12,
          '/api/v1/payments': 3
        }
      },
      upload: { total: 5, blocked: 1 }
    },
    blocked: [],
    ...overrides
  };
}

function loadMetricsModule(metrics = createRateLimitMetrics()) {
  jest.resetModules();
  jest.doMock('../../../config/rateLimit', () => ({
    getRateLimitMetrics: jest.fn(() => metrics)
  }));
  jest.doMock('../../../middleware/auth', () => ({
    protect: (_req, _res, next) => next(),
    authorize: () => (_req, _res, next) => next()
  }));

  const metricsModule = require('../../../routes/admin/metrics');
  const app = express();
  app.use('/admin/metrics', metricsModule.router);
  return { app, metricsModule };
}

describe('admin metrics bounded analytics', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('renders rate-limit endpoint metrics when upstream endpoints are a plain object', async () => {
    const { app, metricsModule } = loadMetricsModule();

    const response = await request(app)
      .get('/admin/metrics/rate-limits')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.metrics.api.endpoints).toEqual([
      expect.objectContaining({ path: '/api/v1/users/:objectId', hits: 12 }),
      expect.objectContaining({ path: '/api/v1/payments', hits: 3 })
    ]);

    metricsModule.cleanup();
  });

  it('normalizes dynamic URLs and caps retained request analytics', async () => {
    const { app, metricsModule } = loadMetricsModule();

    for (let i = 0; i < 10050; i++) {
      const objectId = i.toString(16).padStart(24, '0').slice(-24);
      metricsModule.recordRequest({
        ip: '203.0.113.10',
        connection: {},
        originalUrl: `/api/v1/users/${objectId}?expand=profile`,
        method: 'GET',
        responseTime: i % 100
      }, false);
    }

    const response = await request(app)
      .get('/admin/metrics/rate-limits/detailed?timeRange=24h')
      .expect(200);

    expect(response.body.metrics.totalRequests).toBeLessThanOrEqual(10000);
    expect(Object.keys(response.body.endpoints)).toEqual(['/api/v1/users/:objectId']);
    expect(response.body.endpoints['/api/v1/users/:objectId']).toEqual(expect.objectContaining({
      total: expect.any(Number),
      avgResponseTime: expect.any(Number),
      p95ResponseTime: expect.any(Number)
    }));

    metricsModule.cleanup();
  });
});
