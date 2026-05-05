const path = require('path');
const {
  fs,
  hardeningPatterns,
  productionServedHtmlPaths,
  rootDir,
  listProjectRelativePaths
} = require('./frontend-validation-utils');

const shippedHtmlFiles = listProjectRelativePaths(productionServedHtmlPaths);

describe('Production frontend CSP contract', () => {
  it('should keep every backend-served HTML page free of inline script blocks', () => {
    shippedHtmlFiles.forEach((relativePath) => {
      const source = fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
      expect(source).not.toMatch(hardeningPatterns.inlineScript);
    });
  });

  it('should keep every backend-served HTML page free of inline handlers', () => {
    const pagesWithInlineHandlers = shippedHtmlFiles.filter((relativePath) => {
      const source = fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
      return hardeningPatterns.inlineHtmlHandler.test(source);
    });

    expect(pagesWithInlineHandlers).toEqual([]);
  });

  it('should keep the offline fallback page on external JS listeners only', () => {
    const source = fs.readFileSync(path.join(rootDir, 'client/public/shared/offline.html'), 'utf8');

    expect(source).toContain('<script src="/js/offline.js"></script>');
    expect(source).toContain('id="retryButton"');
    expect(source).not.toContain('onclick=');
  });

  it('should keep the auth setup helper page on external JS listeners only', () => {
    const source = fs.readFileSync(path.join(rootDir, 'client/public/shared/auth-setup.html'), 'utf8');

    expect(source).toContain('<script src="/js/auth-setup.js"></script>');
    expect(source).toContain('id="setupTestAuthBtn"');
    expect(source).toContain('id="goToDashboardBtn"');
    expect(source).toContain('id="clearAuthBtn"');
    expect(source).not.toMatch(hardeningPatterns.inlineScript);
    expect(source).not.toMatch(hardeningPatterns.inlineHtmlHandler);
  });
});
