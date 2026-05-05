const {
  fs,
  productionFrontendScriptPaths,
  toProjectRelativePath
} = require('./frontend-validation-utils');

const approvedDirectInternalFetchFallbackModules = new Set([
  'client/public/api.js',
  'client/public/js/auth.js',
  'client/public/js/config.js',
  'client/public/js/notification-center.js',
  'client/public/js/pagination.js',
  'client/public/js/unified-nav.js',
  'client/public/js/utils.js',
  'client/public/service-worker.js'
]);

const directInternalFallbackFetchPatterns = [
  /fetch\(\s*getApiUrl\(/,
  /fetch\(\s*this\.buildApiUrl\(/,
  /return\s+fetch\(\s*endpoint\s*,/
];

describe('Frontend Transport Shared JS Fallback Wrappers', () => {
  it('should keep direct fallback fetches for app-internal endpoints confined to approved shared transport wrappers', () => {
    const directFallbackFetchOffenders = [];

    productionFrontendScriptPaths.forEach((absolutePath) => {
      const source = fs.readFileSync(absolutePath, 'utf8');
      const relativePath = toProjectRelativePath(absolutePath);
      const hasDirectInternalFallbackFetch = directInternalFallbackFetchPatterns.some((pattern) => pattern.test(source));

      if (hasDirectInternalFallbackFetch && !approvedDirectInternalFetchFallbackModules.has(relativePath)) {
        directFallbackFetchOffenders.push(relativePath);
      }
    });

    expect(directFallbackFetchOffenders.sort()).toEqual([]);
  });
});
