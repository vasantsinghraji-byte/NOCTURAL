#!/usr/bin/env node

const DEFAULT_BASE_URL = 'https://nocturnal-api.onrender.com';

const baseUrl = (process.env.DEPLOYED_BASE_URL ||
  process.env.RENDER_SMOKE_BASE_URL ||
  DEFAULT_BASE_URL).replace(/\/+$/, '');
const origin = (process.env.SMOKE_ORIGIN || process.env.RENDER_SMOKE_ORIGIN || baseUrl).replace(/\/+$/, '');

const requiredCorsHeaders = (response, label) => {
  const allowOrigin = response.headers.get('access-control-allow-origin');
  const allowCredentials = response.headers.get('access-control-allow-credentials');

  if (allowOrigin !== origin) {
    throw new Error(`${label}: expected access-control-allow-origin ${origin}, received ${allowOrigin || '<missing>'}`);
  }

  if (allowCredentials !== 'true') {
    throw new Error(`${label}: expected access-control-allow-credentials true, received ${allowCredentials || '<missing>'}`);
  }
};

const readBody = async (response, maxLength = 500) => {
  const text = await response.text();
  return maxLength ? text.slice(0, maxLength) : text;
};

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const retry = async (label, action, options = {}) => {
  const attempts = Number(process.env.DEPLOYED_SMOKE_RETRIES || options.attempts || 12);
  const delayMs = Number(process.env.DEPLOYED_SMOKE_RETRY_DELAY_MS || options.delayMs || 15000);
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await action(attempt);
    } catch (error) {
      lastError = error;

      if (attempt === attempts) {
        break;
      }

      console.warn(`${label}: attempt ${attempt}/${attempts} failed: ${error.message}`);
      await sleep(delayMs);
    }
  }

  throw lastError;
};

const assertNoCorsFailure = async (response, label) => {
  const body = await readBody(response);

  requiredCorsHeaders(response, label);

  if (response.status >= 500) {
    throw new Error(`${label}: expected non-5xx response, received ${response.status}: ${body}`);
  }

  if (body.includes('Not allowed by CORS')) {
    throw new Error(`${label}: response still contains CORS rejection text`);
  }

  return body;
};

const request = (path, options = {}) => fetch(`${baseUrl}${path}`, {
  redirect: 'manual',
  ...options,
  headers: {
    Origin: origin,
    ...options.headers
  }
});

async function main() {
  console.log(`Running deployed auth CORS smoke against ${baseUrl} with Origin ${origin}`);

  await retry('homepage readiness', async () => {
    const homepage = await fetch(`${baseUrl}/index.html`, { redirect: 'manual' });
    const homepageBody = await readBody(homepage, 0);
    if (!homepage.ok || !homepageBody.includes('loginForm')) {
      throw new Error(`homepage: expected served login page, received ${homepage.status}`);
    }
  });

  await retry('auth preflight readiness', async () => {
    const preflight = await request('/api/v1/auth/login', {
      method: 'OPTIONS',
      headers: {
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type'
      }
    });

    if (preflight.status !== 204) {
      const body = await readBody(preflight);
      throw new Error(`preflight: expected 204, received ${preflight.status}: ${body}`);
    }
    requiredCorsHeaders(preflight, 'preflight');
  });

  const login = await request('/api/v1/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });
  await assertNoCorsFailure(login, 'login POST');

  const register = await request('/api/v1/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });
  await assertNoCorsFailure(register, 'register POST');

  // Same-origin simple GETs reach the server with NO Origin header (browsers
  // omit it). This guards the regression where production 500'd missing-origin
  // requests, breaking service browsing and the /auth/me call that fires on
  // every page load. Sent without an Origin header on purpose.
  const noOriginGet = await fetch(`${baseUrl}/api/v1/auth/me`, {
    redirect: 'manual',
    headers: { Accept: 'application/json' }
  });
  const noOriginBody = await readBody(noOriginGet);
  if (noOriginGet.status >= 500) {
    throw new Error(`no-origin GET /api/v1/auth/me: expected non-5xx, received ${noOriginGet.status}: ${noOriginBody}`);
  }
  if (noOriginBody.includes('Not allowed by CORS')) {
    throw new Error('no-origin GET /api/v1/auth/me: response still contains CORS rejection text');
  }

  console.log('Deployed auth CORS smoke passed');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
