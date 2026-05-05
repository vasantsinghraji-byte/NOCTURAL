jest.mock('../../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
}));

const { corsConfig, detectSuspiciousRequests } = require('../../../middleware/security');
const logger = require('../../../utils/logger');

const buildReq = ({ body = {}, query = {}, url = '/api/test' } = {}) => ({
  body,
  query,
  url,
  method: 'POST',
  ip: '127.0.0.1',
  fingerprint: {},
  get: jest.fn().mockReturnValue('jest-agent')
});

const buildRes = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
  return res;
};

describe('security middleware suspicious request detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows legitimate Mongo update operators because sanitization handles keys', () => {
    const req = buildReq({
      body: {
        update: {
          $set: { status: 'PAID' },
          $push: { notes: 'follow up required' }
        }
      }
    });
    const res = buildRes();
    const next = jest.fn();

    detectSuspiciousRequests(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('allows normal dollar values in user-supplied strings', () => {
    const req = buildReq({
      body: {
        displayPrice: '$50',
        note: 'Refund estimate is $50 for this booking'
      }
    });
    const res = buildRes();
    const next = jest.fn();

    detectSuspiciousRequests(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('still blocks obvious SQL injection strings', () => {
    const req = buildReq({
      body: {
        search: "' UNION SELECT password FROM users --"
      }
    });
    const res = buildRes();
    const next = jest.fn();

    detectSuspiciousRequests(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(logger.error).toHaveBeenCalledWith(
      'Suspicious request detected',
      expect.objectContaining({
        patterns: expect.arrayContaining(['SQL_INJECTION_ATTEMPT'])
      })
    );
  });
});

describe('security middleware CORS origin policy', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAllowedOrigins = process.env.ALLOWED_ORIGINS;
  const originalAppUrl = process.env.APP_URL;
  const originalRenderExternalUrl = process.env.RENDER_EXTERNAL_URL;
  const originalFrontendUrl = process.env.FRONTEND_URL;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.ALLOWED_ORIGINS = originalAllowedOrigins;
    process.env.APP_URL = originalAppUrl;
    process.env.RENDER_EXTERNAL_URL = originalRenderExternalUrl;
    process.env.FRONTEND_URL = originalFrontendUrl;
    jest.clearAllMocks();
  });

  it('rejects requests with missing Origin in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOWED_ORIGINS = 'https://app.example.com';
    const callback = jest.fn();

    corsConfig().origin(undefined, callback);

    expect(callback).toHaveBeenCalledWith(expect.any(Error));
    expect(callback.mock.calls[0][0].message).toBe('Not allowed by CORS');
    expect(logger.warn).toHaveBeenCalledWith(
      'CORS blocked request with missing origin',
      expect.any(Object)
    );
  });

  it('allows requests with missing Origin outside production', () => {
    process.env.NODE_ENV = 'development';
    process.env.ALLOWED_ORIGINS = 'https://app.example.com';
    const callback = jest.fn();

    corsConfig().origin(undefined, callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('allows explicit allowlisted origins in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOWED_ORIGINS = 'https://app.example.com';
    const callback = jest.fn();

    corsConfig().origin('https://app.example.com', callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('allows same-origin Render API requests in production even when ALLOWED_ORIGINS is incomplete', () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOWED_ORIGINS = 'http://localhost:5000';
    const callback = jest.fn();

    corsConfig().origin('https://nocturnal-api.onrender.com', callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('adds configured public service origins to the production allowlist', () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOWED_ORIGINS = 'https://frontend.example.com';
    process.env.APP_URL = 'https://api.example.com';
    process.env.RENDER_EXTERNAL_URL = 'https://render-service.example.com';
    process.env.FRONTEND_URL = 'https://www.example-healthcare.com';

    const corsOptions = corsConfig();
    const appCallback = jest.fn();
    const renderCallback = jest.fn();
    const frontendCallback = jest.fn();

    corsOptions.origin('https://api.example.com', appCallback);
    corsOptions.origin('https://render-service.example.com', renderCallback);
    corsOptions.origin('https://www.example-healthcare.com', frontendCallback);

    expect(appCallback).toHaveBeenCalledWith(null, true);
    expect(renderCallback).toHaveBeenCalledWith(null, true);
    expect(frontendCallback).toHaveBeenCalledWith(null, true);
  });
});
