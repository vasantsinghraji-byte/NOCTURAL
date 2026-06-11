const { chromium } = require('playwright');

const DEFAULT_BASE_URL = 'https://nocturnal-api.onrender.com';
const baseUrl = (process.env.DEPLOYED_BASE_URL || process.env.RENDER_SMOKE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');

const CSP_ERROR_PATTERNS = [
  /Executing inline script violates/i,
  /Executing inline event handler violates/i,
  /Content Security Policy directive/i
];

const CSP_PAGES = [
  { label: 'home', path: '/index.html' },
  { label: 'patient login', path: '/roles/patient/patient-login.html' },
  { label: 'patient dashboard', path: '/roles/patient/patient-dashboard.html' },
  { label: 'doctor dashboard', path: '/roles/doctor/doctor-dashboard.html' },
  { label: 'doctor profile', path: '/roles/doctor/doctor-profile-enhanced.html' },
  { label: 'doctor onboarding', path: '/roles/doctor/doctor-onboarding.html' },
  { label: 'admin dashboard', path: '/roles/admin/admin-dashboard.html' },
  { label: 'provider dashboard', path: '/roles/provider/provider-dashboard.html' }
];

function isCspViolation(text) {
  return CSP_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

function assertStyleSrcIsStrict(cspHeader, pageLabel) {
  if (!cspHeader) {
    throw new Error(`${pageLabel}: missing Content-Security-Policy header`);
  }

  const styleSrcDirective = cspHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith('style-src '));

  if (!styleSrcDirective) {
    throw new Error(`${pageLabel}: missing style-src directive`);
  }

  if (styleSrcDirective.includes("'unsafe-inline'")) {
    throw new Error(`${pageLabel}: style-src still allows 'unsafe-inline'`);
  }
}

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox']
  });

  const failures = [];

  try {
    for (const cspPage of CSP_PAGES) {
      const context = await browser.newContext({
        ignoreHTTPSErrors: true
      });
      const page = await context.newPage();
      const violations = [];

      await page.route('**/api/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: [], user: null, bookings: [] })
        });
      });

      page.on('console', (message) => {
        const text = message.text();
        if (isCspViolation(text)) {
          violations.push(text);
        }
      });

      page.on('pageerror', (error) => {
        const text = error.message || String(error);
        if (isCspViolation(text)) {
          violations.push(text);
        }
      });

      try {
        const response = await page.goto(`${baseUrl}${cspPage.path}`, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });

        if (!response || response.status() >= 400) {
          failures.push(`${cspPage.label}: HTTP ${response ? response.status() : 'no response'}`);
        } else {
          assertStyleSrcIsStrict(response.headers()['content-security-policy'], cspPage.label);
        }

        await page.waitForTimeout(750);

        if (violations.length > 0) {
          failures.push(`${cspPage.label}: ${violations.join(' | ')}`);
        }
      } catch (error) {
        failures.push(`${cspPage.label}: ${error.message}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  if (failures.length > 0) {
    console.error(`Live deployed CSP smoke failed for ${baseUrl}`);
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }

  console.log(`Live deployed CSP smoke passed for ${baseUrl}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
