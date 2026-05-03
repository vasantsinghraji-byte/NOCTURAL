(function attachNocturnalSwCacheConfig(globalScope) {
  const sharedConfig = Object.freeze({
    publicApiGetPaths: Object.freeze([
      '/api/v1/health'
    ])
  });

  globalScope.NOCTURNAL_SW_CACHE_CONFIG = sharedConfig;
})(typeof self !== 'undefined' ? self : globalThis);
