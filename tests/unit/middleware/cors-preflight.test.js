jest.mock('../../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
}));

const cors = require('cors');
const express = require('express');
const request = require('supertest');
const { corsConfig } = require('../../../middleware/security');

describe('app CORS preflight handling', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAllowedOrigins = process.env.ALLOWED_ORIGINS;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.ALLOWED_ORIGINS = originalAllowedOrigins;
  });

  it('allows production same-origin Render API preflight requests', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOWED_ORIGINS = 'http://localhost:5000';

    const app = express();
    const corsOptions = corsConfig();
    app.use(cors(corsOptions));
    app.options(/.*/, cors(corsOptions));

    const response = await request(app)
      .options('/api/v1/auth/login')
      .set('Origin', 'https://nocturnal-api.onrender.com')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type')
      .expect(204);

    expect(response.headers['access-control-allow-origin']).toBe('https://nocturnal-api.onrender.com');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });
});
