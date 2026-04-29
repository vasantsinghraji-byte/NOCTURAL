/**
 * Frontend Smoke Tests
 *
 * Verifies that the top-level HTML pages served by express.static
 * return HTTP 200 and contain expected markers (doctype, title, config.js).
 * Catches missing files, broken static serving, and CSP meta-tag regressions.
 */

const request = require('supertest');

let app;

beforeAll(() => {
  app = require('../../app');
});

afterAll(async () => {
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  } catch (_e) { /* ignore */ }
});

/** Pages that must load for the platform to be usable. */
const TOP_PAGES = [
  { path: '/',                                          title: 'Nocturnal' },
  { path: '/index.html',                                title: 'Nocturnal' },
  { path: '/shared/register.html',                       title: 'Sign Up' },
  { path: '/shared/provider-registration-success.html',   title: 'Provider Registration Complete' },
  { path: '/shared/hospital-waitlist-success.html',       title: 'Hospital Waitlist Request Received' },
  { path: '/roles/patient/patient-login.html',           title: null },
  { path: '/roles/patient/patient-register.html',        title: null },
  { path: '/roles/patient/patient-registration-success.html', title: 'Patient Registration Complete' },
  { path: '/roles/patient/patient-dashboard.html',       title: null },
  { path: '/roles/provider/provider-login.html',         title: null },
  { path: '/roles/provider/provider-dashboard.html',     title: null },
  { path: '/roles/doctor/doctor-onboarding.html',        title: null },
  { path: '/roles/doctor/doctor-dashboard.html',         title: null },
  { path: '/roles/doctor/doctor-profile.html',           title: null },
  { path: '/roles/admin/admin-analytics.html',           title: null }
];

describe('Frontend Smoke – top pages load', () => {
  test.each(TOP_PAGES)('GET $path returns 200 with valid HTML', async ({ path, title }) => {
    const res = await request(app).get(path);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toMatch(/<!DOCTYPE html>/i);

    if (title) {
      expect(res.text).toContain(title);
    }
  });

  test('Landing page loads config.js (dependency for landing.js)', async () => {
    const res = await request(app).get('/index.html');

    expect(res.text).toContain('js/config.js');
    expect(res.text).toContain('js/landing.js');
  });

  test('Landing page has no inline script blocks', async () => {
    const res = await request(app).get('/index.html');

    // All inline <script>...</script> blocks should have been extracted.
    // Only <script src="..."></script> tags should remain.
    const inlineScripts = res.text.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]+?<\/script>/gi);
    expect(inlineScripts).toBeNull();
  });

  test('Shared registration page uses external scripts compatible with CSP', async () => {
    const res = await request(app).get('/shared/register.html');

    const inlineScripts = res.text.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]+?<\/script>/gi);
    expect(inlineScripts).toBeNull();
    expect(res.text).toContain('/js/register.js?v=20260429-3');
    expect(res.text).toContain('id="doctorAgreeToTerms"');
    expect(res.text).toContain('id="hospitalFacilityType"');
    expect(res.text).toContain('Join B2B Waitlist');
  });

  test.each([
    ['/roles/patient/patient-login.html', '/js/patient-login.js?v=20260429-2'],
    ['/roles/patient/patient-register.html', '/js/patient-register.js?v=20260429-3'],
    ['/roles/doctor/doctor-onboarding.html', '/js/doctor-onboarding.js?v=20260429-2'],
    ['/roles/doctor/doctor-dashboard.html', '/js/doctor-dashboard.js?v=20260429-1'],
    ['/roles/doctor/doctor-profile.html', '/js/doctor-profile.js?v=20260429-1']
  ])('%s uses external scripts compatible with CSP', async (path, scriptPath) => {
    const res = await request(app).get(path);

    const inlineScripts = res.text.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]+?<\/script>/gi);
    expect(inlineScripts).toBeNull();
    expect(res.text).toContain(scriptPath);

    const handlers = res.text.match(/\bon(click|submit|change|load|error)\s*=/gi);
    expect(handlers).toBeNull();
  });

  test('CSP allows external stylesheet fetches used by the service worker', async () => {
    const res = await request(app).get('/shared/register.html');
    const csp = res.headers['content-security-policy'];

    expect(csp).toContain('connect-src');
    expect(csp).toContain('https://fonts.googleapis.com');
    expect(csp).toContain('https://fonts.gstatic.com');
    expect(csp).toContain('https://cdnjs.cloudflare.com');
  });

  test('Landing page has no inline event handlers', async () => {
    const res = await request(app).get('/index.html');

    const handlers = res.text.match(/\bon(click|submit|change|load|error)\s*=/gi);
    expect(handlers).toBeNull();
  });

  test('Legacy register.html redirects to the canonical shared registration page', async () => {
    const res = await request(app).get('/register.html');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/shared/register.html');
  });

  test('Static assets are served', async () => {
    const cssRes = await request(app).get('/css/index.css');
    expect(cssRes.status).toBe(200);

    const jsRes = await request(app).get('/js/config.js');
    expect(jsRes.status).toBe(200);

    const landingRes = await request(app).get('/js/landing.js');
    expect(landingRes.status).toBe(200);

    const registerRes = await request(app).get('/js/register.js');
    expect(registerRes.status).toBe(200);

    const patientLoginRes = await request(app).get('/js/patient-login.js');
    expect(patientLoginRes.status).toBe(200);

    const patientRegisterRes = await request(app).get('/js/patient-register.js');
    expect(patientRegisterRes.status).toBe(200);

    const doctorOnboardingRes = await request(app).get('/js/doctor-onboarding.js');
    expect(doctorOnboardingRes.status).toBe(200);

    const doctorDashboardRes = await request(app).get('/js/doctor-dashboard.js');
    expect(doctorDashboardRes.status).toBe(200);

    const doctorProfileRes = await request(app).get('/js/doctor-profile.js');
    expect(doctorProfileRes.status).toBe(200);

    const swRes = await request(app).get('/service-worker.js');
    expect(swRes.status).toBe(200);

    const offlineRes = await request(app).get('/shared/offline.html');
    expect(offlineRes.status).toBe(200);
  });

  test('Public conversion funnel checklist is wired to working pages', async () => {
    const landingRes = await request(app).get('/index.html');
    expect(landingRes.status).toBe(200);

    const funnelTargets = [
      {
        label: 'book home care',
        path: '/roles/patient/patient-register.html',
        marker: 'Patient Registration',
        event: 'book_home_care_click'
      },
      {
        label: 'join provider',
        path: '/shared/register.html',
        marker: 'Healthcare Professional',
        event: 'join_provider_click'
      },
      {
        label: 'hospital waitlist',
        path: '/shared/register.html#hospital-waitlist',
        marker: 'Join B2B Waitlist',
        event: 'hospital_waitlist_click'
      },
      {
        label: 'patient login',
        path: '/roles/patient/patient-login.html',
        marker: 'Patient Login'
      },
      {
        label: 'provider login',
        path: '/roles/provider/provider-login.html',
        marker: 'Provider Login'
      }
    ];

    funnelTargets.forEach(({ path, event }) => {
      const htmlPath = path.split('#')[0];
      expect(landingRes.text).toContain(htmlPath);
      if (event) {
        expect(landingRes.text).toContain(`data-analytics-event="${event}"`);
      }
    });

    for (const target of funnelTargets) {
      const res = await request(app).get(target.path.split('#')[0]);
      expect(res.status).toBe(200);
      expect(res.text).toContain(target.marker);
    }

    const registerRes = await request(app).get('/shared/register.html');
    expect(registerRes.text).not.toContain('Hospital Onboarding Coming Soon');
    expect(registerRes.text).not.toContain('id="hospitalSubmitBtn" disabled');
    expect(registerRes.text).toContain('data-funnel-form="hospital-waitlist"');

    const patientSuccessRes = await request(app).get('/roles/patient/patient-registration-success.html');
    expect(patientSuccessRes.status).toBe(200);
    expect(patientSuccessRes.text).toContain('Continue to patient dashboard');

    const providerSuccessRes = await request(app).get('/shared/provider-registration-success.html');
    expect(providerSuccessRes.status).toBe(200);
    expect(providerSuccessRes.text).toContain('Continue provider onboarding');

    const waitlistSuccessRes = await request(app).get('/shared/hospital-waitlist-success.html');
    expect(waitlistSuccessRes.status).toBe(200);
    expect(waitlistSuccessRes.text).toContain('Hospital waitlist request received');
  });

  test('Service worker precaches the real offline fallback path', async () => {
    const res = await request(app).get('/service-worker.js');

    expect(res.text).toContain('/shared/offline.html');
    expect(res.text).not.toMatch(/['"]\/offline\.html['"]/);
    expect(res.text).toContain("const CACHE_VERSION = 'v6'");
    expect(res.text).toContain('LEGACY_RUNTIME_CACHES');
    expect(res.text).toContain('static-${CACHE_VERSION}');
  });
});
