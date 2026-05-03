const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.resolve(__dirname, '..', '..', '..');
const sharedConfigSrc = fs.readFileSync(
  path.join(rootDir, 'client/public/js/sw-cache-config.js'),
  'utf8'
);
const serviceWorkerSrc = fs.readFileSync(
  path.join(rootDir, 'client/public/service-worker.js'),
  'utf8'
);

const loadServiceWorker = () => {
  const handlers = {};
  const cache = {
    match: jest.fn().mockResolvedValue(undefined),
    put: jest.fn().mockResolvedValue(undefined),
    addAll: jest.fn().mockResolvedValue(undefined)
  };
  const caches = {
    open: jest.fn().mockResolvedValue(cache),
    keys: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue(true),
    match: jest.fn().mockResolvedValue(undefined)
  };
  const fetch = jest.fn().mockResolvedValue(new Response('ok', { status: 200 }));
  const clients = {
    claim: jest.fn().mockResolvedValue(undefined),
    openWindow: jest.fn().mockResolvedValue(undefined)
  };

  const context = vm.createContext({
    console,
    URL,
    Request,
    Response,
    Headers,
    Promise,
    setTimeout,
    clearTimeout,
    caches,
    fetch,
    clients,
    self: {
      addEventListener: (type, handler) => {
        handlers[type] = handler;
      },
      skipWaiting: jest.fn().mockResolvedValue(undefined),
      clients,
      registration: {
        showNotification: jest.fn().mockResolvedValue(undefined)
      }
    }
  });

  context.importScripts = (...paths) => {
    paths.forEach((scriptPath) => {
      if (scriptPath === '/js/sw-cache-config.js') {
        vm.runInContext(sharedConfigSrc, context);
      } else {
        throw new Error(`Unexpected importScripts path: ${scriptPath}`);
      }
    });
  };

  vm.runInContext(serviceWorkerSrc, context);

  return {
    handlers,
    cache,
    caches,
    fetch
  };
};

const dispatchFetch = async (handler, request) => {
  const event = {
    request,
    respondWith: jest.fn()
  };

  handler(event);

  const responsePromise = event.respondWith.mock.calls[0][0];
  const response = await responsePromise;

  return {
    event,
    response
  };
};

describe('Security Unit: service worker fetch routing behavior', () => {
  it('should route allowlisted public health GETs through the public API cache', async () => {
    const { handlers, caches, cache, fetch } = loadServiceWorker();
    const request = new Request('https://app.nocturnal.test/api/v1/health');

    const { response } = await dispatchFetch(handlers.fetch, request);

    expect(fetch).toHaveBeenCalledWith(request);
    expect(caches.open).toHaveBeenCalledWith('nocturnal-v4-public-api');
    expect(cache.put).toHaveBeenCalledWith(request, expect.any(Response));
    expect(response.status).toBe(200);
  });

  it('should bypass cache for sensitive auth API responses', async () => {
    const { handlers, caches, fetch } = loadServiceWorker();
    const request = new Request('https://app.nocturnal.test/api/v1/auth/me');

    const { response } = await dispatchFetch(handlers.fetch, request);

    expect(fetch).toHaveBeenCalledWith(request);
    expect(caches.open).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it('should bypass cache for API requests carrying an Authorization header', async () => {
    const { handlers, caches, fetch } = loadServiceWorker();
    const request = new Request('https://app.nocturnal.test/api/v1/health', {
      headers: {
        Authorization: 'Bearer secret-token'
      }
    });

    const { response } = await dispatchFetch(handlers.fetch, request);

    expect(fetch).toHaveBeenCalledWith(request);
    expect(caches.open).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });
});
