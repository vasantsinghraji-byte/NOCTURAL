const http = require('http');
const net = require('net');
const path = require('path');
const { chromium } = require('playwright');

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

function isBrowserLaunchBlocked(error) {
  const message = error && error.message ? error.message : '';
  return message.includes('spawn EPERM');
}

function shouldRequireBrowserLaunch() {
  return process.env.PLAYWRIGHT_STRICT_LAUNCH === 'true' || process.env.CI === 'true';
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
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });

    req.on('error', reject);
    req.end();
  });
}

async function waitForHealth(port, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const statusCode = await requestHealth(port);
      if (statusCode === 200 || statusCode === 503) {
        return;
      }
    } catch (error) {
      await delay(250);
      continue;
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for production app on port ${port}`);
}

describe('Production Smoke: built frontend routes in Playwright', () => {
  jest.setTimeout(90000);

  let browser;
  let server;
  let stopServer;
  let originalEnv;
  let port;
  let baseUrl;
  let browserLaunchBlockedReason = null;

  beforeAll(async () => {
    originalEnv = { ...process.env };
    port = await reservePort();
    baseUrl = `http://127.0.0.1:${port}`;

    Object.assign(process.env, global.testUtils.productionFixtureEnv({
      NODE_ENV: 'production',
      PORT: String(port),
      ALLOWED_ORIGINS: `https://127.0.0.1:${port}`
    }));

    jest.resetModules();

    const serverModule = require(path.join(rootDir, 'server.js'));
    server = serverModule.startServer({
      port,
      registerProcessHandlers: false,
      connectDatabase: false
    });
    stopServer = serverModule.stopServer;

    await waitForHealth(port, 20000);
    try {
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox']
      });
    } catch (error) {
      if (isBrowserLaunchBlocked(error)) {
        if (shouldRequireBrowserLaunch()) {
          throw new Error(`Chromium launch was blocked in a strict Playwright environment: ${error.message}`);
        }

        browserLaunchBlockedReason = error.message;
        return;
      }

      throw error;
    }
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }

    if (stopServer) {
      await stopServer();
    }

    if (server && typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }

    Object.keys(process.env).forEach((key) => {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    });
    Object.assign(process.env, originalEnv);
    jest.resetModules();
  });

  async function withPage(callback) {
    if (browserLaunchBlockedReason) {
      console.warn(`Skipping Playwright smoke assertions because Chromium launch is blocked in this environment: ${browserLaunchBlockedReason}`);
      return;
    }

    const context = await browser.newContext({
      extraHTTPHeaders: {
        'x-forwarded-proto': 'https'
      }
    });
    const page = await context.newPage();

    try {
      return await callback(page);
    } finally {
      await context.close();
    }
  }

  it('should serve the built landing page with shared route and API helpers available', async () => {
    await withPage(async (page) => {
      await page.goto(`${baseUrl}/index.html`, {
        waitUntil: 'domcontentloaded'
      });
      await page.waitForFunction(() => (
        typeof window.AppConfig !== 'undefined' &&
        typeof window.AppConfig.endpoint === 'function' &&
        typeof window.NocturnalSession !== 'undefined'
      ));

      const pageState = await page.evaluate(() => ({
        title: document.title,
        patientLoginRoute: window.AppConfig.routes.page('patient.login'),
        authLoginEndpoint: window.AppConfig.endpoint('auth.login')
      }));

      expect(pageState.title).toContain('Nocturnal');
      expect(pageState.patientLoginRoute).toBe('/roles/patient/patient-login.html');
      expect(pageState.authLoginEndpoint).toBe('auth/login');
    });
  });

  it('should serve the built patient login page with the manifest-backed auth endpoint', async () => {
    await withPage(async (page) => {
      await page.goto(`${baseUrl}/roles/patient/patient-login.html`, {
        waitUntil: 'domcontentloaded'
      });
      await page.waitForSelector('#loginForm');

      const loginState = await page.evaluate(() => ({
        title: document.title,
        submitLabel: document.getElementById('submitBtn')?.textContent?.trim(),
        patientLoginEndpoint: window.AppConfig.endpoint('patients.login')
      }));

      expect(loginState.title).toContain('Patient Login');
      expect(loginState.submitLabel).toBe('Login');
      expect(loginState.patientLoginEndpoint).toBe('patients/login');
    });
  });

  it('should redirect unauthenticated doctor dashboard visits back to the landing page', async () => {
    await withPage(async (page) => {
      await page.goto(`${baseUrl}/roles/doctor/doctor-dashboard.html`, {
        waitUntil: 'domcontentloaded'
      });
      await page.waitForURL(`${baseUrl}/index.html`);

      expect(page.url()).toBe(`${baseUrl}/index.html`);
    });
  });
});
