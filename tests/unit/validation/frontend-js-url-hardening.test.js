const {
  fs,
  frontendJsFilePaths,
  hardeningPatterns,
  roleHtmlFilePaths,
  toProjectRelativePath
} = require('./frontend-validation-utils');

describe('Frontend JS URL Hardening', () => {
  it('should keep generated frontend markup free of javascript: URLs', () => {
    const offendingScripts = frontendJsFilePaths.filter((scriptPath) => {
      const source = fs.readFileSync(scriptPath, 'utf8');
      return hardeningPatterns.unsafeJavascriptUrl.test(source);
    }).map(toProjectRelativePath);

    expect(offendingScripts).toEqual([]);
  });

  it('should keep role HTML templates free of javascript: URLs', () => {
    const offendingTemplates = roleHtmlFilePaths.filter((filePath) => {
      const source = fs.readFileSync(filePath, 'utf8');
      return hardeningPatterns.unsafeJavascriptUrl.test(source);
    }).map(toProjectRelativePath);

    expect(offendingTemplates).toEqual([]);
  });
});
