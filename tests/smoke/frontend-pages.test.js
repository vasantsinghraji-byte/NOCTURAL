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
  { path: '/roles/admin/admin-dashboard.html',          title: null },
  { path: '/roles/admin/admin-applications.html',       title: null },
  { path: '/roles/admin/admin-profile.html',            title: null },
  { path: '/roles/patient/patient-login.html',           title: null },
  { path: '/roles/patient/patient-register.html',        title: null },
  { path: '/roles/patient/patient-dashboard.html',       title: null },
  { path: '/roles/provider/provider-login.html',         title: null },
  { path: '/roles/provider/provider-dashboard.html',     title: null },
  { path: '/roles/doctor/doctor-dashboard.html',         title: null },
  { path: '/roles/doctor/my-applications.html',         title: null },
  { path: '/roles/admin/admin-analytics.html',           title: null }
];

describe('Frontend Smoke: GET static app entry pages', () => {
  function extractAssetPath(html, pattern) {
    const match = html.match(pattern);
    return match ? `/${match[1]}` : null;
  }

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

    expect(res.text).toMatch(/js\/config(?:\.[a-f0-9]{8})?\.js/);
    expect(res.text).toMatch(/js\/landing(?:\.[a-f0-9]{8})?\.js/);
  });

  test('Landing page has no inline script blocks', async () => {
    const res = await request(app).get('/index.html');

    // All inline <script>...</script> blocks should have been extracted.
    // Only <script src="..."></script> tags should remain.
    const inlineScripts = res.text.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]+?<\/script>/gi);
    expect(inlineScripts).toBeNull();
  });

  test('Landing page has no inline event handlers', async () => {
    const res = await request(app).get('/index.html');

    const handlers = res.text.match(/\bon(click|submit|change|load|error)\s*=/gi);
    expect(handlers).toBeNull();
  });

  test('Static assets are served', async () => {
    const indexRes = await request(app).get('/index.html');
    const cssPath = extractAssetPath(indexRes.text, /(?:href)=["']([^"']*css\/index(?:\.[a-f0-9]{8})?\.css)["']/i);
    const configPath = extractAssetPath(indexRes.text, /(?:src)=["']([^"']*js\/config(?:\.[a-f0-9]{8})?\.js)["']/i);
    const landingPath = extractAssetPath(indexRes.text, /(?:src)=["']([^"']*js\/landing(?:\.[a-f0-9]{8})?\.js)["']/i);

    expect(cssPath).toBeTruthy();
    expect(configPath).toBeTruthy();
    expect(landingPath).toBeTruthy();

    const cssRes = await request(app).get(cssPath);
    expect(cssRes.status).toBe(200);

    const jsRes = await request(app).get(configPath);
    expect(jsRes.status).toBe(200);

    const landingRes = await request(app).get(landingPath);
    expect(landingRes.status).toBe(200);
  });
});
