/**
 * Service Worker for Offline Support
 * Provides offline functionality and improved performance through caching
 */

importScripts('/js/sw-cache-config.js');

const CACHE_VERSION = 'v4';
const CACHE_NAME = `nocturnal-${CACHE_VERSION}`;
const LEGACY_CACHE_NAMES = ['images', 'static', 'api', 'pages', 'default'];
const CACHE_BUCKETS = {
  images: `${CACHE_NAME}-images`,
  static: `${CACHE_NAME}-static`,
  publicApi: `${CACHE_NAME}-public-api`,
  pages: `${CACHE_NAME}-pages`,
  default: `${CACHE_NAME}-default`
};
const ACTIVE_CACHE_NAMES = new Set([
  CACHE_NAME,
  ...Object.values(CACHE_BUCKETS)
]);
const DEFAULT_PUBLIC_API_GET_PATHS = ['/api/v1/health'];
const SENSITIVE_API_ROUTES = [
  /^\/api\/v1\/auth(?:\/|$)/,
  /^\/api\/v1\/profile(?:\/|$)/,
  /^\/api\/v1\/payments(?:\/|$)/,
  /^\/api\/v1\/payments-b2c(?:\/|$)/
];
const SHARED_SW_CACHE_CONFIG = self.NOCTURNAL_SW_CACHE_CONFIG || {
  publicApiGetPaths: DEFAULT_PUBLIC_API_GET_PATHS
};
const CACHEABLE_PUBLIC_API_PATHS = Array.isArray(SHARED_SW_CACHE_CONFIG.publicApiGetPaths) &&
  SHARED_SW_CACHE_CONFIG.publicApiGetPaths.length > 0
  ? SHARED_SW_CACHE_CONFIG.publicApiGetPaths
  : DEFAULT_PUBLIC_API_GET_PATHS;

function escapeForRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toExactPathPattern(pathname) {
  return new RegExp(`^${escapeForRegex(pathname)}$`);
}

const CACHEABLE_PUBLIC_API_ROUTES = CACHEABLE_PUBLIC_API_PATHS.map(toExactPathPattern);
const PUBLIC_API_PRIMARY_ROUTE = CACHEABLE_PUBLIC_API_ROUTES[0];

// Cache strategies
const CACHE_STRATEGIES = {
  CACHE_FIRST: 'cache-first',
  NETWORK_FIRST: 'network-first',
  NETWORK_ONLY: 'network-only',
  CACHE_ONLY: 'cache-only',
  STALE_WHILE_REVALIDATE: 'stale-while-revalidate'
};

// Assets to precache
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/shared/register.html',
  '/shared/privacy.html',
  '/roles/admin/admin-waitlist.html',
  '/provider-login.html',
  '/provider-dashboard.html',
  '/patient-login.html',
  '/patient-dashboard.html',
  '/manifest.json',
  '/css/common.css',
  '/js/lazyload.js',
  '/offline.html' // Offline fallback page
];

// Route-specific cache strategies
const CACHE_ROUTES = [
  {
    pattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
    strategy: CACHE_STRATEGIES.CACHE_FIRST,
    cacheName: CACHE_BUCKETS.images,
    maxAge: 30 * 24 * 60 * 60 // 30 days
  },
  {
    pattern: /\.(?:css|js)$/,
    strategy: CACHE_STRATEGIES.STALE_WHILE_REVALIDATE,
    cacheName: CACHE_BUCKETS.static,
    maxAge: 7 * 24 * 60 * 60 // 7 days
  },
  {
    pattern: PUBLIC_API_PRIMARY_ROUTE,
    strategy: CACHE_STRATEGIES.NETWORK_FIRST,
    cacheName: CACHE_BUCKETS.publicApi,
    maxAge: 5 * 60, // 5 minutes
    networkTimeoutSeconds: 5
  },
  {
    pattern: /\.html$/,
    strategy: CACHE_STRATEGIES.NETWORK_FIRST,
    cacheName: CACHE_BUCKETS.pages,
    maxAge: 24 * 60 * 60 // 1 day
  }
];

/**
 * Install event - precache assets
 */
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Precaching assets');
      return cache.addAll(PRECACHE_ASSETS).catch((error) => {
        console.error('[Service Worker] Precache failed:', error);
      });
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          const isLegacyCache = LEGACY_CACHE_NAMES.includes(cacheName);
          const isOutdatedNocturnalCache =
            cacheName.startsWith('nocturnal-') && !ACTIVE_CACHE_NAMES.has(cacheName);

          if (isLegacyCache || isOutdatedNocturnalCache) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

/**
 * Fetch event - handle requests with caching strategies
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Never cache non-public API traffic. Only a small explicit allowlist of
  // unauthenticated GET endpoints may use the API cache.
  if (isApiRequest(url) && !isExplicitlyCacheablePublicApiRequest(request, url)) {
    event.respondWith(fetch(request));
    return;
  }

  // Find matching cache route
  const matchedRoute = CACHE_ROUTES.find((route) =>
    route.pattern.test(url.pathname)
  );

  if (matchedRoute) {
    const strategy = matchedRoute.strategy;

    switch (strategy) {
      case CACHE_STRATEGIES.CACHE_FIRST:
        event.respondWith(cacheFirst(request, matchedRoute));
        break;

      case CACHE_STRATEGIES.NETWORK_FIRST:
        event.respondWith(networkFirst(request, matchedRoute));
        break;

      case CACHE_STRATEGIES.STALE_WHILE_REVALIDATE:
        event.respondWith(staleWhileRevalidate(request, matchedRoute));
        break;

      case CACHE_STRATEGIES.NETWORK_ONLY:
        event.respondWith(fetch(request));
        break;

      case CACHE_STRATEGIES.CACHE_ONLY:
        event.respondWith(caches.match(request));
        break;

      default:
        event.respondWith(networkFirst(request, matchedRoute));
    }
  } else {
    // Default: network first
    event.respondWith(networkFirst(request, { cacheName: CACHE_BUCKETS.default }));
  }
});

function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

function hasAuthorizationHeader(request) {
  return !!request.headers.get('Authorization');
}

function isSensitiveApiRoute(pathname) {
  return SENSITIVE_API_ROUTES.some((pattern) => pattern.test(pathname));
}

function isExplicitlyCacheablePublicApiRequest(request, url) {
  if (request.method !== 'GET') {
    return false;
  }

  if (hasAuthorizationHeader(request)) {
    return false;
  }

  if (isSensitiveApiRoute(url.pathname)) {
    return false;
  }

  return CACHEABLE_PUBLIC_API_ROUTES.some((pattern) => pattern.test(url.pathname));
}

/**
 * Cache First strategy
 */
async function cacheFirst(request, route) {
  const cacheName = route.cacheName || CACHE_NAME;
  const cache = await caches.open(cacheName);

  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    // Check if cache is expired
    if (route.maxAge && isCacheExpired(cachedResponse, route.maxAge)) {
      console.log('[Service Worker] Cache expired, fetching:', request.url);
      return fetchAndCache(request, cache);
    }

    console.log('[Service Worker] Cache hit:', request.url);
    return cachedResponse;
  }

  console.log('[Service Worker] Cache miss, fetching:', request.url);
  return fetchAndCache(request, cache);
}

/**
 * Network First strategy
 */
async function networkFirst(request, route) {
  const cacheName = route.cacheName || CACHE_NAME;
  const cache = await caches.open(cacheName);

  try {
    // Try network with timeout
    const networkResponse = await fetchWithTimeout(
      request,
      route.networkTimeoutSeconds || 10
    );

    // Cache successful responses
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.log('[Service Worker] Network failed, trying cache:', request.url);

    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      return cache.match('/offline.html');
    }

    return new Response('Network error', {
      status: 408,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

/**
 * Stale While Revalidate strategy
 */
async function staleWhileRevalidate(request, route) {
  const cacheName = route.cacheName || CACHE_NAME;
  const cache = await caches.open(cacheName);

  const cachedResponse = await cache.match(request);

  // Fetch from network and update cache in background
  const fetchPromise = fetch(request).then((networkResponse) => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch((error) => {
    console.log('[Service Worker] Background fetch failed:', error);
    return cachedResponse || new Response('Network error', {
      status: 408,
      headers: { 'Content-Type': 'text/plain' }
    });
  });

  // Return cached response immediately, or wait for network if no cache
  return cachedResponse || fetchPromise;
}

/**
 * Fetch with timeout
 */
function fetchWithTimeout(request, timeoutSeconds) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Request timeout'));
    }, timeoutSeconds * 1000);

    fetch(request).then((response) => {
      clearTimeout(timeout);
      resolve(response);
    }).catch((error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

/**
 * Fetch and cache helper
 */
async function fetchAndCache(request, cache) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.error('[Service Worker] Fetch failed:', error);

    // Try to return offline page
    if (request.mode === 'navigate') {
      const offlinePage = await cache.match('/offline.html');
      if (offlinePage) {
        return offlinePage;
      }
    }

    return new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

/**
 * Check if cache is expired
 */
function isCacheExpired(response, maxAge) {
  const cachedDate = response.headers.get('date');
  if (!cachedDate) {
    return false;
  }

  const cacheTime = new Date(cachedDate).getTime();
  const now = Date.now();
  const age = (now - cacheTime) / 1000;

  return age > maxAge;
}

/**
 * Background sync for failed requests
 */
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    event.waitUntil(syncData());
  }
});

async function clearHtmlCaches() {
  await Promise.all([
    caches.delete(CACHE_BUCKETS.pages),
    caches.delete(CACHE_BUCKETS.default)
  ]);
}

self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'NOCTURNAL_REFRESH_HTML_CACHE') {
    return;
  }

  event.waitUntil(
    clearHtmlCaches().then(() => {
      if (event.source) {
        event.source.postMessage({
          type: 'NOCTURNAL_HTML_CACHE_REFRESHED',
          reason: event.data.reason || 'unknown'
        });
      }
    })
  );
});

async function syncData() {
  console.log('[Service Worker] Background sync triggered');
  // Implement background sync logic here
}

/**
 * Push notifications
 */
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};

  const options = {
    body: data.body || 'New notification from Nocturnal',
    icon: '/images/icon-192.png',
    badge: '/images/badge-72.png',
    vibrate: [200, 100, 200],
    data: data.data || {}
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Nocturnal', options)
  );
});

/**
 * Notification click handler
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});

console.log('[Service Worker] Loaded');
