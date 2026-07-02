'use strict';

const path = require('path');

const repoRoot = path.resolve(__dirname, '../../..');

function cacheEntriesRelativeToRepo() {
  return Object.keys(require.cache)
    .filter((entry) => entry.startsWith(repoRoot))
    .map((entry) => path.relative(repoRoot, entry).split(path.sep).join('/'))
    .sort();
}

function newCacheEntries(before) {
  const beforeSet = new Set(before);
  return cacheEntriesRelativeToRepo().filter((entry) => !beforeSet.has(entry));
}

describe('@nocturnal/shared lazy-load facade', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('requiring workspace package does not eagerly load side-effectful modules', () => {
    const beforeRequire = cacheEntriesRelativeToRepo();

    const shared = require('@nocturnal/shared');
    const afterPackageRequire = cacheEntriesRelativeToRepo();

    expect(Object.keys(shared)).toHaveLength(27);
    expect(newCacheEntries(beforeRequire)).toEqual(['packages/shared/src/index.js']);

    // Accessing one export may load its own dependency tree, but not unrelated subsystems.
    expect(shared.logger).toBeDefined();
    expect(newCacheEntries(afterPackageRequire)).toContain('utils/logger.js');

    const loadedAfterLoggerAccess = cacheEntriesRelativeToRepo();
    expect(loadedAfterLoggerAccess).not.toEqual(
      expect.arrayContaining([
        'config/storage.js',
        'middleware/upload.js',
        'middleware/queryCache.js',
        'middleware/rateLimiter.js',
        'services/notificationService.js',
        'services/webAuthnService.js',
      ])
    );
  });
});
