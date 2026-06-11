(function attachNocturnalSwCacheConfig() {
  const sharedConfig = Object.freeze({
    publicApiGetPaths: Object.freeze([
      '/api/v1/health'
    ])
  });
  const globalScope = typeof self !== 'undefined' ? self : globalThis;

  globalScope.NOCTURNAL_SW_CACHE_CONFIG = sharedConfig;
})();
