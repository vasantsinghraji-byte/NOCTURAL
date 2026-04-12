const path = require('path');
const {
  fs,
  buildOutputHtmlPaths,
  distDir,
  hardeningPatterns,
  rootDir,
  listProjectRelativePaths
} = require('./frontend-validation-utils');

describe('Frontend build output CSP contract', () => {
  it('should produce built HTML output before validating the shipped artifact', () => {
    expect(fs.existsSync(distDir)).toBe(true);
    expect(buildOutputHtmlPaths.length).toBeGreaterThan(0);
  });

  it('should keep built HTML output free of inline script blocks', () => {
    const builtHtmlFiles = listProjectRelativePaths(buildOutputHtmlPaths);

    builtHtmlFiles.forEach((relativePath) => {
      const source = fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
      expect(source).not.toMatch(hardeningPatterns.inlineScript);
    });
  });

  it('should keep built HTML output free of inline handlers', () => {
    const builtHtmlFiles = listProjectRelativePaths(buildOutputHtmlPaths);

    const pagesWithInlineHandlers = builtHtmlFiles.filter((relativePath) => {
      const source = fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
      return hardeningPatterns.inlineHtmlHandler.test(source);
    });

    expect(pagesWithInlineHandlers).toEqual([]);
  });
});
