const http = require('http');
const net = require('net');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..');
const productionOrigin = 'https://nocturnal-api.onrender.com';

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

function sendRequest(port, { method, path: requestPath, body, omitOrigin = false }) {
  const payload = body ? JSON.stringify(body) : '';
  const headers = {
    'x-forwarded-proto': 'https',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  };

  if (!omitOrigin) {
    headers.Origin = productionOrigin;
  }

  if (method === 'OPTIONS') {
    headers['Access-Control-Request-Method'] = 'POST';
    headers['Access-Control-Request-Headers'] = 'content-type';
  }

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: requestPath,
      method,
      headers
    }, (res) => {
      let responseBody = '';

      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        responseBody += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: responseBody
        });
      });
    });

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

describe('Production Smoke: auth CORS contract', () => {
  jest.setTimeout(35000);

  it('allows live Render-origin preflight, POSTs, and same-origin GETs (incl. no-origin) through CORS', async () => {
    const originalEnv = { ...process.env };
    const port = await reservePort();

    Object.assign(process.env, global.testUtils.productionFixtureEnv({
      NODE_ENV: 'production',
      PORT: String(port),
      ALLOWED_ORIGINS: 'http://localhost:5000'
    }));

    jest.resetModules();

    const { startServer, stopServer } = require(path.join(rootDir, 'server.js'));
    await startServer({
      port,
      registerProcessHandlers: false,
      connectDatabase: false,
      connectCache: false
    });

    try {
      const preflight = await sendRequest(port, {
        method: 'OPTIONS',
        path: '/api/v1/auth/login'
      });
      const login = await sendRequest(port, {
        method: 'POST',
        path: '/api/v1/auth/login',
        body: {}
      });
      const register = await sendRequest(port, {
        method: 'POST',
        path: '/api/v1/auth/register',
        body: {}
      });

      expect(preflight.statusCode).toBe(204);
      for (const response of [preflight, login, register]) {
        expect(response.headers['access-control-allow-origin']).toBe(productionOrigin);
        expect(response.headers['access-control-allow-credentials']).toBe('true');
        expect(response.body).not.toContain('Not allowed by CORS');
      }
      expect(login.statusCode).not.toBe(500);
      expect(register.statusCode).not.toBe(500);

      // Same-origin GETs reach the server with no Origin header (browsers omit
      // it on safe same-origin methods). Regression guard for the production
      // no-origin rejection that previously 500'd service browsing and
      // /auth/me. The patched origin callback must allow both the with-Origin
      // GET and the no-origin GET in the real middleware order.
      const sameOriginGet = await sendRequest(port, {
        method: 'GET',
        path: '/api/v1/auth/me'
      });
      const noOriginGet = await sendRequest(port, {
        method: 'GET',
        path: '/api/v1/auth/me',
        omitOrigin: true
      });

      for (const response of [sameOriginGet, noOriginGet]) {
        expect(response.statusCode).not.toBe(500);
        expect(response.body).not.toContain('Not allowed by CORS');
      }
      expect(sameOriginGet.headers['access-control-allow-origin']).toBe(productionOrigin);
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
