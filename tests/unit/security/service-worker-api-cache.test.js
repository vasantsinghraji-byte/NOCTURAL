const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..', '..');
const serviceWorkerSrc = fs.readFileSync(
  path.join(rootDir, 'client/public/service-worker.js'),
  'utf8'
);
const sharedSwCacheConfigSrc = fs.readFileSync(
  path.join(rootDir, 'client/public/js/sw-cache-config.js'),
  'utf8'
);

describe('Security Unit: service worker API cache restrictions', () => {
  it('should only cache explicitly public API GET endpoints', () => {
    expect(serviceWorkerSrc).toContain("const CACHE_VERSION = 'v4';");
    expect(serviceWorkerSrc).toContain("importScripts('/js/sw-cache-config.js');");
    expect(sharedSwCacheConfigSrc).toContain('publicApiGetPaths');
    expect(sharedSwCacheConfigSrc).toContain("'/api/v1/health'");
    expect(serviceWorkerSrc).toContain('const CACHEABLE_PUBLIC_API_PATHS =');
    expect(serviceWorkerSrc).not.toContain('pattern: /\\/api\\//');
  });

  it('should bypass cache for sensitive API routes and authenticated requests', () => {
    expect(serviceWorkerSrc).toContain('/^\\/api\\/v1\\/auth(?:\\/|$)/');
    expect(serviceWorkerSrc).toContain('/^\\/api\\/v1\\/profile(?:\\/|$)/');
    expect(serviceWorkerSrc).toContain('/^\\/api\\/v1\\/payments(?:\\/|$)/');
    expect(serviceWorkerSrc).toContain('/^\\/api\\/v1\\/payments-b2c(?:\\/|$)/');
    expect(serviceWorkerSrc).toContain("request.headers.get('Authorization')");
    expect(serviceWorkerSrc).toContain('if (isApiRequest(url) && !isExplicitlyCacheablePublicApiRequest(request, url)) {');
    expect(serviceWorkerSrc).toContain('event.respondWith(fetch(request));');
  });

  it('should evict legacy api cache buckets during activation', () => {
    expect(serviceWorkerSrc).toContain("const LEGACY_CACHE_NAMES = ['images', 'static', 'api', 'pages', 'default'];");
    expect(serviceWorkerSrc).toContain('const ACTIVE_CACHE_NAMES = new Set([');
    expect(serviceWorkerSrc).toContain('const isLegacyCache = LEGACY_CACHE_NAMES.includes(cacheName);');
    expect(serviceWorkerSrc).toContain("cacheName.startsWith('nocturnal-') && !ACTIVE_CACHE_NAMES.has(cacheName)");
  });

  it('should support HTML cache refresh messages for stale page self-healing', () => {
    expect(serviceWorkerSrc).toContain("event.data.type !== 'NOCTURNAL_REFRESH_HTML_CACHE'");
    expect(serviceWorkerSrc).toContain("type: 'NOCTURNAL_HTML_CACHE_REFRESHED'");
    expect(serviceWorkerSrc).toContain('caches.delete(CACHE_BUCKETS.pages)');
    expect(serviceWorkerSrc).toContain('caches.delete(CACHE_BUCKETS.default)');
  });
});
