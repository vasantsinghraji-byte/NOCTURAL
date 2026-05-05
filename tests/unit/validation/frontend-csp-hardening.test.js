const path = require('path');
const {
  fs,
  hardeningPatterns,
  roleHtmlFilePaths,
  rootDir,
  listProjectRelativePaths
} = require('./frontend-validation-utils');

const roleHtmlFiles = listProjectRelativePaths(roleHtmlFilePaths);

describe('Frontend CSP Hardening', () => {
  it('should keep every role HTML page free of inline script blocks', () => {
    roleHtmlFiles.forEach((relativePath) => {
      const source = fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
      expect(source).not.toMatch(hardeningPatterns.inlineScript);
    });
  });

  it('should keep every role HTML page free of inline handlers', () => {
    const pagesWithInlineHandlers = roleHtmlFiles.filter((relativePath) => {
      const source = fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
      return hardeningPatterns.inlineHtmlHandler.test(source);
    }).sort();

    expect(pagesWithInlineHandlers).toEqual([]);
  });

  it('should keep every role HTML page free of inline styles', () => {
    const pagesWithInlineStyles = [];

    roleHtmlFiles.forEach((relativePath) => {
      const source = fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
      const matches = source.match(hardeningPatterns.inlineStyle);
      if (matches && matches.length) {
        pagesWithInlineStyles.push(relativePath);
      }
    });

    expect(pagesWithInlineStyles).toEqual([]);
  });
});
