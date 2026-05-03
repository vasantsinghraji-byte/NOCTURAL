const { test, expect } = require('playwright/test');

const CSP_ERROR_PATTERNS = [
  /Executing inline script violates/i,
  /Executing inline event handler violates/i,
  /Content Security Policy directive/i
];

const CSP_PAGES = [
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

test.describe('browser CSP console contract', () => {
  for (const cspPage of CSP_PAGES) {
    test(`${cspPage.label} does not emit CSP console violations`, async ({ page }) => {
      const violations = [];

      await page.route(/.*\/api\/.*/, async (route) => {
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

      await page.goto(cspPage.path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);

      expect(violations).toEqual([]);
    });
  }
});
