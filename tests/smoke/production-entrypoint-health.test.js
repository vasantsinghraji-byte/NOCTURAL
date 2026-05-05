const http = require('http');
const net = require('net');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..');

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }

        resolve(address.port);
      });
    });

    server.on('error', reject);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestHealth(port) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/api/v1/health',
      method: 'GET',
      headers: {
        'x-forwarded-proto': 'https'
      }
    }, (res) => {
      let body = '';

      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function waitForHealthResponse(port, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      return await requestHealth(port);
    } catch (error) {
      await delay(250);
    }
  }

  throw new Error(`Timed out waiting for /api/v1/health on port ${port}`);
}

describe('Production Smoke: GET /api/v1/health via server.js entrypoint', () => {
  jest.setTimeout(35000);

  it('should boot the real production server entrypoint with production-valid fixture env and serve /api/v1/health', async () => {
    const originalEnv = { ...process.env };
    const port = await reservePort();

    Object.assign(process.env, global.testUtils.productionFixtureEnv({
      NODE_ENV: 'production',
      PORT: String(port),
      ALLOWED_ORIGINS: `https://127.0.0.1:${port}`
    }));

    jest.resetModules();

    const { startServer, stopServer } = require(path.join(rootDir, 'server.js'));
    const server = startServer({
      port,
      registerProcessHandlers: false,
      connectDatabase: false
    });

    try {
      const response = await waitForHealthResponse(port, 20000);
      const payload = JSON.parse(response.body);

      expect(server).toBeTruthy();
      expect([200, 503]).toContain(response.statusCode);
      expect(response.headers['x-api-version']).toBe('v1');
      expect(payload).toEqual(expect.objectContaining({
        version: 'v1',
        environment: 'production',
        status: expect.stringMatching(/healthy|degraded/),
        database: expect.objectContaining({
          status: expect.stringMatching(/connected|disconnected/)
        })
      }));
    } finally {
      await stopServer();
      Object.keys(process.env).forEach((key) => {
        if (!(key in originalEnv)) {
          delete process.env[key];
        }
      });
      Object.assign(process.env, originalEnv);
      jest.resetModules();
    }
  });
});
